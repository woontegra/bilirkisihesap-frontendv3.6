import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { trackYandexGoal } from "@/analytics/yandexMetrica";
import {
  findTourTarget,
  pickPlacement,
  placeBubble,
  readTargetRect,
  scrollTargetIntoView,
  type Placement,
  type Rect,
} from "./geometry";
import { markAutoWelcomeSeen, shouldOfferWelcome } from "./storage";
import { scheduleReadyCheck } from "./autoAdvance";
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
  /** Hide spotlight while a page modal (e.g. preview) is open; tour stays active. */
  paused?: boolean;
};

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
  paused = false,
}: Props) {
  const steps = useMemo(() => visibleSteps(definition), [definition]);
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [placement, setPlacement] = useState<Placement>("bottom");
  const [bubblePos, setBubblePos] = useState({ top: 24, left: 24 });
  const [gateWarn, setGateWarn] = useState<string | null>(null);

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

  /* Spotlight sync — skip while paused (preview modal open) */
  useLayoutEffect(() => {
    if (!active || paused || !step) {
      clearActiveAttr();
      if (!active || paused) setRect(null);
      return;
    }

    let cancelled = false;
    const apply = async () => {
      // Hedef henüz mount olmamış olabilir — birkaç kez dene; sessizce sonraki adıma atlama.
      let el: HTMLElement | null = null;
      for (let attempt = 0; attempt < 12; attempt += 1) {
        if (cancelled) return;
        el = findTourTarget(step.target);
        if (el) break;
        await new Promise<void>((resolve) => {
          window.setTimeout(resolve, 40);
        });
      }
      if (!el || cancelled) return;

      await scrollTargetIntoView(el, step.scroll ?? "center");
      if (cancelled) return;
      el = findTourTarget(step.target);
      if (!el) return;

      clearActiveAttr();
      el.setAttribute("data-tour-active", "true");
      activeTargetRef.current = el;

      const r = readTargetRect(el);
      if (!r) return;
      const place = pickPlacement(r, step.placement ?? "auto", window.innerWidth, window.innerHeight);
      setPlacement(place);
      setRect({
        top: r.top - 6,
        left: r.left - 6,
        width: r.width + 12,
        height: r.height + 12,
      });
    };

    void apply();
    return () => {
      cancelled = true;
    };
  }, [active, paused, step, clearActiveAttr]);

  useLayoutEffect(() => {
    if (!active || paused || !rect || !bubbleRef.current) return;
    const bubbleH = bubbleRef.current.getBoundingClientRect().height || 200;
    const bubbleW = bubbleRef.current.getBoundingClientRect().width || 320;
    setBubblePos(placeBubble(rect, placement, window.innerWidth, window.innerHeight, bubbleW, bubbleH));
  }, [active, paused, rect, placement, step?.id, mode]);

  useEffect(() => {
    if (!active || paused || !step) return;
    const update = () => {
      const el = findTourTarget(step.target);
      const r = readTargetRect(el);
      if (!r) return;
      setRect({
        top: r.top - 6,
        left: r.left - 6,
        width: r.width + 12,
        height: r.height + 12,
      });
    };
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    const targetEl = findTourTarget(step.target);
    let ro: ResizeObserver | null = null;
    if (targetEl && typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(() => update());
      ro.observe(targetEl);
    }
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
      ro?.disconnect();
    };
  }, [active, paused, step]);

  useEffect(() => {
    if (!active && !welcomeOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        if (welcomeOpen) dismissWelcome();
        else if (!paused) closeTour();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
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

    const schedule = () => {
      if (cancelled || advancingRef.current) return;
      if (indexRef.current !== stepIndex) return;
      clearTimers();
      scheduleReadyCheck({
        delayMs,
        isReady,
        onReady: tryAdvance,
        isCancelled: () =>
          cancelled || advancingRef.current || indexRef.current !== stepIndex || !userEditedRef.current,
        setTimer: (id) => {
          debounceTimerRef.current = id;
        },
      });
    };

    const onUserEdit = (e: Event) => {
      if (!e.isTrusted) return;
      if (indexRef.current !== stepIndex) return;
      const t = e.target;
      if (t instanceof Element && !t.closest("input, textarea, select, [contenteditable=true]")) {
        return;
      }
      userEditedRef.current = true;
      window.requestAnimationFrame(() => {
        if (cancelled) return;
        schedule();
      });
    };

    /** Blur / Enter: geçerli değer varsa debounce beklemeden ilerle (Kıdem/İhbar ücret adımı). */
    const onCommit = (e: Event) => {
      if (!e.isTrusted) return;
      if (indexRef.current !== stepIndex) return;
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

    const el = findTourTarget(step.target);
    if (!el) return;

    el.addEventListener("input", onUserEdit, true);
    el.addEventListener("change", onUserEdit, true);
    el.addEventListener("keyup", onUserEdit, true);
    el.addEventListener("blur", onCommit, true);
    el.addEventListener("keydown", onCommit, true);

    return () => {
      cancelled = true;
      clearTimers();
      el.removeEventListener("input", onUserEdit, true);
      el.removeEventListener("change", onUserEdit, true);
      el.removeEventListener("keyup", onUserEdit, true);
      el.removeEventListener("blur", onCommit, true);
      el.removeEventListener("keydown", onCommit, true);
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

    // auto: no İleri / Devam et / Atla — only close + back
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
      </div>
    );
  };

  const showOverlay = active && !paused && step && rect;

  return (
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

      {showOverlay ? (
        <div className={styles.overlayRoot} aria-live="polite">
          <div
            className={styles.spotlight}
            style={{
              top: rect.top,
              left: rect.left,
              width: rect.width,
              height: rect.height,
            }}
            aria-hidden
          />
          <div
            ref={bubbleRef}
            className={styles.bubble}
            role="dialog"
            aria-modal="false"
            aria-labelledby={`guided-tour-step-${step.id}`}
            style={{ top: bubblePos.top, left: bubblePos.left }}
          >
            <h3 id={`guided-tour-step-${step.id}`} className={styles.bubbleTitle}>
              {step.title}
            </h3>
            <p className={styles.bubbleBody}>{step.body}</p>
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
        </div>
      ) : null}
    </>
  );
}
