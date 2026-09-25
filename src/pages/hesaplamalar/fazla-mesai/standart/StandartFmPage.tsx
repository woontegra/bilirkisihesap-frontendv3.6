import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  Calculator,
  CirclePlay,
  Clock3,
  Eye,
  FilePlus2,
  FolderOpen,
  History,
  Save,
  ShieldCheck,
  Trash2,
  XCircle,
} from "lucide-react";
import { ApiError } from "@/api/client";
import { CalculationPreviewModal, type PreviewSection } from "@/components/calculation-preview";
import { DraftDateInput, DraftTimeInput } from "@/components/form";
import { GuidedTourHost, useGuidedTourController } from "@/components/guided-tour";
import tourStyles from "@/components/guided-tour/GuidedTour.module.css";
import { Button } from "@/components/ui/Button";
import { useDeferredFormMemo } from "@/hooks/useDeferredFormMemo";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { useToast } from "@/context/ToastContext";
import {
  FM_STANDART_TOUR,
  FM_STANDART_TOUR_WELCOME_BODY,
  FM_STANDART_TOUR_WELCOME_TITLE,
} from "./guidedTour";
import {
  ManualBrutWageApplyControls,
  clearAllManualBrutFromRowOverrides,
  isManualBrutActiveInOverrides,
  mergeManualWageBrutsIntoRowOverrides,
} from "@/features/manual-brut-wage";
import {
  loadStandartFmCase,
  listStandartFmCases,
  removeStandartFmCase,
  resolveSavedCaseDisplayName,
  saveStandartFmCase,
  type SavedCaseListItem,
} from "./backendCase";
import { CetvelTable } from "./CetvelTable";
import { ExclusionsPanel } from "./ExclusionsPanel";
import { KatsayiModal } from "./KatsayiModal";
import { MahsuplasamaModal } from "./MahsuplasamaModal";
import { MetinHesaplamasi } from "./MetinHesaplamasi";
import { NotlarAccordion } from "./NotlarAccordion";
import { UbgtPickerModal } from "./UbgtPickerModal";
import { ZamanasimiPickerModal } from "./ZamanasimiPickerModal";
import { ZamanasimiCetvelBanner } from "../shared/ZamanasimiCetvelBanner";
import { insertExclusionsPreviewSection } from "../shared/exclusionsPreview";
import { formatIsoDateRangeTR, formatIsoDateTR } from "@/utils/dateDisplay";
import {
  computeBaselineWeeklyFmHours,
  formatMoney,
  parseKatsayi,
  sanitizeMoneyTyping,
  validateDateRange,
} from "./engine";
import { computeStandartFmResultV3, logStandartFmV3EngineCheck } from "./v3-engine/adapter";
import {
  createEmptyForm,
  type ExclusionItem,
  type PeriodRow,
  type RowOverride,
  type SevenDayMode,
  type StandartFormSnapshot,
} from "./model";
import { isCetvelRowVisible } from "../cetvelDisplay";
import styles from "./StandartFmPage.module.css";

const PAGE_TITLE = "Standart Fazla Mesai Hesaplama";
const WEEKDAY_LABELS = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];

type PendingAction = { kind: "new" } | { kind: "open"; caseId: string } | null;

function snapshotKey(s: StandartFormSnapshot): string {
  return JSON.stringify(s);
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
  return <span className={`${className ?? ""} ${flash ? styles.valueFlash : ""}`.trim()}>{value}</span>;
}

function NameModal({
  open,
  title,
  description,
  placeholder,
  confirmLabel,
  initialValue,
  onClose,
  onSave,
}: {
  open: boolean;
  title: string;
  description?: string;
  placeholder: string;
  confirmLabel: string;
  initialValue?: string;
  onClose: () => void;
  onSave: (name: string) => void;
}) {
  const [value, setValue] = useState(initialValue ?? "");
  useEffect(() => {
    if (open) setValue(initialValue ?? "");
  }, [open, initialValue]);

  if (!open) return null;
  return (
    <div className={styles.modalOverlay} role="presentation" onClick={onClose}>
      <div className={styles.modalCard} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h2 className={styles.modalTitle}>{title}</h2>
        {description ? <p className={styles.modalDesc}>{description}</p> : null}
        <input
          className={styles.modalInput}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter" && value.trim()) onSave(value.trim());
            if (e.key === "Escape") onClose();
          }}
        />
        <div className={styles.modalActions}>
          <Button variant="soft" onClick={onClose}>
            İptal
          </Button>
          <Button variant="primary" disabled={!value.trim()} onClick={() => onSave(value.trim())}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function StandartFmPage() {
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const caseIdParam = searchParams.get("caseId");

  const [form, setForm] = useState<StandartFormSnapshot>(() => createEmptyForm());

  const [currentRecordId, setCurrentRecordId] = useState<string | null>(null);
  const [currentRecordName, setCurrentRecordName] = useState<string | null>(null);
  const [savedCases, setSavedCases] = useState<SavedCaseListItem[]>([]);
  const [casesError, setCasesError] = useState<string | null>(null);
  const [isSavingCase, setIsSavingCase] = useState(false);
  const [caseLoading, setCaseLoading] = useState(false);
  const backendLoadedCaseIdRef = useRef<string | null>(null);

  const [showRecordsModal, setShowRecordsModal] = useState(false);
  const [showCaseSaveModal, setShowCaseSaveModal] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showUbgtPicker, setShowUbgtPicker] = useState(false);
  const [showZamanasimiModal, setShowZamanasimiModal] = useState(false);
  const [showKatsayiModal, setShowKatsayiModal] = useState(false);
  const [showMahsupModal, setShowMahsupModal] = useState(false);
  const [deleteCaseTarget, setDeleteCaseTarget] = useState<SavedCaseListItem | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [saveFlash, setSaveFlash] = useState(false);
  const [formSwap, setFormSwap] = useState(false);
  const [baseline, setBaseline] = useState("");
  const [exclusionOverlayOpen, setExclusionOverlayOpen] = useState(false);
  const tour = useGuidedTourController();

  const modalReturnFocusRef = useRef<HTMLElement | null>(null);
  const tourPaused =
    showRecordsModal ||
    showCaseSaveModal ||
    showPreview ||
    showUbgtPicker ||
    showZamanasimiModal ||
    showKatsayiModal ||
    showMahsupModal ||
    exclusionOverlayOpen ||
    deleteCaseTarget !== null ||
    discardOpen;

  const setField = <K extends keyof StandartFormSnapshot>(key: K, value: StandartFormSnapshot[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const clearCaseIdParam = useCallback(() => {
    if (!searchParams.has("caseId")) return;
    const next = new URLSearchParams(searchParams);
    next.delete("caseId");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const reloadCases = useCallback(async () => {
    try {
      const items = await listStandartFmCases();
      setCasesError(null);
      setSavedCases(items);
    } catch (error: unknown) {
      const message =
        error instanceof ApiError ? error.message : error instanceof Error ? error.message : "Kayıtlar yüklenemedi";
      setCasesError(message);
      setSavedCases([]);
    }
  }, []);

  useEffect(() => {
    reloadCases();
    setBaseline(snapshotKey(createEmptyForm()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isDirty = useMemo(() => snapshotKey(form) !== baseline, [form, baseline]);

  const dateError = useMemo(() => validateDateRange(form.iseGiris, form.istenCikis), [form.iseGiris, form.istenCikis]);

  const result = useDeferredFormMemo(form, computeStandartFmResultV3);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    (window as unknown as { __standartFmV3Check?: () => void }).__standartFmV3Check = () =>
      logStandartFmV3EngineCheck(form);
  }, [form]);

  /** V3 özet satırı: 270 öncesi haftalık FM + günlük net (günlük net ≠ haftalık FM). */
  const weeklyFmSummaryHours = useMemo(() => {
    if (result.dailyNetHours <= 0) return 0;
    return computeBaselineWeeklyFmHours(
      result.dailyNetHours,
      form.weeklyDays,
      form.sevenDayMode,
      "none",
    ).fmHours;
  }, [result.dailyNetHours, form.weeklyDays, form.sevenDayMode]);

  const katSayiNum = parseKatsayi(form.katSayi);
  const hasCustomKatsayi = katSayiNum > 0 && katSayiNum !== 1;

  const manualBrutActive = useMemo(
    () => isManualBrutActiveInOverrides(form.rowOverrides),
    [form.rowOverrides],
  );

  const handleApplyManualBruts = useCallback((brutById: Record<string, number>) => {
    setForm((prev) => ({
      ...prev,
      rowOverrides: mergeManualWageBrutsIntoRowOverrides(prev.rowOverrides, brutById),
    }));
  }, []);

  const handleDeactivateManualBrut = useCallback(() => {
    setForm((prev) => ({
      ...prev,
      rowOverrides: clearAllManualBrutFromRowOverrides(prev.rowOverrides),
    }));
  }, []);

  const mahsupYears = useMemo(() => {
    const years = new Set<number>();
    for (const row of result.rows) {
      const y = Number(row.startISO.slice(0, 4));
      if (Number.isFinite(y) && y > 1900) years.add(y);
    }
    return Array.from(years).sort((a, b) => a - b);
  }, [result.rows]);

  useEffect(() => {
    const modalOpen =
      showRecordsModal ||
      showCaseSaveModal ||
      showPreview ||
      showUbgtPicker ||
      showZamanasimiModal ||
      showKatsayiModal ||
      showMahsupModal ||
      deleteCaseTarget !== null ||
      discardOpen;
    if (!modalOpen) return;
    modalReturnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const timer = window.setTimeout(() => {
      const dialogs = document.querySelectorAll<HTMLElement>('[role="dialog"]');
      const dialog = dialogs.item(dialogs.length - 1);
      dialog?.querySelector<HTMLElement>("button, input, textarea, [tabindex]:not([tabindex='-1'])")?.focus();
    }, 0);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (deleteCaseTarget) setDeleteCaseTarget(null);
      else if (discardOpen) {
        setDiscardOpen(false);
        setPendingAction(null);
      } else if (showKatsayiModal) setShowKatsayiModal(false);
      else if (showMahsupModal) setShowMahsupModal(false);
      else if (showZamanasimiModal) setShowZamanasimiModal(false);
      else if (showUbgtPicker) setShowUbgtPicker(false);
      else if (showCaseSaveModal) setShowCaseSaveModal(false);
      else if (showPreview) setShowPreview(false);
      else if (showRecordsModal) setShowRecordsModal(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("keydown", onKeyDown);
      modalReturnFocusRef.current?.focus();
    };
  }, [showRecordsModal, showCaseSaveModal, showPreview, showUbgtPicker, showZamanasimiModal, showKatsayiModal, showMahsupModal, deleteCaseTarget, discardOpen]);

  const triggerFormSwap = () => {
    setFormSwap(true);
    window.setTimeout(() => setFormSwap(false), 480);
  };

  const resetFormFields = useCallback(() => {
    const empty = createEmptyForm();
    setForm(empty);
    setCurrentRecordId(null);
    setCurrentRecordName(null);
    setBaseline(snapshotKey(empty));
  }, []);

  const applyNewForm = useCallback(() => {
    backendLoadedCaseIdRef.current = null;
    clearCaseIdParam();
    resetFormFields();
    triggerFormSwap();
  }, [clearCaseIdParam, resetFormFields]);

  const applyOpenCase = useCallback(
    async (c: SavedCaseListItem) => {
      try {
        const { record, form: loaded } = await loadStandartFmCase(Number(c.id));
        backendLoadedCaseIdRef.current = String(record.id);
        const next = new URLSearchParams(searchParams);
        next.set("caseId", String(record.id));
        setSearchParams(next, { replace: true });
        setForm(loaded);
        setCurrentRecordId(String(record.id));
        setCurrentRecordName(resolveSavedCaseDisplayName(record));
        setBaseline(snapshotKey(loaded));
        setShowRecordsModal(false);
        triggerFormSwap();
        toast.success("Kayıt yüklendi");
      } catch (error: unknown) {
        const message =
          error instanceof ApiError ? error.message : error instanceof Error ? error.message : "Kayıt açılamadı";
        toast.error(message);
      }
    },
    [searchParams, setSearchParams, toast],
  );

  const applyBackendForm = useCallback((loaded: StandartFormSnapshot, recordId: string, recordName: string) => {
    setForm(loaded);
    setCurrentRecordId(recordId);
    setCurrentRecordName(recordName);
    setBaseline(snapshotKey(loaded));
    triggerFormSwap();
  }, []);

  useEffect(() => {
    if (!caseIdParam) {
      if (backendLoadedCaseIdRef.current !== null) {
        backendLoadedCaseIdRef.current = null;
        resetFormFields();
        triggerFormSwap();
      }
      return;
    }
    if (backendLoadedCaseIdRef.current === caseIdParam) return;

    let cancelled = false;
    setCaseLoading(true);

    const numericId = Number(caseIdParam);
    if (!Number.isFinite(numericId) || numericId <= 0) {
      setCaseLoading(false);
      toast.error("Geçersiz kayıt kimliği");
      return;
    }

    void loadStandartFmCase(numericId)
      .then(({ record, form: mapped }) => {
        if (cancelled) return;
        applyBackendForm(mapped, String(record.id), resolveSavedCaseDisplayName(record));
        backendLoadedCaseIdRef.current = caseIdParam;
        toast.success("Kayıt yüklendi");
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const message =
          error instanceof ApiError ? error.message : error instanceof Error ? error.message : "Kayıt yüklenemedi";
        toast.error(message);
      })
      .finally(() => {
        if (!cancelled) setCaseLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [applyBackendForm, caseIdParam, resetFormFields, toast]);

  const requestAction = (action: PendingAction) => {
    if (isDirty) {
      setPendingAction(action);
      setDiscardOpen(true);
      return;
    }
    commitAction(action);
  };

  const commitAction = (action: PendingAction) => {
    if (!action) return;
    if (action.kind === "new") {
      applyNewForm();
      return;
    }
    const found = savedCases.find((c) => c.id === action.caseId);
    if (found) applyOpenCase(found);
  };

  /* istisnalar */
  const setExclusions = (next: ExclusionItem[]) => setField("exclusions", next);

  /* satır düzeltmeleri / + − (V3 paritesi) */
  const handleRowOverrideChange = (id: string, patch: RowOverride | null) => {
    setForm((prev) => {
      const next = { ...prev.rowOverrides };
      if (patch === null) delete next[id];
      else next[id] = patch;
      return { ...prev, rowOverrides: next };
    });
  };

  const handleAddRow = (afterId: string) => {
    const kats = parseKatsayi(form.katSayi);
    const manual: PeriodRow = {
      id: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      startISO: "",
      endISO: "",
      weeks: 0,
      brut: 0,
      katsayi: kats,
      fmHours: result.baselineWeeklyFmHours || 0,
      fm: 0,
      isDeductionRow: false,
      isManual: true,
      insertAfter: afterId,
    };
    setForm((prev) => ({ ...prev, manualRows: [...(prev.manualRows ?? []), manual] }));
  };

  const handleRemoveRow = (id: string) => {
    setForm((prev) => {
      const isManual = (prev.manualRows ?? []).some((r) => r.id === id);
      if (isManual) {
        const nextOverrides = { ...prev.rowOverrides };
        delete nextOverrides[id];
        return {
          ...prev,
          manualRows: (prev.manualRows ?? []).filter((r) => r.id !== id),
          rowOverrides: nextOverrides,
        };
      }
      return {
        ...prev,
        rowOverrides: {
          ...prev.rowOverrides,
          [id]: { ...(prev.rowOverrides[id] ?? {}), hidden: true },
        },
      };
    });
  };

  const hiddenRowCount = Object.values(form.rowOverrides).filter((o) => o.hidden).length;
  const showHiddenRows = () => {
    setForm((prev) => {
      const next: Record<string, RowOverride> = {};
      for (const [id, ov] of Object.entries(prev.rowOverrides)) {
        if (ov.hidden) {
          const { hidden: _hidden, ...rest } = ov;
          if (Object.keys(rest).length > 0) next[id] = rest;
        } else {
          next[id] = ov;
        }
      }
      return { ...prev, rowOverrides: next };
    });
  };

  /* kayıt işlemleri — V3 ile aynı backend API (`/api/saved-cases`) */
  const persistCase = async (name: string) => {
    if (isSavingCase) return;
    setIsSavingCase(true);
    const wasUpdate = !!currentRecordId;
    try {
      const saved = await saveStandartFmCase(name, form, result, currentRecordId);
      setCurrentRecordId(String(saved.id));
      setCurrentRecordName(name);
      setBaseline(snapshotKey(form));
      backendLoadedCaseIdRef.current = String(saved.id);
      const next = new URLSearchParams(searchParams);
      next.set("caseId", String(saved.id));
      setSearchParams(next, { replace: true });
      await reloadCases();
      setShowCaseSaveModal(false);
      setSaveFlash(true);
      window.setTimeout(() => setSaveFlash(false), 700);
      toast.success(wasUpdate ? "Kayıt güncellendi" : "Kayıt oluşturuldu");
    } catch (error: unknown) {
      const message =
        error instanceof ApiError ? error.message : error instanceof Error ? error.message : "Kayıt başarısız";
      toast.error(message);
    } finally {
      setIsSavingCase(false);
    }
  };

  const handleSaveCase = () => {
    if (currentRecordName) {
      persistCase(currentRecordName);
      return;
    }
    setShowCaseSaveModal(true);
  };

  const confirmDeleteCase = () => {
    if (!deleteCaseTarget) return;
    void (async () => {
      try {
        await removeStandartFmCase(deleteCaseTarget.id);
        if (currentRecordId === deleteCaseTarget.id) {
          backendLoadedCaseIdRef.current = null;
          clearCaseIdParam();
          setCurrentRecordId(null);
          setCurrentRecordName(null);
        }
        await reloadCases();
        setDeleteCaseTarget(null);
        toast.success("Kayıt silindi");
      } catch (error: unknown) {
        const message =
          error instanceof ApiError ? error.message : error instanceof Error ? error.message : "Kayıt silinemedi";
        toast.error(message);
      }
    })();
  };

  /* önizleme bölümleri */
  const previewSections = useMemo((): PreviewSection[] => {
    const money = (v: number) => `${formatMoney(v)} ₺`;
    const sections: PreviewSection[] = [];
    const visibleRows = result.rows.filter(isCetvelRowVisible);

    sections.push({
      id: "temel",
      title: "Genel Bilgiler",
      headers: ["İşe Giriş", "İşten Çıkış", "Çalışma Süresi", "Haftalık FM Saat"],
      rows: [[
        formatIsoDateTR(form.iseGiris),
        formatIsoDateTR(form.istenCikis),
        `${form.weeklyDays} gün${form.weeklyDays === 7 ? ` (${form.sevenDayMode})` : ""}`,
        `${weeklyFmSummaryHours.toFixed(2).replace(".", ",")} sa`,
      ]],
    });

    sections.push({
      id: "cetvel",
      title: "Fazla Mesai Hesaplama Cetveli",
      headers: ["Dönem", "Hafta", "Ücret", "Katsayı", "FM Saat", "225", "1,5", "Fazla Mesai"],
      rows: [
        ...visibleRows.map((r) => [
          `${formatIsoDateRangeTR(r.startISO, r.endISO)}${r.note ? ` ${r.note}` : ""}`,
          String(r.weeks),
          money(r.brut),
          String(r.katsayi),
          r.fmHours.toFixed(2).replace(".", ","),
          "225",
          "1,5",
          money(r.fm),
        ]),
        // Ana cetvel tfoot ile aynı kaynak: result.toplamFm (satırları yeniden toplama).
        ...(visibleRows.length > 0
          ? [["", "", "", "", "", "", "Toplam Fazla Mesai:", money(result.toplamFm)]]
          : []),
      ],
      lastRowTone: "blue",
    });

    sections.push({
      id: "brutten-nete",
      title: "Brüt'ten Net'e",
      headers: ["Kalem", "Tutar"],
      rows: [
        ["Brüt Fazla Mesai", money(result.toplamFm)],
        ["SGK (%14)", `-${money(result.sgk)}`],
        ["İşsizlik (%1)", `-${money(result.issizlik)}`],
        [`Gelir Vergisi ${result.gelirVergisiDilimleri}`.trim(), `-${money(result.gelirVergisi)}`],
        ["Damga Vergisi (Binde 7,59)", `-${money(result.damgaVergisi)}`],
        ["Net Fazla Mesai", money(result.netYillik)],
      ],
      lastRowTone: "green",
    });

    sections.push({
      id: "hakkaniyet",
      title: "Mahsuplaşma",
      headers: ["Kalem", "Tutar"],
      rows: [
        ["Toplam Fazla Mesai (Brüt)", money(result.toplamFm)],
        ["1/3 Hakkaniyet İndirimi", `-${money(result.hakkaniyetIndirimi)}`],
        ...(result.mahsupTutari > 0 ? ([["Mahsuplaşma Miktarı", `-${money(result.mahsupTutari)}`]] as string[][]) : []),
        ["Son Brüt Alacak", money(result.sonNet)],
      ],
      lastRowTone: "green",
    });

    return insertExclusionsPreviewSection(sections, form.exclusions);
  }, [form, result, weeklyFmSummaryHours]);

  return (
    <div className={styles.page} aria-busy={caseLoading || undefined}>
      {caseLoading ? (
        <div className={styles.privacyBadge} role="status">
          Sunucu kaydı yükleniyor…
        </div>
      ) : null}

      <header className={styles.hero}>
        <div className={styles.heroMain}>
          <div className={styles.heroIcon} aria-hidden>
            <Clock3 size={22} />
          </div>
          <div>
            <h1 className={styles.title}>{PAGE_TITLE}</h1>
            <p className={styles.desc}>
              Günlük giriş–çıkış saatlerine göre standart fazla mesai hesabı; düşüm ve 270 kuralları cetvel ile
              uyumludur.
            </p>
            <div className={styles.privacyBadge}>
              <ShieldCheck size={14} />
              <span>Veriler hesabınıza güvenli şekilde kaydedilir</span>
            </div>
          </div>
        </div>
        <div className={styles.heroAside}>
          {currentRecordName ? (
            <div className={styles.recordBadge}>
              <FolderOpen size={13} />
              <span>{currentRecordName}</span>
              {isDirty ? <em>· değişti</em> : null}
            </div>
          ) : null}
          <div className={styles.quickTotal}>
            <span>Brüt Fazla Mesai</span>
            <FlashValue className={styles.quickTotalValue} value={`${formatMoney(result.toplamFm)} ₺`} />
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
              <CirclePlay size={14} />
              Nasıl kullanılır?
            </Button>
            <Button variant="soft" size="sm" onClick={() => setShowRecordsModal(true)}>
              <FolderOpen size={14} />
              Kayıtlar ({savedCases.length})
            </Button>
            <Button variant="soft" size="sm" onClick={() => requestAction({ kind: "new" })}>
              <FilePlus2 size={14} />
              Yeni Hesaplama
            </Button>
          </div>
        </div>
      </header>

      {casesError ? (
        <div className={styles.storageBanner} role="alert">
          <p>{casesError}</p>
          <Button variant="soft" size="sm" onClick={() => void reloadCases()}>
            Yeniden dene
          </Button>
        </div>
      ) : null}

      <div className={`${styles.singleColumn} ${formSwap ? styles.formSwap : ""}`}>
        <section className={styles.card} style={{ animationDelay: "60ms" }} data-tour="fm-standart-donem">
          <div className={styles.cardTitleRow}>
            <h2 className={styles.cardTitle}>Tarih ve Çalışma Bilgileri</h2>
          </div>
          <div className={styles.basicGrid}>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>İşe Giriş</span>
              <DraftDateInput
                className={styles.dateInput}
                value={form.iseGiris}
                onCommit={(v) => setField("iseGiris", v)}
              />
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>İşten Çıkış</span>
              <div className={`${styles.dateWrap} ${dateError ? styles.inputWrapError : ""}`}>
                <DraftDateInput
                  className={styles.dateInput}
                  value={form.istenCikis}
                  onCommit={(v) => setField("istenCikis", v)}
                  aria-invalid={dateError ? true : undefined}
                />
              </div>
            </label>
            {dateError ? <p className={styles.errorText}>{dateError}</p> : null}

            <label className={styles.field}>
              <span className={styles.fieldLabel}>Haftada Çalışılan Gün (1-7)</span>
              <select
                className={styles.selectInput}
                value={form.weeklyDays}
                onChange={(e) => setField("weeklyDays", Number(e.target.value))}
              >
                {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                  <option key={n} value={n}>
                    {n} gün
                  </option>
                ))}
              </select>
            </label>

            {form.weeklyDays === 7 ? (
              <label className={styles.field}>
                <span className={styles.fieldLabel}></span>
                <select
                  className={styles.selectInput}
                  value={form.sevenDayMode}
                  onChange={(e) => setField("sevenDayMode", e.target.value as SevenDayMode)}
                >
                  <option value="tatilsiz">Hafta Tatilsiz</option>
                  <option value="tatilli">Hafta Tatilli</option>
                </select>
              </label>
            ) : null}

            <label className={styles.field}>
              <span className={styles.fieldLabel}>Hafta Tatili Günü (opsiyonel)</span>
              <select
                className={styles.selectInput}
                value={form.haftaTatiliGunu}
                onChange={(e) => setField("haftaTatiliGunu", e.target.value === "" ? "" : Number(e.target.value))}
              >
                <option value="">Seçilmedi (tüm günlerde düşüm)</option>
                {WEEKDAY_LABELS.map((label, idx) => (
                  <option key={label} value={idx}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>

        <section className={styles.card} style={{ animationDelay: "100ms" }}>
          <div data-tour="fm-standart-saatler">
            <div className={styles.basicGrid}>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Giriş Saati</span>
                <DraftTimeInput
                  className={styles.dateInput}
                  value={form.davaciIn}
                  onCommit={(v) => setField("davaciIn", v)}
                />
              </label>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Çıkış Saati</span>
                <DraftTimeInput
                  className={styles.dateInput}
                  value={form.davaciOut}
                  onCommit={(v) => setField("davaciOut", v)}
                />
              </label>
            </div>
          </div>
          <div className={styles.grossSummary} style={{ marginTop: "0.75rem" }}>
            <span>Haftalık FM Saati</span>
            <FlashValue
              value={
                weeklyFmSummaryHours > 0
                  ? `${weeklyFmSummaryHours.toFixed(2).replace(".", ",")} (Günlük net ${result.dailyNetHours
                      .toFixed(2)
                      .replace(".", ",")} saat)`
                  : "—"
              }
            />
          </div>
          <div style={{ marginTop: "0.75rem" }}>
            <MetinHesaplamasi
              davaciIn={form.davaciIn}
              davaciOut={form.davaciOut}
              weeklyDays={form.weeklyDays}
              sevenDayMode={form.sevenDayMode}
              onSevenDayModeChange={(mode) => setField("sevenDayMode", mode)}
              dailyGrossHours={result.dailyGrossHours}
              breakHours={result.breakHours}
              dailyNetHours={result.dailyNetHours}
              weeklyRawHours={result.weeklyRawHours}
              weeklyRoundedHours={result.weeklyRoundedHours}
              baselineWeeklyFmHours={result.baselineWeeklyFmHours}
            />
          </div>
        </section>

        <div data-tour="fm-standart-ayarlar" style={{ display: "grid", gap: "1rem", minWidth: 0 }}>
          <ExclusionsPanel
            exclusions={form.exclusions}
            onChange={setExclusions}
            onOpenUbgtPicker={() => setShowUbgtPicker(true)}
            visibleAfterIso={form.zamanasimi?.nihaiBaslangic ?? null}
            onOverlayOpenChange={setExclusionOverlayOpen}
          />

          <section className={styles.card} style={{ animationDelay: "150ms" }}>
            <h2 className={styles.cardTitle}></h2>
            <div className={styles.basicGrid}>
              <div className={styles.field}>
                <span className={styles.fieldLabel}>Kat Sayı</span>
                <button
                  type="button"
                  className={`${styles.zamanasimiBadge} ${hasCustomKatsayi ? styles.zamanasimiBadgeActive : ""}`}
                  onClick={() => setShowKatsayiModal(true)}
                  title={hasCustomKatsayi ? "Katsayıyı kaldır" : "Katsayı hesapla"}
                >
                  <Calculator size={13} />
                  {hasCustomKatsayi ? `Katsayı ${form.katSayi}` : "Kat Sayı"}
                </button>
              </div>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>270 Saat</span>
                <select
                  className={styles.selectInput}
                  value={form.mode270}
                  onChange={(e) => setField("mode270", e.target.value as StandartFormSnapshot["mode270"])}
                >
                  <option value="none">Kapalı</option>
                  <option value="simple">Yargıtay Uygulaması</option>
                  <option value="detailed">Şirket Uygulaması</option>
                </select>
              </label>
              <div className={styles.field}>
                <span className={styles.fieldLabel}>Zamanaşımı</span>
                <button
                  type="button"
                  className={`${styles.zamanasimiBadge} ${form.zamanasimi ? styles.zamanasimiBadgeActive : ""}`}
                  onClick={() => setShowZamanasimiModal(true)}
                >
                  <History size={13} />
                  {form.zamanasimi ? "Zamanaşımı" : "Zamanaşımı İtirazı"}
                </button>
              </div>
            </div>
          </section>
        </div>

        {result.warnings.length > 0 ? (
          <article className={styles.panel} style={{ animationDelay: "155ms" }}>
            <header className={styles.panelHead}>
              <h3>Uyarılar</h3>
            </header>
            <div className={styles.warningList} role="status">
              {result.warnings.map((w) => (
                <div className={styles.warningBanner} key={w}>
                  <AlertTriangle size={15} />
                  <span>{w}</span>
                </div>
              ))}
            </div>
          </article>
        ) : null}

        <ZamanasimiCetvelBanner nihaiBaslangic={form.zamanasimi?.nihaiBaslangic} />
        <ManualBrutWageApplyControls
          rows={result.rows}
          onApplyBrutsByRowId={handleApplyManualBruts}
          manualBrutActive={manualBrutActive}
          onDeactivateManualBrut={handleDeactivateManualBrut}
          success={toast.success}
          error={toast.error}
        />
        <CetvelTable
          rows={result.rows}
          rowOverrides={form.rowOverrides}
          onOverrideChange={handleRowOverrideChange}
          onAddRow={handleAddRow}
          onRemoveRow={handleRemoveRow}
          toplamFm={result.toplamFm}
        />

        {hiddenRowCount > 0 ? (
          <button type="button" className={styles.addRowBtn} onClick={showHiddenRows}>
            <XCircle size={14} />
            Silinen {hiddenRowCount} otomatik satırı geri getir
          </button>
        ) : null}

        <article className={styles.panel} style={{ animationDelay: "180ms" }}>
          <header className={styles.panelHead}>
            <h3>Brütten Nete</h3>
          </header>
          <div className={styles.panelBody}>
            <div className={styles.line}>
              <span>Brüt Fazla Mesai</span>
              <FlashValue value={`${formatMoney(result.toplamFm)} ₺`} />
            </div>
            <div className={styles.line}>
              <span>SGK (%14)</span>
              <span className={styles.deduction}>-{formatMoney(result.sgk)} ₺</span>
            </div>
            <div className={styles.line}>
              <span>İşsizlik (%1)</span>
              <span className={styles.deduction}>-{formatMoney(result.issizlik)} ₺</span>
            </div>
            <div className={styles.line}>
              <span>Gelir Vergisi {result.gelirVergisiDilimleri}</span>
              <span className={styles.deduction}>-{formatMoney(result.gelirVergisi)} ₺</span>
            </div>
            <div className={styles.line}>
              <span>Damga Vergisi (Binde 7,59)</span>
              <span className={styles.deduction}>-{formatMoney(result.damgaVergisi)} ₺</span>
            </div>
            <div className={`${styles.line} ${styles.netLine}`}>
              <span>Net Fazla Mesai</span>
              <FlashValue value={`${formatMoney(result.netYillik)} ₺`} />
            </div>
          </div>
        </article>

        <article className={styles.panel} style={{ animationDelay: "200ms" }}>
          <header className={styles.panelHead}>
            <h3>Hakkaniyet İndirimi / Mahsuplaşma</h3>
          </header>
          <div className={styles.panelBody}>
            <div className={styles.line}>
              <span>Toplam Fazla Mesai (Brüt)</span>
              <span>{formatMoney(result.toplamFm)} ₺</span>
            </div>
            <div className={styles.line}>
              <span>1/3 Hakkaniyet İndirimi</span>
              <span className={styles.deduction}>-{formatMoney(result.hakkaniyetIndirimi)} ₺</span>
            </div>
            <div className={`${styles.line} ${styles.mahsupLine}`}>
              <span>Mahsuplaşma Miktarı</span>
              <div className={styles.mahsupRow}>
                <div className={styles.inputWrap}>
                  <input
                    className={styles.input}
                    inputMode="decimal"
                    value={form.mahsup}
                    onChange={(e) => setField("mahsup", sanitizeMoneyTyping(e.target.value))}
                    placeholder="0"
                  />
                  <span className={styles.currency} aria-hidden>
                    ₺
                  </span>
                </div>
                <button
                  type="button"
                  className={styles.zamanasimiBadge}
                  onClick={() => setShowMahsupModal(true)}
                  title="Ay ve yıl bazında mahsuplaşma girin"
                >
                  Mahsuplaşma Ekle
                </button>
              </div>
            </div>
            <div className={`${styles.line} ${styles.netLine}`}>
              <span>Son Brüt Alacak</span>
              <FlashValue value={`${formatMoney(result.sonNet)} ₺`} />
            </div>
            <p className={styles.noteInfo}></p>
          </div>
        </article>

        <section className={styles.card} style={{ animationDelay: "220ms" }}>
          <NotlarAccordion />
        </section>
      </div>

      <div
        className={`${styles.stickyBar} ${isDirty ? styles.stickyBarDirty : ""} ${saveFlash ? styles.stickyBarSaved : ""}`}
        data-tour="fm-standart-kaydet-actions"
      >
        <div className={styles.stickyInner}>
          <p className={styles.stickyStatus}>
            {isDirty ? "Kaydedilmemiş değişiklikler var" : currentRecordName ? "Tüm değişiklikler kaydedildi" : "Hazır"}
          </p>
          <div className={styles.stickyActions}>
            <Button variant="soft" size="sm" onClick={() => setShowPreview(true)}>
              <Eye size={14} />
              Önizleme
            </Button>
            <Button variant="soft" size="sm" onClick={() => requestAction({ kind: "new" })}>
              <FilePlus2 size={14} />
              Yeni Hesapla
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleSaveCase}
              disabled={isSavingCase}
              className={saveFlash ? styles.saveBtnFlash : undefined}
            >
              <Save size={14} />
              {isSavingCase ? "Kaydediliyor…" : currentRecordId ? "Güncelle" : "Kaydet"}
            </Button>
          </div>
        </div>
      </div>

      {showRecordsModal ? (
        <div className={styles.modalOverlay} role="presentation" onClick={() => setShowRecordsModal(false)}>
          <div className={styles.modalCard} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>Kayıtlı hesaplamalar</h2>
            {savedCases.length === 0 ? (
              <p className={styles.emptyText}>Henüz kayıt yok. “Kaydet” ile mevcut hesaplamayı saklayabilirsiniz.</p>
            ) : (
              <ul className={styles.setList}>
                {savedCases.map((c) => (
                  <li key={c.id} className={styles.setRow}>
                    <div className={styles.setInfo}>
                      <strong>{c.name}</strong>
                      <span>
                        {formatMoney(c.result.sonNet)} ₺ son net · {c.result.rowCount} satır ·{" "}
                        {new Date(c.updatedAt).toLocaleDateString("tr-TR")}
                      </span>
                    </div>
                    <div className={styles.inlineActions}>
                      <Button
                        variant="soft"
                        size="sm"
                        onClick={() => {
                          setShowRecordsModal(false);
                          requestAction({ kind: "open", caseId: c.id });
                        }}
                      >
                        Aç
                      </Button>
                      <Button variant="danger" size="sm" onClick={() => setDeleteCaseTarget(c)}>
                        <Trash2 size={13} />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <div className={styles.modalActions}>
              <Button variant="soft" onClick={() => setShowRecordsModal(false)}>
                Kapat
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <CalculationPreviewModal
        open={showPreview}
        title={PAGE_TITLE}
        sections={previewSections}
        contentId="fm-standart-word-copy"
        onClose={() => setShowPreview(false)}
      />

      <NameModal
        open={showCaseSaveModal}
        title="Hesaplamayı Kaydet"
        description="Kaydedilen hesaplamalarınızda görünecek bir isim girin. Kayıt yalnızca bu tarayıcıda saklanır."
        placeholder="Örn: Hesaplama adı"
        confirmLabel="Kaydet"
        initialValue={currentRecordName ?? ""}
        onClose={() => setShowCaseSaveModal(false)}
        onSave={persistCase}
      />

      <UbgtPickerModal
        open={showUbgtPicker}
        rangeStart={form.iseGiris}
        rangeEnd={form.istenCikis}
        exclusions={form.exclusions}
        onApply={setExclusions}
        onClose={() => setShowUbgtPicker(false)}
        visibleAfterIso={form.zamanasimi?.nihaiBaslangic ?? null}
      />

      <ZamanasimiPickerModal
        open={showZamanasimiModal}
        initial={form.zamanasimi}
        iseGiris={form.iseGiris}
        onApply={(info) => setField("zamanasimi", info)}
        onClear={() => setField("zamanasimi", null)}
        onClose={() => setShowZamanasimiModal(false)}
      />

      <KatsayiModal
        open={showKatsayiModal}
        currentKatsayi={katSayiNum}
        onApply={(k) => setField("katSayi", String(k).replace(".", ","))}
        onReset={() => setField("katSayi", "1")}
        onClose={() => setShowKatsayiModal(false)}
      />

      <MahsuplasamaModal
        open={showMahsupModal}
        years={mahsupYears}
        onSave={(total) => setField("mahsup", total > 0 ? formatMoney(total) : "")}
        onClose={() => setShowMahsupModal(false)}
      />

      <ConfirmDialog
        open={deleteCaseTarget !== null}
        title="Kaydı sil"
        description={`"${deleteCaseTarget?.name ?? ""}" kaydı silinecek. Bu işlem geri alınamaz.`}
        confirmLabel="Sil"
        danger
        onConfirm={confirmDeleteCase}
        onCancel={() => setDeleteCaseTarget(null)}
      />
      <ConfirmDialog
        open={discardOpen}
        title="Kaydedilmemiş değişiklikler"
        description="Devam ederseniz mevcut formdaki kaydedilmemiş değişiklikler kaybolur. Devam edilsin mi?"
        confirmLabel="Değişiklikleri at"
        cancelLabel="Düzenlemeye dön"
        danger
        onConfirm={() => {
          setDiscardOpen(false);
          commitAction(pendingAction);
          setPendingAction(null);
        }}
        onCancel={() => {
          setDiscardOpen(false);
          setPendingAction(null);
        }}
      />

      <GuidedTourHost
        definition={FM_STANDART_TOUR}
        active={tour.active}
        onActiveChange={tour.setActive}
        welcomeOpen={tour.welcomeOpen}
        onWelcomeOpenChange={tour.setWelcomeOpen}
        welcomeTitle={FM_STANDART_TOUR_WELCOME_TITLE}
        welcomeBody={FM_STANDART_TOUR_WELCOME_BODY}
        welcomeStartLabel="Başlat"
        welcomeLaterLabel="Kendim devam edeceğim"
        welcomeNeverLabel="Bir daha gösterme"
        initialStepIndex={tour.resumeStepIndex}
        onCollectingComplete={() => {
          tour.completeTour();
          toast.success("Kılavuz tamamlandı. Hesaplamanızı önizleyebilir veya kaydedebilirsiniz.");
        }}
        paused={tourPaused}
      />
    </div>
  );
}
