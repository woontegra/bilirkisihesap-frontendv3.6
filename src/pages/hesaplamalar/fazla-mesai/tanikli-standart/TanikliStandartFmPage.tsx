import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  Calculator,
  CirclePlay,
  Eye,
  FilePlus2,
  FolderOpen,
  History,
  Plus,
  Save,
  ShieldCheck,
  Trash2,
  Users,
  X,
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
  ManualBrutWageApplyControls,
  clearAllManualBrutFromRowOverrides,
  isManualBrutActiveInOverrides,
  mergeManualWageBrutsIntoRowOverrides,
} from "@/features/manual-brut-wage";
import {
  FM_TANIKLI_STANDART_TOUR,
  FM_TANIKLI_STANDART_TOUR_WELCOME_BODY,
  FM_TANIKLI_STANDART_TOUR_WELCOME_TITLE,
} from "./guidedTour";
import {
  listTanikliFmCases,
  loadTanikliFmCase,
  removeTanikliFmCase,
  resolveSavedCaseDisplayName,
  saveTanikliFmCase,
} from "./backendCase";
import type { FmSavedCaseListItem } from "../shared/fmBackendCrud";
import {
  createManualPeriodRow,
  formatMoney,
  parseKatsayi,
  sanitizeMoneyTyping,
  validateDateRange,
} from "./engine";
import {
  computeTanikliFmResultV3,
  logTanikliFmV3EngineCheck,
} from "./v3-engine/adapter";
import {
  createEmptyForm,
  createEmptyWitness,
  type RowOverride,
  type TanikliFormSnapshot,
  type Witness,
} from "./model";
import { ExclusionsPanel } from "./ExclusionsPanel";
import { KatsayiModal } from "./KatsayiModal";
import { MahsuplasamaModal } from "./MahsuplasamaModal";
import { MetinHesaplamasi } from "./MetinHesaplamasi";
import { CetvelTable } from "./CetvelTable";
import { UbgtPickerModal } from "./UbgtPickerModal";
import { ZamanasimiPickerModal } from "./ZamanasimiPickerModal";
import { ZamanasimiCetvelBanner } from "../shared/ZamanasimiCetvelBanner";
import { insertExclusionsPreviewSection } from "../shared/exclusionsPreview";
import { NotlarAccordion } from "../standart/NotlarAccordion";
import { formatIsoDateRangeTR, formatIsoDateTR } from "@/utils/dateDisplay";
import styles from "./TanikliStandartFmPage.module.css";

const PAGE_TITLE = "Tanıklı Standart Fazla Mesai Hesaplama";
const WEEKDAY_LABELS = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];

type PendingAction = { kind: "new" } | { kind: "open"; caseId: string } | null;

function snapshotKey(s: TanikliFormSnapshot): string {
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

export default function TanikliStandartFmPage() {
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const caseIdParam = searchParams.get("caseId");

  const [form, setForm] = useState<TanikliFormSnapshot>(() => createEmptyForm());

  const [currentRecordId, setCurrentRecordId] = useState<string | null>(null);
  const [currentRecordName, setCurrentRecordName] = useState<string | null>(null);
  const [savedCases, setSavedCases] = useState<FmSavedCaseListItem[]>([]);
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
  const [deleteCaseTarget, setDeleteCaseTarget] = useState<FmSavedCaseListItem | null>(null);
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

  const setField = <K extends keyof TanikliFormSnapshot>(key: K, value: TanikliFormSnapshot[K]) => {
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
      const items = await listTanikliFmCases();
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

  const result = useDeferredFormMemo(form, computeTanikliFmResultV3);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    (window as unknown as { __tanikliFmV3Check?: () => void }).__tanikliFmV3Check = () =>
      logTanikliFmV3EngineCheck(form);
  }, [form]);

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
      else if (showUbgtPicker) setShowUbgtPicker(false);
      else if (showZamanasimiModal) setShowZamanasimiModal(false);
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
  }, [
    showRecordsModal,
    showCaseSaveModal,
    showPreview,
    showUbgtPicker,
    showZamanasimiModal,
    showKatsayiModal,
    showMahsupModal,
    deleteCaseTarget,
    discardOpen,
  ]);

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
    async (c: FmSavedCaseListItem) => {
      try {
        const { record, form: loaded } = await loadTanikliFmCase(Number(c.id));
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

  const applyBackendForm = useCallback((loaded: TanikliFormSnapshot, recordId: string, recordName: string) => {
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

    void loadTanikliFmCase(numericId)
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

  /* tanık satırları */
  const addWitness = () => {
    setField("taniklar", [...form.taniklar, createEmptyWitness()]);
  };

  const updateWitness = (id: string, patch: Partial<Witness>) => {
    setField(
      "taniklar",
      form.taniklar.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    );
  };

  const removeWitness = (id: string) => {
    if (form.taniklar.length <= 1) return;
    setField(
      "taniklar",
      form.taniklar.filter((row) => row.id !== id),
    );
  };

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
    const fmHours = result.rows.find((r) => r.id === afterId)?.fmHours ?? result.segments[0]?.fmHours ?? 0;
    const manual = createManualPeriodRow(afterId, kats);
    manual.fmHours = fmHours;
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

  const hiddenRowCount = Object.values(form.rowOverrides ?? {}).filter((o) => o.hidden).length;
  const showHiddenRows = () => {
    setForm((prev) => {
      const next: Record<string, RowOverride> = {};
      for (const [id, ov] of Object.entries(prev.rowOverrides ?? {})) {
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

  /* kayıt işlemleri */
  const persistCase = async (name: string) => {
    if (isSavingCase) return;
    setIsSavingCase(true);
    const wasUpdate = !!currentRecordId;
    try {
      const saved = await saveTanikliFmCase(
        name,
        form,
        { toplamFm: result.toplamFm, sonNet: result.mahsupSonrasiNet, rowCount: result.rows.length },
        currentRecordId,
      );
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
        await removeTanikliFmCase(deleteCaseTarget.id);
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

    sections.push({
      id: "temel",
      title: "Temel Bilgiler",
      headers: ["İşe Giriş", "İşten Çıkış", "Varsayılan Haftalık Gün", "Tanık Sayısı"],
      rows: [[
        formatIsoDateTR(form.iseGiris),
        formatIsoDateTR(form.istenCikis),
        `${form.weeklyDays} gün`,
        String(form.taniklar.length),
      ]],
    });

    sections.push({
      id: "segmentler",
      title: "Tanık Dilimleri (birleştirilmiş)",
      headers: ["Dönem", "FM Saati", "Günlük Net", "Haftalık Gün"],
      rows: result.segments.map((s) => [
        formatIsoDateRangeTR(s.startISO, s.endISO),
        s.fmHours.toFixed(2).replace(".", ","),
        s.dailyNet != null ? s.dailyNet.toFixed(2).replace(".", ",") : "—",
        s.weeklyDays != null ? String(s.weeklyDays) : "—",
      ]),
    });

    sections.push({
      id: "sonuc",
      title: "Fazla Mesai Hesaplama Cetveli",
      headers: ["Tarih Aralığı", "Hafta", "Ücret", "Kat Sayı", "FM Saati", "225", "1,5", "Fazla Mesai"],
      rows: result.rows.map((r) => [
        `${formatIsoDateRangeTR(r.startISO, r.endISO)}${r.note ? ` ${r.note}` : ""}`,
        String(r.weeks),
        money(r.brut),
        String(r.katsayi),
        r.fmHours.toFixed(2).replace(".", ","),
        "225",
        "1,5",
        money(r.fm),
      ]),
      lastRowTone: "blue",
    });

    sections.push({
      id: "brutten-nete",
      title: "Brütten Nete (Toplam Bazında)",
      headers: ["Kalem", "Tutar"],
      rows: [
        ["Toplam Fazla Mesai (Brüt)", money(result.toplamFm)],
        ["SGK İşçi Payı (%14)", `-${money(result.sgk)}`],
        ["İşsizlik Sigortası (%1)", `-${money(result.issizlik)}`],
        [`Gelir Vergisi ${result.gelirVergisiDilimleri}`.trim(), `-${money(result.gelirVergisi)}`],
        ["Damga Vergisi (Binde 7,59)", `-${money(result.damgaVergisi)}`],
        ["Net Yıllık", money(result.netYillik)],
      ],
      lastRowTone: "green",
    });

    sections.push({
      id: "hakkaniyet",
      title: "Hakkaniyet İndirimi / Mahsup",
      headers: ["Kalem", "Tutar"],
      rows: [
        ["Toplam Fazla Mesai (Brüt)", money(result.toplamFm)],
        ["Hakkaniyet İndirimi (Brüt / 3)", `-${money(result.hakkaniyetOneri)}`],
        ...(result.mahsupTutari > 0 ? ([["Mahsup Tutarı", `-${money(result.mahsupTutari)}`]] as string[][]) : []),
        ["Son Net Alacak", money(result.mahsupSonrasiNet)],
      ],
      lastRowTone: "green",
    });

    return insertExclusionsPreviewSection(sections, form.exclusions, "sonuc");
  }, [form, result]);

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
            <Users size={22} />
          </div>
          <div>
            <h1 className={styles.title}>{PAGE_TITLE}</h1>
            <p className={styles.desc}>
              Davacı beyanı esas alınarak, tanık dönemleriyle kesişen günlerde tanık saatleri (kesişim) uygulanır;
              tanık kapsamayan günlerde davacı beyanı geçerlidir.
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
            <FlashValue
              className={styles.quickTotalValue}
              value={`${formatMoney(result.toplamFm)} ₺`}
            />
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
        <section className={styles.card} style={{ animationDelay: "60ms" }} data-tour="fm-tanikli-standart-donem">
          <div className={styles.cardTitleRow}>
            <h2 className={styles.cardTitle}>Çalışma Dönemi</h2>
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
                  <span className={styles.fieldLabel}>7 Gün Çalışma Şekli</span>
                  <select
                    className={styles.selectInput}
                    value={form.sevenDayMode}
                    onChange={(e) => setField("sevenDayMode", e.target.value as "tatilli" | "tatilsiz")}
                  >
                    <option value="tatilsiz">Tatilsiz (7 gün tam çalışma)</option>
                    <option value="tatilli">Tatilli (6 gün + hafta tatili mesaisi)</option>
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
                  <option value="">Seçilmedi (tüm günlerde izin düş)</option>
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
            <div data-tour="fm-tanikli-standart-davaci-saatleri">
              <h2 className={styles.cardTitle}>Davacı Beyanı — Tanık Kapsamayan Günler</h2>
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
            <MetinHesaplamasi
              weeklyDays={form.weeklyDays}
              sevenDayMode={form.sevenDayMode}
              onSevenDayModeChange={(mode) => setField("sevenDayMode", mode)}
              davaciIn={form.davaciIn}
              davaciOut={form.davaciOut}
              taniklar={form.taniklar}
            />
          </section>

          <section className={styles.card} style={{ animationDelay: "120ms" }} data-tour="fm-tanikli-standart-taniklar">
            <div className={styles.cardTitleRow}>
              <h2 className={styles.cardTitle}>Tanık Beyanları</h2>
            </div>
            <div className={styles.witnessList}>
              {form.taniklar.map((w, idx) => (
                <div key={w.id} className={styles.witnessCard}>
                  <div className={styles.witnessHead}>
                    <input
                      className={styles.witnessName}
                      value={w.name ?? ""}
                      onChange={(e) => updateWitness(w.id, { name: e.target.value })}
                      placeholder={`Tanık ${idx + 1}`}
                    />
                    <button
                      type="button"
                      className={styles.removeBtn}
                      onClick={() => removeWitness(w.id)}
                      disabled={form.taniklar.length <= 1}
                      aria-label="Tanığı kaldır"
                      title="Tanığı kaldır"
                    >
                      <X size={14} />
                    </button>
                  </div>
                  <div className={styles.witnessGrid}>
                    <label className={styles.field}>
                      <span className={styles.fieldLabel}>Başlangıç</span>
                      <input
                        type="date"
                        className={styles.dateInput}
                        value={w.dateIn}
                        onChange={(e) => updateWitness(w.id, { dateIn: e.target.value })}
                      />
                    </label>
                    <label className={styles.field}>
                      <span className={styles.fieldLabel}>Bitiş</span>
                      <input
                        type="date"
                        className={styles.dateInput}
                        value={w.dateOut}
                        onChange={(e) => updateWitness(w.id, { dateOut: e.target.value })}
                      />
                    </label>
                    <label className={styles.field}>
                      <span className={styles.fieldLabel}>Giriş</span>
                      <input
                        type="time"
                        className={styles.dateInput}
                        value={w.in}
                        onChange={(e) => updateWitness(w.id, { in: e.target.value })}
                      />
                    </label>
                    <label className={styles.field}>
                      <span className={styles.fieldLabel}>Çıkış</span>
                      <input
                        type="time"
                        className={styles.dateInput}
                        value={w.out}
                        onChange={(e) => updateWitness(w.id, { out: e.target.value })}
                      />
                    </label>
                    <label className={styles.field}>
                      <span className={styles.fieldLabel}>Haftada çalışılan gün (FM)</span>
                      <select
                        className={styles.selectInput}
                        value={w.weeklyDays ?? ""}
                        onChange={(e) =>
                          updateWitness(w.id, { weeklyDays: e.target.value === "" ? "" : Number(e.target.value) })
                        }
                      >
                        <option value="">Davacı ile aynı</option>
                        {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                          <option key={n} value={n}>
                            {n} gün
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                </div>
              ))}
              <button type="button" className={styles.addRowBtn} onClick={addWitness}>
                <Plus size={14} />
                Tanık Ekle
              </button>
            </div>
          </section>

          <div data-tour="fm-tanikli-standart-ayarlar" style={{ display: "grid", gap: "1rem", minWidth: 0 }}>
            <ExclusionsPanel
              exclusions={form.exclusions}
              onChange={(next) => setField("exclusions", next)}
              onOpenUbgtPicker={() => setShowUbgtPicker(true)}
              visibleAfterIso={form.zamanasimi?.nihaiBaslangic ?? null}
              onOverlayOpenChange={setExclusionOverlayOpen}
            />

            <section className={styles.card} style={{ animationDelay: "160ms" }}>
              <h2 className={styles.cardTitle}>Diğer Ayarlar</h2>
              <div className={styles.basicGrid}>
                <div className={styles.field}>
                  <span className={styles.fieldLabel}>Kat Sayı</span>
                  <button
                    type="button"
                    className={`${styles.zamanasimiBadge} ${hasCustomKatsayi ? styles.zamanasimiBadgeActive : ""}`}
                    onClick={() => setShowKatsayiModal(true)}
                    title={hasCustomKatsayi ? "Katsayıyı değiştir veya sıfırla" : "Katsayı hesapla"}
                  >
                    <Calculator size={13} />
                    {hasCustomKatsayi ? `Katsayı: ${form.katSayi}` : "Kat Sayı Hesapla"}
                  </button>
                </div>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>270 Gün Uygulaması</span>
                  <select
                    className={styles.selectInput}
                    value={form.mode270}
                    onChange={(e) => setField("mode270", e.target.value as TanikliFormSnapshot["mode270"])}
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
                    title={form.zamanasimi ? "Zamanaşımını değiştir veya kaldır" : "Zamanaşımı hesapla"}
                  >
                    <History size={13} />
                    {form.zamanasimi ? `Zamanaşımı: ${form.zamanasimi.nihaiBaslangic}` : "Zamanaşımı Hesapla"}
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

        <article className={styles.panel} style={{ animationDelay: "160ms" }}>
          <header className={styles.panelHead}>
            <h3>Tanık Dilimleri (birleştirilmiş)</h3>
          </header>
          <div className={styles.tableWrap}>
            <table className={styles.resultTable}>
              <thead>
                <tr>
                  <th>Dönem</th>
                  <th>FM Saati</th>
                  <th>Günlük Net</th>
                  <th>Gün</th>
                </tr>
              </thead>
              <tbody>
                {result.segments.length === 0 ? (
                  <tr>
                    <td colSpan={4} className={styles.emptyCell}>
                      Geçerli tanık beyanı girildiğinde dilimler burada oluşur (davacı fill yok).
                    </td>
                  </tr>
                ) : (
                  result.segments.map((s, idx) => (
                    <tr key={`${s.startISO}-${idx}`}>
                      <td>
                        {formatIsoDateRangeTR(s.startISO, s.endISO)}
                      </td>
                      <td>{s.fmHours.toFixed(2).replace(".", ",")}</td>
                      <td>{s.dailyNet != null ? s.dailyNet.toFixed(2).replace(".", ",") : "—"}</td>
                      <td>{s.weeklyDays ?? "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </article>

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
              <span className={styles.deduction}>-{formatMoney(result.hakkaniyetOneri)} ₺</span>
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
                >
                  Mahsuplaşma Ekle
                </button>
              </div>
            </div>
            <div className={`${styles.line} ${styles.netLine}`}>
              <span>Son Net Alacak</span>
              <FlashValue value={`${formatMoney(result.mahsupSonrasiNet)} ₺`} />
            </div>
          </div>
        </article>

        <section className={styles.card} style={{ animationDelay: "220ms" }}>
          <NotlarAccordion />
        </section>
      </div>

      <div
        className={`${styles.stickyBar} ${isDirty ? styles.stickyBarDirty : ""} ${saveFlash ? styles.stickyBarSaved : ""}`}
        data-tour="fm-tanikli-standart-kaydet-actions"
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
              Yeni
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleSaveCase}
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
        contentId="fm-tanikli-word-copy"
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
        onApply={(next) => setField("exclusions", next)}
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
        definition={FM_TANIKLI_STANDART_TOUR}
        active={tour.active}
        onActiveChange={tour.setActive}
        welcomeOpen={tour.welcomeOpen}
        onWelcomeOpenChange={tour.setWelcomeOpen}
        welcomeTitle={FM_TANIKLI_STANDART_TOUR_WELCOME_TITLE}
        welcomeBody={FM_TANIKLI_STANDART_TOUR_WELCOME_BODY}
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
