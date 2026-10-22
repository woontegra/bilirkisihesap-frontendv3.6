import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal, flushSync } from "react-dom";
import { Button } from "@/components/ui/Button";
import { trackYandexGoal } from "@/analytics/yandexMetrica";
import {
  findTourTarget,
  isInsideTourTarget,
  layoutBubble,
  readTargetRect,
  scrollTargetIntoView,
  type Placement,
  type Rect,
} from "./geometry";
import { hasForeignLayer, TOUR_ROOT_ATTR, useForeignLayerOpen } from "./layers";
import { markAutoWelcomeSeen, shouldOfferWelcome } from "./storage";
import { isMoneyInput, MONEY_TYPING_IDLE_MS, scheduleReadyCheck } from "./autoAdvance";
import type { GuidedTourDefinition, GuidedTourStep, GuidedTourStepMode } from "./types";
import styles from "./GuidedTour.module.css";

/** StrictMode / eşzamanlı host: yalnızca son planlanan offer geçerli olsun. */
let autoWelcomeOfferEpoch = 0;

type Props = {
  definition: GuidedTourDefinition;
  offerWelcomeOnMount?: boolean;
  active: boolean;
  onActiveChange: (active: boolean) => void;
  welcomeOpen: boolean;
  onWelcomeOpenChange: (open: boolean) => void;
  welcomeTitle: string;
  welcomeBody: string;
  welcomeStartLabel?: string;
  welcomeLaterLabel?: string;
  /** @deprecated Global welcome; “Bir daha gösterme” kaldırıldı. */
  welcomeNeverLabel?: string;
  onCollectingComplete?: () => void;
  onDismiss?: () => void;
  initialStepIndex?: number;
  /** Fired once when the tour becomes active (welcome Başlat or openTour). */
  onTourStarted?: () => void;
  /**
   * Hide spotlight while a page modal (e.g. preview) is open; tour stays active.
   * aria-modal modallar ve `data-tour-pause` panelleri ayrıca otomatik algılanır.
   */
  paused?: boolean;
};

const MISSING_TARGET_HINT =
  "Bu adımın alanı şu anda sayfada görünmüyor. Adımı atlayabilir veya kılavuzu kapatabilirsiniz.";

function paddedRect(r: Rect): Rect {
  return { top: r.top - 6, left: r.left - 6, width: r.width + 12, height: r.height + 12 };
}

function sameRect(a: Rect | null, b: Rect): boolean {
  return (
    !!a &&
    Math.abs(a.top - b.top) < 0.5 &&
    Math.abs(a.left - b.left) < 0.5 &&
    Math.abs(a.width - b.width) < 0.5 &&
    Math.abs(a.height - b.height) < 0.5
  );
}

function visibleSteps(def: GuidedTourDefinition): GuidedTourStep[] {
  const ctx = { getTargetEl: findTourTarget };
  return def.steps.filter((s) => !s.when || s.when(ctx));
}

function stepMode(step: GuidedTourStep): GuidedTourStepMode {
  return step.mode ?? (step.autoAdvance ? "auto" : "finish");
}

export function GuidedTourHost({
  definition,
  offerWelcomeOnMount = true,
  active,
  onActiveChange,
  welcomeOpen,
  onWelcomeOpenChange,
  welcomeTitle,
  welcomeBody,
  welcomeStartLabel = "Başlat",
  welcomeLaterLabel = "Kendim devam edeceğim",
  onCollectingComplete,
  onDismiss,
  initialStepIndex = 0,
  onTourStarted,
  paused: pausedProp = false,
}: Props) {
  const steps = useMemo(() => visibleSteps(definition), [definition]);
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [placement, setPlacement] = useState<Placement>("bottom");
  const [bubblePos, setBubblePos] = useState({ top: 24, left: 24 });
  const [gateWarn, setGateWarn] = useState<string | null>(null);
  const [targetMissing, setTargetMissing] = useState(false);
  const [applyNonce, setApplyNonce] = useState(0);
  const lastRectRef = useRef<Rect | null>(null);
  const foreignLayerOpen = useForeignLayerOpen(active);
  const paused = pausedProp || foreignLayerOpen;
  const appliedStepRef = useRef<string | null>(null);

  const bubbleRef = useRef<HTMLDivElement | null>(null);
  const activeTargetRef = useRef<HTMLElement | null>(null);
  const offeredRef = useRef(false);
  const welcomeStartingRef = useRef(false);
  const wasActiveRef = useRef(false);
  const userEditedRef = useRef(false);
  const advancingRef = useRef(false);
  const debounceTimerRef = useRef<number | null>(null);
  const indexRef = useRef(0);
  const stepsRef = useRef(steps);
  const pendingStartIndexRef = useRef<number | null>(null);
  const advanceToRef = useRef<(nextIndex: number) => void>(() => {});

  const safeIndex = Math.min(index, Math.max(0, steps.length - 1));
  const step = steps[safeIndex] ?? null;
  const mode = step ? stepMode(step) : "finish";
  const isLast = safeIndex >= steps.length - 1;

  indexRef.current = index;
  stepsRef.current = steps;

  const clearTimers = useCallback(() => {
    if (debounceTimerRef.current != null) {
      window.clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
  }, []);

  const clearActiveAttr = useCallback(() => {
    if (activeTargetRef.current) {
      activeTargetRef.current.removeAttribute("data-tour-active");
      activeTargetRef.current = null;
    }
  }, []);

  const closeTour = useCallback(() => {
    clearTimers();
    advancingRef.current = false;
    userEditedRef.current = false;
    clearActiveAttr();
    setRect(null);
    onActiveChange(false);
    onDismiss?.();
  }, [clearActiveAttr, clearTimers, onActiveChange, onDismiss]);

  const finishCollecting = useCallback(() => {
    clearTimers();
    advancingRef.current = false;
    userEditedRef.current = false;
    clearActiveAttr();
    setRect(null);
    onActiveChange(false);
    onCollectingComplete?.();
  }, [clearActiveAttr, clearTimers, onActiveChange, onCollectingComplete]);

  const advanceTo = useCallback(
    (nextIndex: number) => {
      if (advancingRef.current) return;
      advancingRef.current = true;
      clearTimers();
      userEditedRef.current = false;
      setGateWarn(null);
      if (nextIndex >= stepsRef.current.length) {
        finishCollecting();
        return;
      }
      setIndex(nextIndex);
      window.requestAnimationFrame(() => {
        advancingRef.current = false;
      });
    },
    [clearTimers, finishCollecting],
  );

  advanceToRef.current = advanceTo;

  const goNext = useCallback(() => {
    setGateWarn(null);
    if (isLast) {
      finishCollecting();
      return;
    }
    advanceTo(safeIndex + 1);
  }, [advanceTo, finishCollecting, isLast, safeIndex]);

  const goPrev = useCallback(() => {
    clearTimers();
    advancingRef.current = false;
    userEditedRef.current = false;
    setGateWarn(null);
    setIndex((i) => Math.max(0, i - 1));
  }, [clearTimers]);

  const tryOptionalConfirm = useCallback(() => {
    if (!step) return;
    if (step.optionalConfirmReady && !step.optionalConfirmReady()) {
      setGateWarn(
        step.optionalConfirmBlockedHint ??
          "Bu adımı tamamlamak için gerekli alanları doldurun.",
      );
      return;
    }
    setGateWarn(null);
    goNext();
  }, [goNext, step]);

  /** manual İleri — autoAdvance.isReady ile aynı kapı (Atla yokken zorunlu alanlar). */
  const tryManualAdvance = useCallback(() => {
    if (!step) return;
    const readyFn = step.autoAdvance?.isReady;
    if (readyFn && !readyFn()) {
      setGateWarn(
        step.advanceBlockedHint ?? "Bu adımı tamamlamak için gerekli alanları doldurun.",
      );
      return;
    }
    setGateWarn(null);
    goNext();
  }, [goNext, step]);

  useEffect(() => {
    setGateWarn(null);
  }, [step?.id]);

  const startTour = useCallback(() => {
    if (welcomeStartingRef.current) return;
    welcomeStartingRef.current = true;
    markAutoWelcomeSeen();
    clearTimers();
    advancingRef.current = false;
    userEditedRef.current = false;
    pendingStartIndexRef.current = 0;
    onWelcomeOpenChange(false);
    onActiveChange(true);
  }, [clearTimers, onActiveChange, onWelcomeOpenChange]);

  useEffect(() => {
    if (active && !wasActiveRef.current) {
      onTourStarted?.();
      trackYandexGoal("guide_open");
      clearTimers();
      advancingRef.current = false;
      userEditedRef.current = false;
      const max = Math.max(0, stepsRef.current.length - 1);
      const start = pendingStartIndexRef.current ?? initialStepIndex;
      pendingStartIndexRef.current = null;
      setIndex(Math.min(Math.max(0, start), max));
    }
    if (!active) welcomeStartingRef.current = false;
    wasActiveRef.current = active;
  }, [active, clearTimers, initialStepIndex, onTourStarted]);

  const dismissWelcome = useCallback(() => {
    markAutoWelcomeSeen();
    welcomeStartingRef.current = false;
    onWelcomeOpenChange(false);
  }, [onWelcomeOpenChange]);

  useEffect(() => {
    if (!offerWelcomeOnMount) return;
    if (!shouldOfferWelcome()) return;

    const epoch = ++autoWelcomeOfferEpoch;
    const raf = window.requestAnimationFrame(() => {
      if (epoch !== autoWelcomeOfferEpoch) return;
      if (!shouldOfferWelcome()) return;
      if (offeredRef.current) return;
      offeredRef.current = true;
      onWelcomeOpenChange(true);
    });

    return () => {
      window.cancelAnimationFrame(raf);
      // Route değişimi / unmount: karşılama açık kalmasın (StrictMode’da remount yeniden planlar).
      if (epoch === autoWelcomeOfferEpoch) {
        onWelcomeOpenChange(false);
      }
    };
  }, [definition.id, offerWelcomeOnMount, onWelcomeOpenChange]);

  /* Spotlight sync — skip while paused (page modal open) */
  useLayoutEffect(() => {
    appliedStepRef.current = null;
    setTargetMissing(false);
    if (!active || paused || !step) {
      clearActiveAttr();
      if (!active || paused) setRect(null);
      return;
    }

    let cancelled = false;
    /** apply() ilk await'e kadar bu etkinin içinde eşzamanlı çalışır. */
    let inEffect = true;
    const markMissing = () => {
      clearActiveAttr();
      setRect(null);
      setTargetMissing(true);
    };
    const apply = async () => {
      // Hedef henüz mount olmamış veya gizli olabilir — kısa süre bekle; bulunamazsa açıklama + Atla/Kapat.
      let el: HTMLElement | null = null;
      for (let attempt = 0; attempt < 30; attempt += 1) {
        if (cancelled) return;
        const found = findTourTarget(step.target);
        if (found && readTargetRect(found)) {
          el = found;
          break;
        }
        await new Promise<void>((resolve) => {
          window.setTimeout(resolve, 50);
        });
      }
      if (cancelled) return;
      if (!el) {
        markMissing();
        return;
      }
      setTargetMissing(false);

      // Kaydırmadan önce işaretle: konum takibi vurguyu kaydırma boyunca yeni hedefle taşır.
      const mark = (target: HTMLElement, r: Rect) => {
        if (activeTargetRef.current !== target) {
          clearActiveAttr();
          target.setAttribute("data-tour-active", "true");
          activeTargetRef.current = target;
        }
        appliedStepRef.current = step.id;
        const next = paddedRect(r);
        lastRectRef.current = next;
        // Etki dışında (bekleme/kaydırma sonrası) aynı karede çizilmeli; yoksa vurgu bir kare eski konumda kalır.
        if (inEffect) setRect(next);
        else flushSync(() => setRect(next));
      };
      const before = readTargetRect(el);
      if (before) mark(el, before);

      await scrollTargetIntoView(el, step.scroll ?? "center");
      if (cancelled) return;
      el = findTourTarget(step.target);
      const r = readTargetRect(el);
      if (!el || !r) {
        markMissing();
        return;
      }
      mark(el, r);
    };

    void apply();
    inEffect = false;
    return () => {
      cancelled = true;
    };
  }, [active, paused, step, clearActiveAttr, applyNonce]);

  /* Hedef sonradan görünür olursa adımı yeniden uygula. */
  useEffect(() => {
    if (!active || paused || !step || !targetMissing) return;
    const id = window.setInterval(() => {
      if (readTargetRect(findTourTarget(step.target))) setApplyNonce((n) => n + 1);
    }, 400);
    return () => window.clearInterval(id);
  }, [active, paused, step, targetMissing]);

  /**
   * Konum takibi: kaydırma, yeniden boyutlanma ve yerleşim kaymaları her karede izlenir.
   * Hedef yeniden oluşturulursa (React remount) vurgu yeni öğeye taşınır.
   */
  useEffect(() => {
    if (!active || paused || !step || targetMissing) return;
    let raf = 0;
    let cached: HTMLElement | null = null;
    let lastVw = window.innerWidth;
    let lastVh = window.innerHeight;
    const tick = () => {
      raf = window.requestAnimationFrame(tick);
      if (appliedStepRef.current !== step.id) return;
      if (!cached || !cached.isConnected) cached = findTourTarget(step.target);
      const el = cached;
      if (!el) return;
      if (activeTargetRef.current !== el) {
        clearActiveAttr();
        el.setAttribute("data-tour-active", "true");
        activeTargetRef.current = el;
      }
      const r = readTargetRect(el);
      if (!r) return;
      const next = paddedRect(r);
      const viewportChanged = lastVw !== window.innerWidth || lastVh !== window.innerHeight;
      if (!viewportChanged && sameRect(lastRectRef.current, next)) return;
      lastRectRef.current = next;
      lastVw = window.innerWidth;
      lastVh = window.innerHeight;
      // Aynı karede çiz: vurgu ve balon kaydırma sırasında hedefin gerisinde kalmaz.
      flushSync(() => setRect(next));
    };
    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [active, paused, step, targetMissing, clearActiveAttr]);

  /* Balon: hedefle çakışmayan, ekran içinde kalan konum. */
  useLayoutEffect(() => {
    if (!active || paused || !bubbleRef.current) return;
    if (!rect && !targetMissing) return;
    const box = bubbleRef.current.getBoundingClientRect();
    const layout = layoutBubble(
      targetMissing ? null : rect,
      step?.placement ?? "auto",
      window.innerWidth,
      window.innerHeight,
      box.width || 320,
      box.height || 200,
      placement,
    );
    setPlacement(layout.placement);
    setBubblePos((prev) =>
      Math.abs(prev.top - layout.top) < 0.5 && Math.abs(prev.left - layout.left) < 0.5
        ? prev
        : { top: layout.top, left: layout.left },
    );
  }, [active, paused, rect, placement, targetMissing, gateWarn, step?.id, step?.placement, mode]);

  /**
   * Escape — yalnızca en üstteki katman: açık bir modal/panel varsa tuş ona bırakılır
   * (yakalama aşamasında, sayfa dinleyicilerinden önce karar verilir).
   */
  useEffect(() => {
    if (!active && !welcomeOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (welcomeOpen) {
        e.preventDefault();
        e.stopPropagation();
        dismissWelcome();
        return;
      }
      if (paused || hasForeignLayer()) return;
      const focused = document.activeElement;
      if (focused instanceof HTMLElement && focused.getAttribute("aria-expanded") === "true") return;
      e.preventDefault();
      e.stopPropagation();
      closeTour();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [active, welcomeOpen, paused, closeTour, dismissWelcome]);

  /**
   * Auto-advance — single mechanism:
   * - Listen to trusted input/change/keyup in capture (blur NOT required)
   * - Debounce, then poll live DOM readiness briefly (controlled/native date lag)
   * - Only after user edit on THIS step visit (geri sonrası anında fırlamaz)
   * - Works for `auto`, `manual`, and `optional` steps that declare `autoAdvance`
   * - Effect deps avoid full `step` object so parent re-renders don't clear timers mid-type
   */
  useEffect(() => {
    if (!active || paused || !step?.autoAdvance) return;
    if (mode !== "auto" && mode !== "manual" && mode !== "optional") return;

    const stepIndex = safeIndex;
    const delayMs = step.autoAdvance.delayMs ?? 500;
    const isReady = step.autoAdvance.isReady;
    let cancelled = false;

    userEditedRef.current = false;
    clearTimers();

    const tryAdvance = () => {
      if (cancelled || advancingRef.current) return;
      if (indexRef.current !== stepIndex) return;
      if (!userEditedRef.current) return;
      if (!isReady()) return;
      advanceToRef.current(stepIndex + 1);
    };

    const schedule = (waitMs: number) => {
      if (cancelled || advancingRef.current) return;
      if (indexRef.current !== stepIndex) return;
      clearTimers();
      scheduleReadyCheck({
        delayMs: waitMs,
        isReady,
        onReady: tryAdvance,
        isCancelled: () =>
          cancelled || advancingRef.current || indexRef.current !== stepIndex || !userEditedRef.current,
        setTimer: (id) => {
          debounceTimerRef.current = id;
        },
      });
    };

    const targetName = step.target;

    const onUserEdit = (e: Event) => {
      if (!e.isTrusted) return;
      if (indexRef.current !== stepIndex) return;
      if (!isInsideTourTarget(e.target, targetName)) return;
      const t = e.target;
      if (t instanceof Element && !t.closest("input, textarea, select, [contenteditable=true]")) {
        return;
      }
      userEditedRef.current = true;
      const waitMs = isMoneyInput(t) ? Math.max(delayMs, MONEY_TYPING_IDLE_MS) : delayMs;
      window.requestAnimationFrame(() => {
        if (cancelled) return;
        schedule(waitMs);
      });
    };

    /** Blur / Enter: geçerli değer varsa debounce beklemeden ilerle (Kıdem/İhbar ücret adımı). */
    const onCommit = (e: Event) => {
      if (!e.isTrusted) return;
      if (indexRef.current !== stepIndex) return;
      if (!isInsideTourTarget(e.target, targetName)) return;
      const t = e.target;
      if (t instanceof Element && !t.closest("input, textarea, select, [contenteditable=true]")) {
        return;
      }
      if (e instanceof KeyboardEvent && e.key !== "Enter") return;
      userEditedRef.current = true;
      clearTimers();
      window.requestAnimationFrame(() => {
        if (cancelled) return;
        tryAdvance();
      });
    };

    // Belge düzeyinde dinle: hedef yeniden oluşturulsa veya geç mount olsa da bağ kopmaz.
    document.addEventListener("input", onUserEdit, true);
    document.addEventListener("change", onUserEdit, true);
    document.addEventListener("keyup", onUserEdit, true);
    document.addEventListener("blur", onCommit, true);
    document.addEventListener("keydown", onCommit, true);

    return () => {
      cancelled = true;
      clearTimers();
      document.removeEventListener("input", onUserEdit, true);
      document.removeEventListener("change", onUserEdit, true);
      document.removeEventListener("keyup", onUserEdit, true);
      document.removeEventListener("blur", onCommit, true);
      document.removeEventListener("keydown", onCommit, true);
    };
  }, [active, paused, mode, safeIndex, step?.id, step?.target, step?.autoAdvance, clearTimers]);

  useEffect(
    () => () => {
      clearTimers();
      clearActiveAttr();
    },
    [clearTimers, clearActiveAttr],
  );

  const renderActions = () => {
    if (!step) return null;

    if (targetMissing) {
      return (
        <div className={styles.actions}>
          <Button variant="soft" size="sm" onClick={closeTour}>
            Kılavuzu kapat
          </Button>
          <span className={styles.actionsSpacer} />
          {safeIndex > 0 ? (
            <Button variant="soft" size="sm" onClick={goPrev}>
              Geri
            </Button>
          ) : null}
          <Button variant="primary" size="sm" onClick={goNext}>
            {isLast ? "Kılavuzu tamamla" : "Atla"}
          </Button>
        </div>
      );
    }

    if (mode === "optional") {
      const skipLabel = step.optionalSkipLabel ?? "Ek ödemem yok";
      const confirmLabel = step.optionalConfirmLabel ?? "Ek ödemeleri tamamladım";
      return (
        <div className={styles.actions}>
          <Button variant="soft" size="sm" onClick={closeTour}>
            Kılavuzu kapat
          </Button>
          <span className={styles.actionsSpacer} />
          <Button variant="soft" size="sm" onClick={goPrev} disabled={safeIndex === 0}>
            Geri
          </Button>
          {!step.optionalHideSkip ? (
            <Button variant="soft" size="sm" onClick={goNext}>
              {skipLabel}
            </Button>
          ) : null}
          <Button variant="primary" size="sm" onClick={tryOptionalConfirm}>
            {confirmLabel}
          </Button>
        </div>
      );
    }

    if (mode === "finish") {
      return (
        <div className={styles.actions}>
          <Button variant="soft" size="sm" onClick={closeTour}>
            Kılavuzu kapat
          </Button>
          <span className={styles.actionsSpacer} />
          <Button variant="soft" size="sm" onClick={goPrev} disabled={safeIndex === 0}>
            Geri
          </Button>
          <Button variant="primary" size="sm" onClick={goNext}>
            Kılavuzu tamamla
          </Button>
        </div>
      );
    }

    if (mode === "manual") {
      return (
        <div className={styles.actions}>
          <Button variant="soft" size="sm" onClick={closeTour}>
            Kılavuzu kapat
          </Button>
          <span className={styles.actionsSpacer} />
          {safeIndex > 0 ? (
            <Button variant="soft" size="sm" onClick={goPrev}>
              Geri
            </Button>
          ) : null}
          {step.skippable !== false ? (
            <Button variant="soft" size="sm" onClick={goNext} disabled={isLast}>
              Atla
            </Button>
          ) : null}
          <Button variant="primary" size="sm" onClick={tryManualAdvance}>
            İleri
          </Button>
        </div>
      );
    }

    // auto: İleri yok (form dolunca kendiliğinden ilerler); kilitlenmemek için Atla
    return (
      <div className={styles.actions}>
        <Button variant="soft" size="sm" onClick={closeTour}>
          Kılavuzu kapat
        </Button>
        <span className={styles.actionsSpacer} />
        {safeIndex > 0 ? (
          <Button variant="soft" size="sm" onClick={goPrev}>
            Geri
          </Button>
        ) : null}
        {step.skippable !== false && !isLast ? (
          <Button variant="soft" size="sm" onClick={goNext}>
            Atla
          </Button>
        ) : null}
      </div>
    );
  };

  const showBubble = Boolean(active && !paused && step && (rect || targetMissing));
  const showSpotlight = showBubble && rect && !targetMissing;

  const layer = (
    <>
      {welcomeOpen ? (
        <div
          className={styles.welcomeOverlay}
          role="dialog"
          aria-modal="true"
          aria-labelledby="guided-tour-welcome-title"
        >
          <div className={styles.welcomeCard}>
            <h2 id="guided-tour-welcome-title" className={styles.welcomeTitle}>
              {welcomeTitle}
            </h2>
            <p className={styles.welcomeBody}>{welcomeBody}</p>
            <div className={styles.welcomeActions}>
              <Button variant="primary" size="sm" onClick={startTour}>
                {welcomeStartLabel}
              </Button>
              <Button variant="soft" size="sm" onClick={dismissWelcome}>
                {welcomeLaterLabel}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {showSpotlight && rect ? (
        <div className={styles.overlayRoot} aria-hidden>
          <div
            className={styles.spotlight}
            style={{
              top: rect.top,
              left: rect.left,
              width: rect.width,
              height: rect.height,
            }}
          />
        </div>
      ) : null}

      {showBubble && step ? (
        <div
          ref={bubbleRef}
          className={styles.bubble}
          data-guided-tour-bubble=""
          role="dialog"
          aria-modal="false"
          aria-live="polite"
          aria-labelledby={`guided-tour-step-${step.id}`}
          style={{ top: bubblePos.top, left: bubblePos.left }}
        >
          <h3 id={`guided-tour-step-${step.id}`} className={styles.bubbleTitle}>
            {step.title}
          </h3>
          <p className={styles.bubbleBody}>{step.body}</p>
          {targetMissing ? (
            <p className={styles.gateWarn} role="status">
              {MISSING_TARGET_HINT}
            </p>
          ) : null}
          {gateWarn ? (
            <p className={styles.gateWarn} role="alert">
              {gateWarn}
            </p>
          ) : null}
          <div className={styles.progress}>
            {safeIndex + 1} / {steps.length}
          </div>
          {renderActions()}
        </div>
      ) : null}
    </>
  );

  if (typeof document === "undefined") return layer;
  return createPortal(<div {...{ [TOUR_ROOT_ATTR]: "" }}>{layer}</div>, document.body);
}
