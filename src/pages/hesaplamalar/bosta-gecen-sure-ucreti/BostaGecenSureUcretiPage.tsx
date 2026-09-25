import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Calculator,
  CirclePlay,
  Clock,
  Download,
  Eye,
  FilePlus2,
  FolderOpen,
  Plus,
  RefreshCw,
  Save,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { ApiError } from "@/api/client";
import { getSavedCase } from "@/api/savedCases";
import { CalculationPreviewModal, type PreviewSection } from "@/components/calculation-preview";
import { DraftTextInput } from "@/components/form";
import { GuidedTourHost, useGuidedTourController } from "@/components/guided-tour";
import tourStyles from "@/components/guided-tour/GuidedTour.module.css";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { useToast } from "@/context/ToastContext";
import { useCalculationCaseBinding } from "@/hooks/useCalculationCaseBinding";
import { useDeferredFormMemo } from "@/hooks/useDeferredFormMemo";
import {
  BOSTA_GECEN_SURE_TOUR,
  BOSTA_GECEN_SURE_TOUR_WELCOME_BODY,
  BOSTA_GECEN_SURE_TOUR_WELCOME_TITLE,
} from "./guidedTour";
import {
  applyExtraSetItems,
  collectExtraSetItems,
  tryMergeLegacyExtraSets,
} from "@/lib/localExtraSetsHelpers";
import {
  deleteLocalExtraSet,
  listLocalExtraSets,
  type LocalExtraSet,
  upsertLocalExtraSet,
} from "@/lib/localExtraSetsStore";
import {
  bostaGecenSureCaseCrud,
  buildBostaGecenSureSaveResult,
  listBostaGecenSureCasesFromBackend,
  mapBostaFormFromBackend,
  resolveSavedCaseDisplayName,
} from "./backendCase";
import { BOSTA_CARPAN, computeBostaGecenSure, computeEklentiResult, formatMoney } from "./engine";
import { createEmptyForm, newLocalId, NOTE_TEXT, snapshotKey, type BostaForm, type SavedCase } from "./model";
import { clearCorruptCases, deleteCase } from "./storage";
import styles from "./BostaGecenSureUcretiPage.module.css";

const PAGE_TITLE = "Boşta Geçen Süre Ücreti";
const PREVIEW_TITLE = "Boşta Geçen Süre Ücreti Rapor";
const EXTRA_SETS_MODULE_ID = "bosta-gecen-sure-ucreti";

type WageFieldKey = "prim" | "ikramiye" | "yemek";
type EklentiTarget = { kind: "field"; field: WageFieldKey } | { kind: "extra"; id: string };

const WAGE_LABELS: Record<WageFieldKey, string> = {
  prim: "Prim",
  ikramiye: "İkramiye",
  yemek: "Yemek",
};

function eklentiKeyOf(t: EklentiTarget): string {
  return t.kind === "field" ? `field:${t.field}` : `extra:${t.id}`;
}

function emptyMonths(): string[] {
  return Array.from({ length: 12 }, () => "");
}

function FlashValue({ value, className }: { value: string; className?: string }) {
  const [flash, setFlash] = useState(false);
  const prev = useRef(value);
  useEffect(() => {
    if (prev.current !== value) {
      prev.current = value;
      setFlash(true);
      const t = window.setTimeout(() => setFlash(false), 450);
      return () => window.clearTimeout(t);
    }
  }, [value]);
  return (
    <span className={`${className ?? ""} ${flash ? styles.valueFlash : ""}`.trim()}>{value}</span>
  );
}

function AnimatedMoney({ value }: { value: number }) {
  const [display, setDisplay] = useState(value);
  const reduce =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

  useEffect(() => {
    if (reduce) {
      setDisplay(value);
      return;
    }
    const from = display;
    const to = value;
    if (from === to) return;
    const start = performance.now();
    const dur = 380;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / dur);
      const eased = 1 - (1 - t) ** 3;
      setDisplay(from + (to - from) * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- animate from last displayed
  }, [value, reduce]);

  return <>{formatMoney(display)}</>;
}

function NameModal({
  open,
  initial,
  title = "Kaydı adlandır",
  fieldLabel = "Kayıt adı",
  onClose,
  onConfirm,
}: {
  open: boolean;
  initial: string;
  title?: string;
  fieldLabel?: string;
  onClose: () => void;
  onConfirm: (name: string) => void;
}) {
  const [name, setName] = useState(initial);
  useEffect(() => {
    if (open) setName(initial);
  }, [open, initial]);
  if (!open) return null;
  return (
    <div className={styles.modalOverlay} role="dialog" aria-modal="true">
      <div className={styles.modalCard}>
        <h3 className={styles.modalTitle}>{title}</h3>
        <label className={styles.label} htmlFor="bg-save-name">
          {fieldLabel}
        </label>
        <input
          id="bg-save-name"
          className={styles.input}
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter" && name.trim()) onConfirm(name.trim());
          }}
        />
        <div className={styles.modalActions}>
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Vazgeç
          </Button>
          <Button type="button" variant="primary" size="sm" disabled={!name.trim()} onClick={() => onConfirm(name.trim())}>
            Kaydet
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function BostaGecenSureUcretiPage() {
  const { success, error: showError, info: toastInfo } = useToast();
  const tour = useGuidedTourController();
  const [searchParams, setSearchParams] = useSearchParams();
  const caseIdParam = searchParams.get("caseId");
  const backendLoadedCaseIdRef = useRef<string | null>(null);
  const [form, setForm] = useState<BostaForm>(createEmptyForm);
  const [cases, setCases] = useState<SavedCase[]>([]);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeName, setActiveName] = useState<string | null>(null);
  useCalculationCaseBinding(activeId);
  const [baseline, setBaseline] = useState(() => snapshotKey(createEmptyForm()));
  const [nameOpen, setNameOpen] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [confirmNew, setConfirmNew] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [eklentiFor, setEklentiFor] = useState<EklentiTarget | null>(null);
  const [eklentiMonths, setEklentiMonths] = useState<Record<string, string[]>>({});
  const [extraSaveOpen, setExtraSaveOpen] = useState(false);
  const [extraImportOpen, setExtraImportOpen] = useState(false);
  const [savedExtraSets, setSavedExtraSets] = useState<LocalExtraSet[]>([]);
  const [caseSaving, setCaseSaving] = useState(false);

  useEffect(() => {
    document.title = `${PAGE_TITLE} | Bilirkişi Hesap`;
  }, []);

  const setCaseIdParam = useCallback(
    (id: string) => {
      const next = new URLSearchParams(searchParams);
      next.set("caseId", id);
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  const result = useDeferredFormMemo(form, computeBostaGecenSure);
  const dirty = snapshotKey(form) !== baseline;

  const refreshExtraSets = useCallback(async () => {
    setSavedExtraSets(await listLocalExtraSets(EXTRA_SETS_MODULE_ID));
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const merged = await tryMergeLegacyExtraSets(EXTRA_SETS_MODULE_ID);
      if (cancelled) return;
      if (merged && merged.imported > 0) {
        success(`${merged.imported} eski ekstra set hesaba aktarıldı`);
      }
      await refreshExtraSets();
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshExtraSets, success]);

  const hasExtraSetData = !!(form.prim || form.ikramiye || form.yemek) || form.extras.length > 0;

  const openExtraImport = () => {
    void refreshExtraSets().then(() => setExtraImportOpen(true));
  };

  const persistExtraSet = (name: string) => {
    void (async () => {
      try {
        const items = collectExtraSetItems(
        { prim: form.prim, ikramiye: form.ikramiye, yol: "", yemek: form.yemek },
        form.extras,
      );
        await upsertLocalExtraSet(EXTRA_SETS_MODULE_ID, name, items);
        await refreshExtraSets();
        setExtraSaveOpen(false);
        success("Ekstra hesaplamalar kaydedildi");
      } catch (err) {
        showError(err instanceof Error ? err.message : "Kaydedilemedi");
      }
    })();
  };

  const importExtraSet = (set: LocalExtraSet) => {
    const { wage, extras } = applyExtraSetItems(set.data);
    setForm((prev) => ({ ...prev, ...wage, yol: "", extras }));
    setExtraImportOpen(false);
    success("Ekstra hesaplamalar yüklendi");
  };

  const removeExtraSet = (id: string) => {
    void (async () => {
      await deleteLocalExtraSet(EXTRA_SETS_MODULE_ID, id);
      await refreshExtraSets();
      success("Set silindi");
    })();
  };

  const rescanLegacy = async () => {
    const merged = await tryMergeLegacyExtraSets(EXTRA_SETS_MODULE_ID, { force: true });
    await refreshExtraSets();
    if (!merged) {
      success("Hesap setleri kullanılıyor (eski sunucu setleri alınamadı)");
      return;
    }
    success(
      merged.imported > 0
        ? `${merged.imported} set eklendi (${merged.skipped} atlandı)`
        : `Yeni set yok (${merged.skipped} atlandı)`,
    );
  };

  const openEklenti = (target: EklentiTarget) => {
    const key = eklentiKeyOf(target);
    setEklentiMonths((prev) => (prev[key] ? prev : { ...prev, [key]: emptyMonths() }));
    setEklentiFor(target);
  };

  const applyEklenti = () => {
    if (!eklentiFor) return;
    const key = eklentiKeyOf(eklentiFor);
    const months = eklentiMonths[key] ?? emptyMonths();
    const formatted = formatMoney(computeEklentiResult(months) || 0);
    if (eklentiFor.kind === "field") {
      setForm((prev) => ({ ...prev, [eklentiFor.field]: formatted }));
    } else {
      setForm((prev) => ({
        ...prev,
        extras: prev.extras.map((e) => (e.id === eklentiFor.id ? { ...e, value: formatted } : e)),
      }));
    }
    setEklentiFor(null);
  };

  const eklentiKey = eklentiFor ? eklentiKeyOf(eklentiFor) : null;
  const eklentiPreview = eklentiKey ? computeEklentiResult(eklentiMonths[eklentiKey] ?? emptyMonths()) : 0;

  const reloadCases = useCallback(async () => {
    try {
      const items = await listBostaGecenSureCasesFromBackend();
      setStorageError(null);
      setCases(items);
    } catch (error) {
      const message =
        error instanceof ApiError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Kayıtlar yüklenemedi";
      setStorageError(message);
      setCases([]);
    }
  }, []);

  useEffect(() => {
    reloadCases();
  }, [reloadCases]);

  useEffect(() => {
    if (!caseIdParam) {
      backendLoadedCaseIdRef.current = null;
      return;
    }
    if (backendLoadedCaseIdRef.current === caseIdParam) return;
    const numericId = Number(caseIdParam);
    if (!Number.isFinite(numericId) || numericId <= 0) {
      showError("Geçersiz kayıt kimliği");
      return;
    }
    let cancelled = false;
    void getSavedCase(numericId)
      .then((record) => {
        if (cancelled) return;
        const mapped = mapBostaFormFromBackend(record.data);
        if (!mapped) {
          showError("Kayıt formu okunamadı");
          return;
        }
        setForm(mapped);
        setActiveId(String(numericId));
        setActiveName(resolveSavedCaseDisplayName(record));
        setBaseline(snapshotKey(mapped));
        backendLoadedCaseIdRef.current = caseIdParam;
        success(`Kayıt yüklendi: ${resolveSavedCaseDisplayName(record)}`);
        const next = new URLSearchParams(searchParams);
        next.delete("caseId");
        setSearchParams(next, { replace: true });
      })
      .catch(() => {
        if (!cancelled) {
          backendLoadedCaseIdRef.current = null;
          showError("Kayıt yüklenemedi");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [caseIdParam, searchParams, setSearchParams, showError, success]);

  const patch = useCallback(<K extends keyof BostaForm>(key: K, value: BostaForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  /** Draft alanlardaki güncel değerleri forma yazar; motor aynı `computeBostaGecenSure` ile çalışmaya devam eder. */
  const handleCalculate = useCallback(() => {
    const read = (id: string, fallback: string) => {
      const el = document.getElementById(id);
      return el instanceof HTMLInputElement ? el.value : fallback;
    };

    const brut = read("bg-brut", form.brut);
    const prim = read("bg-prim", form.prim);
    const ikramiye = read("bg-ikramiye", form.ikramiye);
    const yemek = read("bg-yemek", form.yemek);
    const extras = form.extras.map((it) => ({
      ...it,
      label: read(`bg-extra-label-${it.id}`, it.label),
      value: read(`bg-extra-value-${it.id}`, it.value),
    }));

    const active = document.activeElement;
    if (active instanceof HTMLElement) active.blur();

    setForm((prev) => ({
      ...prev,
      brut,
      prim,
      ikramiye,
      yemek,
      extras,
    }));
  }, [form.brut, form.extras, form.ikramiye, form.prim, form.yemek]);

  const handleNew = useCallback(() => {
    if (dirty) {
      setConfirmNew(true);
      return;
    }
    setForm(createEmptyForm());
    setActiveId(null);
    setActiveName(null);
    setBaseline(snapshotKey(createEmptyForm()));
  }, [dirty]);

  const doNew = useCallback(() => {
    setConfirmNew(false);
    setForm(createEmptyForm());
    setActiveId(null);
    setActiveName(null);
    setBaseline(snapshotKey(createEmptyForm()));
  }, []);

  const persist = useCallback(
    async (name: string, existingId?: string | null) => {
      if (!(result.brutAmount > 0)) {
        showError("Önce geçerli bir hesaplama yapın");
        return;
      }
      setCaseSaving(true);
      const wasUpdate = !!(existingId && /^\d+$/.test(existingId));
      try {
        const record = await bostaGecenSureCaseCrud.saveCase(
          name,
          form,
          buildBostaGecenSureSaveResult({
            toplamBrut: result.toplamBrut,
            brutAmount: result.brutAmount,
            netAmount: result.netAmount,
          }),
          existingId,
        );
        const recordId = String(record.id);
        setActiveId(recordId);
        setActiveName(resolveSavedCaseDisplayName(record));
        setBaseline(snapshotKey(form));
        setCaseIdParam(recordId);
        backendLoadedCaseIdRef.current = recordId;
        await reloadCases();
        success(wasUpdate ? "Kayıt güncellendi" : "Kayıt kaydedildi");
        setNameOpen(false);
      } catch (error) {
        showError(
          error instanceof ApiError
            ? error.message
            : error instanceof Error
              ? error.message
              : "Kayıt yapılamadı",
        );
      } finally {
        setCaseSaving(false);
      }
    },
    [form, result, reloadCases, setCaseIdParam, showError, success],
  );

  const handleSaveClick = useCallback(() => {
    if (!(result.brutAmount > 0)) {
      showError("Önce geçerli bir hesaplama yapın");
      return;
    }
    if (activeId && activeName && /^\d+$/.test(activeId)) {
      void persist(activeName, activeId);
      return;
    }
    setNameOpen(true);
  }, [activeId, activeName, persist, result.brutAmount, showError]);

  const openCase = useCallback(
    (c: SavedCase) => {
      const next = { ...createEmptyForm(), ...c.form };
      setForm(next);
      setActiveId(c.id);
      setActiveName(c.name);
      setBaseline(snapshotKey(next));
      setListOpen(false);
      success(`Kayıt açıldı: ${c.name}`);
    },
    [success],
  );

  const doDelete = useCallback(async () => {
    if (!confirmDeleteId) return;
    try {
      if (/^\d+$/.test(confirmDeleteId)) {
        await bostaGecenSureCaseCrud.removeCase(confirmDeleteId);
      } else {
        deleteCase(confirmDeleteId);
      }
      if (activeId === confirmDeleteId) {
        setActiveId(null);
        setActiveName(null);
      }
      setConfirmDeleteId(null);
      await reloadCases();
      success("Kayıt silindi");
    } catch (error) {
      showError(
        error instanceof ApiError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Kayıt silinemedi",
      );
    }
  }, [activeId, confirmDeleteId, reloadCases, showError, success]);

  const addExtra = useCallback(() => {
    setForm((prev) => ({ ...prev, extras: [...prev.extras, { id: newLocalId("extra"), label: "", value: "" }] }));
  }, []);

  const updateExtra = useCallback((id: string, patchValue: Partial<{ label: string; value: string }>) => {
    setForm((prev) => ({
      ...prev,
      extras: prev.extras.map((it) => (it.id === id ? { ...it, ...patchValue } : it)),
    }));
  }, []);

  const removeExtra = useCallback((id: string) => {
    setForm((prev) => ({ ...prev, extras: prev.extras.filter((it) => it.id !== id) }));
  }, []);

  const previewSections = useMemo((): PreviewSection[] => {
    return [
      {
        id: "genel",
        title: "Genel Bilgiler",
        headers: ["Alan", "Değer"],
        rows: [
          ["Aylık Toplam Ücret", `${formatMoney(result.toplamBrut)} ₺`],
          ["Hesaplama Süresi", `${BOSTA_CARPAN} Ay`],
          [
            "Brüt Boşta Geçen Süre Ücreti",
            result.brutAmount > 0 ? `${formatMoney(result.brutAmount)} ₺` : "—",
          ],
        ],
      },
      {
        id: "hesap",
        title: "Boşta Geçen Süre Ücreti Hesaplama Detayı",
        headers: ["Kalem", "Değer"],
        rows: [
          [
            "Brüt Boşta Geçen Süre Ücreti",
            `${formatMoney(result.toplamBrut)} ₺ × ${BOSTA_CARPAN} = ${formatMoney(result.brutAmount)} ₺`,
          ],
        ],
        lastRowTone: "blue",
      },
      {
        id: "brutten-nete",
        title: "Brütten Nete",
        headers: ["Kalem", "Tutar"],
        rows: [
          ["Brüt Boşta Geçen Süre Ücreti", `${formatMoney(result.brutAmount)} ₺`],
          ["SGK Primi (%14)", `−${formatMoney(result.sgk)} ₺`],
          ["İşsizlik Primi (%1)", `−${formatMoney(result.issizlik)} ₺`],
          [`Gelir Vergisi ${result.gelirVergisiDilimleri}`.trim(), `−${formatMoney(result.gelirVergisi)} ₺`],
          ["Damga Vergisi (Binde 7,59)", `−${formatMoney(result.damgaVergisi)} ₺`],
          ["Net Boşta Geçen Süre Ücreti", `${formatMoney(result.netAmount)} ₺`],
        ],
        lastRowTone: "green",
      },
    ];
  }, [result]);

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div className={styles.heroMain}>
          <div className={styles.heroIcon} aria-hidden>
            <Clock size={20} />
          </div>
          <div style={{ minWidth: 0 }}>
            <h1 className={styles.title}>{PAGE_TITLE}</h1>
            <p className={styles.desc}>
              İş güvencesi kapsamındaki işçiler için genellikle 4 aylık giydirilmiş brüt üzerinden hesaplanır; SGK,
              işsizlik, gelir ve damga vergisi kesintileri uygulanır.
            </p>
            <div className={styles.privacyBadge}>
              <ShieldCheck size={12} /> Veriler hesabınıza güvenli şekilde kaydedilir
            </div>
          </div>
        </div>
        <div className={styles.heroAside}>
          {activeName ? (
            <div className={styles.recordBadge}>
              <span>{activeName}</span>
            </div>
          ) : null}
          <div className={styles.quickTotal}>
            <span>Brüt ücret</span>
            <span className={styles.quickTotalValue}>
              <AnimatedMoney value={result.brutAmount} /> ₺
            </span>
          </div>
          <div className={styles.heroActions}>
            <Button
              type="button"
              variant="soft"
              size="sm"
              className={tourStyles.howToBtn}
              onClick={() => tour.openTour(0)}
              aria-label="Nasıl kullanılır? Etkileşimli kılavuzu başlat"
            >
              <CirclePlay size={14} /> Nasıl kullanılır?
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setListOpen(true)}>
              <FolderOpen size={14} /> Kayıtlar
            </Button>
            <Button type="button" variant="soft" size="sm" onClick={handleNew}>
              <FilePlus2 size={14} /> Yeni Hesaplama
            </Button>
          </div>
        </div>
      </header>

      {storageError ? (
        <div className={styles.storageBanner}>
          {storageError}{" "}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              clearCorruptCases();
              setStorageError(null);
              reloadCases();
            }}
          >
            Temizle
          </Button>
        </div>
      ) : null}

      <div className={styles.layout}>
        <div style={{ display: "grid", gap: "0.85rem", minWidth: 0 }}>
          <form
            className={styles.calcForm}
            onSubmit={(e) => {
              e.preventDefault();
              handleCalculate();
            }}
          >
            <section className={styles.card}>
              <div className={styles.cardHead}>
                <Calculator size={16} />
                <h2 className={styles.cardTitle}>Ücret bilgileri</h2>
              </div>
              <p className={styles.cardHint}>
                Aylık giydirilmiş brüt ücret; boşta geçen süre ücreti {BOSTA_CARPAN} aylık brüt üzerinden
                hesaplanır.
              </p>
              <div className={styles.field} data-tour="bosta-gecen-sure-ucret">
                <label className={styles.label} htmlFor="bg-brut">
                  Çıplak brüt ücret
                </label>
                <DraftTextInput
                  id="bg-brut"
                  className={styles.input}
                  inputMode="decimal"
                  placeholder="Örn: 25.000"
                  value={form.brut}
                  onCommit={(value) => patch("brut", value)}
                />
              </div>

              <div className={styles.extraSection} data-tour="bosta-gecen-sure-kalemler">
                <div className={styles.cardTitleRow}>
                  <h3 className={styles.extraSectionTitle}>Ekstra Hesaplamalar</h3>
                  <div className={styles.inlineActions}>
                    <Button type="button" variant="soft" size="sm" onClick={openExtraImport}>
                      <Download size={14} /> İçe Aktar
                    </Button>
                    <Button
                      type="button"
                      variant="soft"
                      size="sm"
                      onClick={() => setExtraSaveOpen(true)}
                      disabled={!hasExtraSetData}
                    >
                      <Save size={14} /> Kaydet
                    </Button>
                  </div>
                </div>
                <p className={styles.cardHint}>Ekstra Hesaplamalar (Prim, İkramiye, Yemek vb.)</p>
                <div className={styles.wageGrid}>
                  {(["prim", "ikramiye", "yemek"] as const).map((key) => (
                    <div key={key} className={styles.wageRow}>
                      <label className={styles.label} htmlFor={`bg-${key}`}>
                        {WAGE_LABELS[key]}
                      </label>
                      <DraftTextInput
                        id={`bg-${key}`}
                        className={styles.input}
                        inputMode="decimal"
                        placeholder="0"
                        value={form[key]}
                        onCommit={(value) => patch(key, value)}
                      />
                      <Button
                        type="button"
                        variant="soft"
                        size="sm"
                        onClick={() => openEklenti({ kind: "field", field: key })}
                      >
                        <Calculator size={13} /> Eklenti Hesapla
                      </Button>
                    </div>
                  ))}
                </div>
                {form.extras.length > 0 ? (
                  <div className={styles.extrasGrid} style={{ marginTop: "0.6rem" }}>
                    {form.extras.map((it) => (
                      <div key={it.id} className={styles.extraRow}>
                        <DraftTextInput
                          id={`bg-extra-label-${it.id}`}
                          className={styles.input}
                          placeholder="Kalem adı"
                          value={it.label}
                          onCommit={(value) => updateExtra(it.id, { label: value })}
                        />
                        <DraftTextInput
                          id={`bg-extra-value-${it.id}`}
                          className={styles.input}
                          inputMode="decimal"
                          placeholder="Tutar"
                          value={it.value}
                          onCommit={(value) => updateExtra(it.id, { value })}
                        />
                        <Button
                          type="button"
                          variant="soft"
                          size="sm"
                          onClick={() => openEklenti({ kind: "extra", id: it.id })}
                        >
                          <Calculator size={13} /> Eklenti Hesapla
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label="Kalemi sil"
                          onClick={() => removeExtra(it.id)}
                        >
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : null}
                <Button type="button" variant="ghost" size="sm" onClick={addExtra} style={{ marginTop: "0.6rem" }}>
                  <Plus size={14} /> Ek Ücret Kalemi
                </Button>
              </div>

              <Button type="submit" variant="primary" size="md" className={styles.calcSubmit}>
                <Calculator size={16} /> Hesapla
              </Button>
            </section>
          </form>
        </div>

        <aside className={styles.aside} style={{ display: "grid", gap: "0.85rem", minWidth: 0 }}>
          <section className={styles.card}>
            <div className={styles.cardHead}>
              <h2 className={styles.cardTitle}>Özet</h2>
            </div>
            <div className={styles.lineList}>
              <div className={styles.line}>
                <span>Aylık toplam ücret</span>
                <strong>{formatMoney(result.toplamBrut)} ₺</strong>
              </div>
              <div className={styles.line}>
                <span>Hesaplama süresi</span>
                <strong>{BOSTA_CARPAN} ay</strong>
              </div>
              <div className={styles.line}>
                <span>Brüt ({BOSTA_CARPAN} ay)</span>
                <strong>
                  {formatMoney(result.toplamBrut)} × {BOSTA_CARPAN} = {formatMoney(result.brutAmount)} ₺
                </strong>
              </div>
            </div>
            <div className={`${styles.resultCard} ${styles.resultCardAccent}`} style={{ marginTop: "0.6rem" }}>
              <div className={styles.resultLabel}>Brüt boşta geçen süre ücreti</div>
              <div className={styles.resultValue}>
                <AnimatedMoney value={result.brutAmount} /> ₺
              </div>
            </div>
          </section>

          <section className={styles.card}>
            <div className={styles.cardHead}>
              <h2 className={styles.cardTitle}>Brütten nete</h2>
            </div>
            <div className={styles.lineList}>
              <div className={styles.line}>
                <span>Brüt</span>
                <strong>
                  <FlashValue value={`${formatMoney(result.brutAmount)} ₺`} />
                </strong>
              </div>
              <div className={styles.line}>
                <span>SGK (%14)</span>
                <strong className={styles.deduction}>-{formatMoney(result.sgk)} ₺</strong>
              </div>
              <div className={styles.line}>
                <span>İşsizlik (%1)</span>
                <strong className={styles.deduction}>-{formatMoney(result.issizlik)} ₺</strong>
              </div>
              <div className={styles.line}>
                <span>Gelir vergisi {result.gelirVergisiDilimleri}</span>
                <strong className={styles.deduction}>-{formatMoney(result.gelirVergisi)} ₺</strong>
              </div>
              <div className={styles.line}>
                <span>Damga (binde 7,59)</span>
                <strong className={styles.deduction}>-{formatMoney(result.damgaVergisi)} ₺</strong>
              </div>
            </div>
            <div className={`${styles.resultCard} ${styles.resultCardStrong}`} style={{ marginTop: "0.6rem" }}>
              <div className={styles.resultLabel}>Net boşta geçen süre ücreti</div>
              <div className={styles.resultValue}>
                <AnimatedMoney value={result.netAmount} /> ₺
              </div>
            </div>
          </section>

          <section className={styles.card}>
            <div className={styles.cardHead}>
              <h2 className={styles.cardTitle}>Notlar</h2>
            </div>
            <div className={styles.warn} style={{ margin: 0 }}>
              {NOTE_TEXT}
            </div>
          </section>
        </aside>
      </div>

      <div className={`${styles.stickyBar} ${dirty ? styles.stickyBarDirty : ""}`} data-tour="bosta-gecen-sure-kaydet-actions">
        <div className={styles.stickyInner}>
          <div className={styles.stickyStatus}>
            {dirty ? "Kaydedilmemiş değişiklikler var" : activeName ? `Kayıt: ${activeName}` : "Yeni hesaplama"}
          </div>
          <div className={styles.stickyActions}>
            <Button type="button" variant="soft" size="sm" onClick={() => setPreviewOpen(true)}>
              <Eye size={14} /> Önizleme
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={handleNew}>
              <FilePlus2 size={14} /> Yeni
            </Button>
            <Button type="button" variant="primary" size="sm" onClick={handleSaveClick} disabled={caseSaving}>
              <Save size={14} /> {caseSaving ? "Kaydediliyor…" : activeId && /^\d+$/.test(activeId) ? "Güncelle" : "Kaydet"}
            </Button>
          </div>
        </div>
      </div>

      <NameModal
        open={nameOpen}
        initial={activeName || PAGE_TITLE}
        onClose={() => setNameOpen(false)}
        onConfirm={(name) => void persist(name, null)}
      />

      <NameModal
        open={extraSaveOpen}
        initial=""
        title="Ekstra Hesaplamaları Kaydet"
        fieldLabel="Set adı"
        onClose={() => setExtraSaveOpen(false)}
        onConfirm={persistExtraSet}
      />

      {extraImportOpen ? (
        <div className={styles.modalOverlay} role="presentation" onClick={() => setExtraImportOpen(false)}>
          <div className={styles.modalCard} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem" }}>
              <h3 className={styles.modalTitle}>Kaydedilmiş Setleri İçe Aktar</h3>
              <Button type="button" variant="ghost" size="sm" onClick={() => void rescanLegacy()} title="Sunucudaki eski setleri yeniden tara">
                <RefreshCw size={14} /> Yeniden tara
              </Button>
            </div>
            {savedExtraSets.length === 0 ? (
              <p className={styles.helper}>
                Kaydedilmiş set yok. Ücret bilgilerindeki “Kaydet” ile mevcut kalemleri saklayabilirsiniz.
              </p>
            ) : (
              <ul className={styles.setList}>
                {savedExtraSets.map((set) => (
                  <li key={set.id} className={styles.setRow}>
                    <div className={styles.setInfo}>
                      <strong>{set.name}</strong>
                      <span>{set.data.length} kalem</span>
                    </div>
                    <div className={styles.inlineActions}>
                      <Button type="button" variant="soft" size="sm" onClick={() => importExtraSet(set)}>
                        <Download size={13} /> İçe aktar
                      </Button>
                      <Button type="button" variant="danger" size="sm" onClick={() => removeExtraSet(set.id)}>
                        <Trash2 size={13} />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <div className={styles.modalActions}>
              <Button type="button" variant="soft" size="sm" onClick={() => setExtraImportOpen(false)}>
                Kapat
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {listOpen ? (
        <div className={styles.modalOverlay} role="dialog" aria-modal="true">
          <div className={styles.modalCard}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 className={styles.modalTitle}>Kayıtlı hesaplamalar</h3>
              <Button type="button" variant="ghost" size="icon" onClick={() => setListOpen(false)} aria-label="Kapat">
                <X size={16} />
              </Button>
            </div>
            {cases.length === 0 ? (
              <p className={styles.helper}>Henüz kayıt yok.</p>
            ) : (
              <div className={styles.caseList}>
                {cases.map((c) => (
                  <div key={c.id} className={styles.caseItem}>
                    <div style={{ minWidth: 0 }}>
                      <div className={styles.caseName}>{c.name}</div>
                      <div className={styles.caseMeta}>
                        {new Date(c.updatedAt).toLocaleString("tr-TR")} · Net {formatMoney(c.results.netAmount)} ₺
                      </div>
                    </div>
                    <div className={styles.caseBtns}>
                      <Button type="button" variant="soft" size="sm" onClick={() => openCase(c)}>
                        Aç
                      </Button>
                      <Button type="button" variant="danger" size="icon" aria-label="Sil" onClick={() => setConfirmDeleteId(c.id)}>
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={confirmNew}
        title="Yeni hesaplama"
        description="Kaydedilmemiş veriler silinecek. Devam edilsin mi?"
        confirmLabel="Devam et"
        onConfirm={doNew}
        onCancel={() => setConfirmNew(false)}
      />
      <ConfirmDialog
        open={!!confirmDeleteId}
        title="Kaydı sil"
        description="Bu kayıt kalıcı olarak silinecek."
        confirmLabel="Sil"
        danger
        onConfirm={doDelete}
        onCancel={() => setConfirmDeleteId(null)}
      />

      {eklentiFor && eklentiKey ? (
        <div className={styles.modalOverlay} role="presentation" onClick={() => setEklentiFor(null)}>
          <div
            className={`${styles.modalCard} ${styles.modalWide}`}
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className={styles.modalTitle}>Eklenti hesaplama</h3>
            <p className={styles.helper}>Son 12 aylık bordro tutarlarını girin. Formül: (toplam / 360) × 30</p>
            <div className={styles.monthGrid}>
              {(eklentiMonths[eklentiKey] ?? emptyMonths()).map((value, index) => (
                <label key={index} className={styles.monthField}>
                  <span>{index + 1}. ay</span>
                  <input
                    className={styles.input}
                    inputMode="decimal"
                    value={value}
                    onChange={(e) => {
                      const v = e.target.value;
                      setEklentiMonths((prev) => ({
                        ...prev,
                        [eklentiKey]: (prev[eklentiKey] ?? emptyMonths()).map((m, i) => (i === index ? v : m)),
                      }));
                    }}
                    placeholder="1.250,00"
                  />
                </label>
              ))}
            </div>
            <p className={styles.helper} style={{ marginTop: "0.5rem" }}>
              Sonuç: <strong>{formatMoney(eklentiPreview)} ₺</strong>
            </p>
            <div className={styles.modalActions}>
              <Button type="button" variant="ghost" size="sm" onClick={() => setEklentiFor(null)}>
                İptal
              </Button>
              <Button type="button" variant="primary" size="sm" onClick={applyEklenti}>
                Uygula
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <CalculationPreviewModal
        open={previewOpen}
        title={PREVIEW_TITLE}
        sections={previewSections}
        contentId="bosta-gecen-sure-preview"
        onClose={() => setPreviewOpen(false)}
      />

      <GuidedTourHost
        definition={BOSTA_GECEN_SURE_TOUR}
        active={tour.active}
        onActiveChange={tour.setActive}
        welcomeOpen={tour.welcomeOpen}
        onWelcomeOpenChange={tour.setWelcomeOpen}
        welcomeTitle={BOSTA_GECEN_SURE_TOUR_WELCOME_TITLE}
        welcomeBody={BOSTA_GECEN_SURE_TOUR_WELCOME_BODY}
        welcomeStartLabel="Başlat"
        welcomeLaterLabel="Kendim devam edeceğim"
        initialStepIndex={tour.resumeStepIndex}
        onCollectingComplete={() => {
          tour.completeTour();
          toastInfo("Kılavuz tamamlandı. Hesaplamanızı önizleyebilir veya kaydedebilirsiniz.");
        }}
        paused={
          previewOpen ||
          nameOpen ||
          listOpen ||
          extraSaveOpen ||
          extraImportOpen ||
          !!eklentiFor ||
          confirmNew ||
          !!confirmDeleteId
        }
      />
    </div>
  );
}
