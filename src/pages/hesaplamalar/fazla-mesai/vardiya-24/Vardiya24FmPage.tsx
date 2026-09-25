/**
 * 24 Saat Çalışma Hesaplama — V3.5 sayfa (V3 işlev paritesi).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  Calculator,
  CirclePlay,
  Clock,
  Eye,
  FilePlus2,
  FolderOpen,
  Plus,
  Save,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { ApiError } from "@/api/client";
import { CalculationPreviewModal, type PreviewSection } from "@/components/calculation-preview";
import { DraftDateInput } from "@/components/form";
import { GuidedTourHost, useGuidedTourController } from "@/components/guided-tour";
import tourStyles from "@/components/guided-tour/GuidedTour.module.css";
import { useDeferredFormMemo } from "@/hooks/useDeferredFormMemo";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { useToast } from "@/context/ToastContext";
import {
  FM_VARDIYA_24_TOUR,
  FM_VARDIYA_24_TOUR_WELCOME_BODY,
  FM_VARDIYA_24_TOUR_WELCOME_TITLE,
} from "./guidedTour";
import {
  ManualBrutWageApplyControls,
  clearAllManualBrutFromRowOverrides,
  isManualBrutActiveInOverrides,
  mergeManualWageBrutsIntoRowOverrides,
} from "@/features/manual-brut-wage";
import {
  listVardiya24FmCases,
  loadVardiya24FmCase,
  removeVardiya24FmCase,
  resolveSavedCaseDisplayName,
  saveVardiya24FmCase,
} from "./backendCase";
import type { FmSavedCaseListItem } from "../shared/fmBackendCrud";
import { CetvelTable } from "./CetvelTable";
import {
  computeVardiya24Result,
  createManualPeriodRow,
  formatMoney,
  parseKatsayi,
  sanitizeMoneyTyping,
  validateDateRange,
} from "./engine";
import { ExclusionsPanel } from "./ExclusionsPanel";
import { KatsayiModal } from "./KatsayiModal";
import { MahsuplasamaModal } from "./MahsuplasamaModal";
import { MetinHesaplamasi } from "./MetinHesaplamasi";
import {
  createEmptyForm,
  createEmptyWitness,
  type RowOverride,
  type Vardiya24FormSnapshot,
  type Witness,
} from "./model";
import { UbgtPickerModal } from "./UbgtPickerModal";
import { ZamanasimiPickerModal } from "./ZamanasimiPickerModal";
import { ZamanasimiCetvelBanner } from "../shared/ZamanasimiCetvelBanner";
import { insertExclusionsPreviewSection } from "../shared/exclusionsPreview";
import { formatIsoDateRangeTR, formatIsoDateTR } from "@/utils/dateDisplay";
import { NotlarAccordion } from "../standart/NotlarAccordion";
import styles from "./Vardiya24FmPage.module.css";

const PAGE_TITLE = "24 Saat Çalışma Hesaplama";

type PendingAction = { kind: "new" } | { kind: "open"; caseId: string } | null;

function snapshotKey(s: Vardiya24FormSnapshot): string {
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

export default function Vardiya24FmPage() {
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const caseIdParam = searchParams.get("caseId");

  const [form, setForm] = useState<Vardiya24FormSnapshot>(() => createEmptyForm());

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

  const modalReturnFocusRef = useRef<HTMLElement | null>(null);

  const setField = <K extends keyof Vardiya24FormSnapshot>(key: K, value: Vardiya24FormSnapshot[K]) => {
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
      const items = await listVardiya24FmCases();
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
  const result = useDeferredFormMemo(form, computeVardiya24Result);

  const katSayiNum = parseKatsayi(form.katSayi);
  const hasCustomKatsayi = katSayiNum > 0 && katSayiNum !== 1;
  const zamanasimiBaslangic = form.zamanasimi?.nihaiBaslangic || null;

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

  const displayRows = useMemo(
    () =>
      result.rows.filter(
        (r) => r.isManual || ((Number(r.fmHours) || 0) !== 0 && (Number(r.weeks) || 0) !== 0 && (Number(r.fm) || 0) !== 0),
      ),
    [result.rows],
  );

  const mahsupYears = useMemo(() => {
    const years = new Set<number>();
    for (const row of result.rows) {
      const y = Number(row.startISO.slice(0, 4));
      if (Number.isFinite(y) && y > 1900) years.add(y);
    }
    if (form.iseGiris) years.add(Number(form.iseGiris.slice(0, 4)));
    if (form.istenCikis) years.add(Number(form.istenCikis.slice(0, 4)));
    return Array.from(years).sort((a, b) => a - b);
  }, [result.rows, form.iseGiris, form.istenCikis]);

  const ubgtRange = useMemo(() => {
    let start = form.iseGiris || "";
    let end = form.istenCikis || "";
    for (const r of result.rows) {
      if (r.startISO && (!start || r.startISO < start)) start = r.startISO;
      if (r.endISO && (!end || r.endISO > end)) end = r.endISO;
    }
    return { start, end };
  }, [form.iseGiris, form.istenCikis, result.rows]);

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

  const applyBackendForm = useCallback((loaded: Vardiya24FormSnapshot, recordId: string, recordName: string) => {
    setForm(loaded);
    setCurrentRecordId(recordId);
    setCurrentRecordName(recordName);
    setBaseline(snapshotKey(loaded));
    triggerFormSwap();
  }, []);

  const applyOpenCase = useCallback(
    async (c: FmSavedCaseListItem) => {
      try {
        const { record, form: loaded } = await loadVardiya24FmCase(Number(c.id));
        backendLoadedCaseIdRef.current = String(record.id);
        const next = new URLSearchParams(searchParams);
        next.set("caseId", String(record.id));
        setSearchParams(next, { replace: true });
        applyBackendForm(loaded, String(record.id), resolveSavedCaseDisplayName(record));
        setShowRecordsModal(false);
        toast.success("Kayıt yüklendi");
      } catch (error: unknown) {
        const message =
          error instanceof ApiError ? error.message : error instanceof Error ? error.message : "Kayıt açılamadı";
        toast.error(message);
      }
    },
    [applyBackendForm, searchParams, setSearchParams, toast],
  );

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

    void loadVardiya24FmCase(numericId)
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

  const commitAction = (action: PendingAction) => {
    if (!action) return;
    if (action.kind === "new") {
      applyNewForm();
      return;
    }
    const found = savedCases.find((c) => c.id === action.caseId);
    if (found) applyOpenCase(found);
  };

  const requestAction = (action: PendingAction) => {
    if (isDirty) {
      setPendingAction(action);
      setDiscardOpen(true);
      return;
    }
    commitAction(action);
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
    const manual = createManualPeriodRow(afterId, kats);
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
          const { hidden: _h, ...rest } = ov;
          if (Object.keys(rest).length > 0) next[id] = rest;
        } else {
          next[id] = ov;
        }
      }
      return { ...prev, rowOverrides: next };
    });
  };

  const persistCase = async (name: string) => {
    if (isSavingCase) return;
    setIsSavingCase(true);
    const wasUpdate = !!currentRecordId;
    try {
      const saved = await saveVardiya24FmCase(
        name,
        { ...form, mode270: "none" },
        { toplamFm: result.toplamFm, sonNet: result.sonNet, rowCount: displayRows.length },
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
        await removeVardiya24FmCase(deleteCaseTarget.id);
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

  const updateWitness = (id: string, patch: Partial<Witness>) => {
    setField(
      "taniklar",
      form.taniklar.map((w) => (w.id === id ? { ...w, ...patch } : w)),
    );
  };

  const previewSections = useMemo((): PreviewSection[] => {
    const money = (v: number) => `${formatMoney(v)} ₺`;
    return insertExclusionsPreviewSection(
      [
      {
        id: "ust",
        title: "Genel Bilgiler",
        headers: ["İşe Giriş", "İşten Çıkış", "Çalışma Süresi", "Mod"],
        rows: [[formatIsoDateTR(form.iseGiris, "-"), formatIsoDateTR(form.istenCikis, "-"), "-", "24 saat"]],
      },
      {
        id: "cetvel",
        title: "Fazla Mesai Cetveli",
        headers: ["Dönem", "Hafta Tipi", "Toplam Hafta", "Haftalık FM Saat", "Brüt Ücret", "225", "1,5", "Ücret"],
        rows: displayRows.map((r) => {
          const period = formatIsoDateRangeTR(r.startISO, r.endISO, "–");
          const note = r.yillikIzinAciklama || r.note;
          return [
            note ? `${period} ${note}` : period,
            r.weekTypeLabel || "-",
            String(r.weeks),
            String(r.fmHours),
            money(r.brut),
            "225",
            "1,5",
            money(r.fm),
          ];
        }),
        lastRowTone: "blue",
      },
      {
        id: "brutnet",
        title: "Brüt'ten Net'e",
        headers: ["Kalem", "Tutar"],
        rows: [
          ["Brüt Fazla Mesai", money(result.toplamFm)],
          ["SGK (%14)", `-${money(result.sgk)}`],
          ["İşsizlik (%1)", `-${money(result.issizlik)}`],
          [`Gelir Vergisi ${result.gelirVergisiDilimleri}`.trim(), `-${money(result.gelirVergisi)}`],
          ["Damga Vergisi", `-${money(result.damgaVergisi)}`],
          ["Net Fazla Mesai", money(result.netYillik)],
        ],
        lastRowTone: "green",
      },
      {
        id: "mahsup",
        title: "Mahsuplaşma",
        headers: ["Kalem", "Tutar"],
        rows: [
          ["Toplam Fazla Mesai (Brüt)", money(result.toplamFm)],
          ["1/3 Hakkaniyet İndirimi", `-${money(result.hakkaniyetIndirimi)}`],
          ...(result.mahsupTutari > 0 ? [["Mahsuplaşma Miktarı", `-${money(result.mahsupTutari)}`]] : []),
          ["Son Net Alacak", money(result.sonNet)],
        ],
        lastRowTone: "green",
      },
      ],
      form.exclusions,
    );
  }, [form.iseGiris, form.istenCikis, displayRows, result]);

  return (
    <div className={`${styles.page} ${formSwap ? styles.formSwap : ""}`} data-page="fazla-mesai-vardiya-24">
      <header className={styles.hero}>
        <div className={styles.heroMain}>
          <div className={styles.heroIcon}>
            <Clock size={22} />
          </div>
          <div>
            <h1 className={styles.title}>{PAGE_TITLE}</h1>
            <p className={styles.desc}>Gün aşırı 24/24 vardiya; 3 veya 4 çalışma günü → 9 / 12 saat haftalık fazla mesai.</p>
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
        <div className={styles.bannerWarn}>
          <AlertTriangle size={16} />
          <span>{casesError}</span>
          <Button variant="soft" size="sm" onClick={() => void reloadCases()}>
            Yeniden dene
          </Button>
        </div>
      ) : null}

      {caseLoading ? <p className={styles.panelHint}>Kayıt yükleniyor…</p> : null}
      {dateError ? (
        <div className={styles.bannerWarn}>
          <AlertTriangle size={16} />
          <span>{dateError}</span>
        </div>
      ) : null}

      <section className={styles.card} style={{ animationDelay: "40ms" }} data-tour="fm-vardiya-24-donem">
        <h2 className={styles.cardTitle}>Dava dönemi</h2>
        <div className={styles.grid3}>
          <label className={styles.field}>
            <span>İşe giriş</span>
            <DraftDateInput className={styles.input} value={form.iseGiris} onCommit={(v) => setField("iseGiris", v)} />
          </label>
          <label className={styles.field}>
            <span>İşten çıkış</span>
            <DraftDateInput className={styles.input} value={form.istenCikis} onCommit={(v) => setField("istenCikis", v)} />
          </label>
          <label className={styles.field}>
            <span>Başlangıç vardiya günü</span>
            <select
              className={styles.input}
              value={form.anchorIsWorkDay ? "work" : "rest"}
              onChange={(e) => setField("anchorIsWorkDay", e.target.value === "work")}
            >
              <option value="work">İlk gün çalıştı</option>
              <option value="rest">İlk gün dinlendi</option>
            </select>
          </label>
        </div>
      </section>

      <section className={styles.card} style={{ animationDelay: "70ms" }} data-tour="fm-vardiya-24-taniklar">
        <div className={styles.cardTitleRow}>
          <h2 className={styles.cardTitle}>Tanık beyanları (tarih aralığı)</h2>
          <Button
            variant="soft"
            size="sm"
            onClick={() => setField("taniklar", [...form.taniklar, createEmptyWitness()])}
          >
            <Plus size={14} />
            Tanık ekle
          </Button>
        </div>
        <p className={styles.panelHint}>
          Tanık tarihleri davacı dönemine göre kırpılır. Geçerli tanık aralığı yoksa hesaplama yalnızca davacı işe
          giriş–çıkış tarihleri üzerinden yapılır.
        </p>
        <div className={styles.witnessList}>
          {form.taniklar.map((t, idx) => (
            <div key={t.id} className={styles.witnessRow}>
              <label className={styles.field}>
                <span>İsim</span>
                <input
                  type="text"
                  className={styles.input}
                  value={t.name}
                  placeholder={`Tanık ${idx + 1}`}
                  onChange={(e) => updateWitness(t.id, { name: e.target.value })}
                />
              </label>
              <label className={styles.field}>
                <span>Başlangıç</span>
                <DraftDateInput className={styles.input} value={t.dateIn} onCommit={(v) => updateWitness(t.id, { dateIn: v })} />
              </label>
              <label className={styles.field}>
                <span>Bitiş</span>
                <DraftDateInput className={styles.input} value={t.dateOut} onCommit={(v) => updateWitness(t.id, { dateOut: v })} />
              </label>
              <button
                type="button"
                className={styles.iconBtn}
                disabled={form.taniklar.length <= 1}
                onClick={() => setField("taniklar", form.taniklar.filter((w) => w.id !== t.id))}
                aria-label="Tanığı sil"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      </section>

      <MetinHesaplamasi anchorIsWorkDay={form.anchorIsWorkDay} />

      <div data-tour="fm-vardiya-24-ayarlar" style={{ display: "grid", gap: "1rem", minWidth: 0 }}>
        <ExclusionsPanel
          exclusions={form.exclusions}
          onChange={(next) => setField("exclusions", next)}
          onOpenUbgtPicker={() => setShowUbgtPicker(true)}
          visibleAfterIso={form.zamanasimi?.nihaiBaslangic ?? null}
          onOverlayOpenChange={setExclusionOverlayOpen}
        />

        <section className={styles.card} style={{ animationDelay: "100ms" }}>
          <h2 className={styles.cardTitle}>Diğer Ayarlar</h2>
          <div className={styles.toolbarRow}>
            <button
              type="button"
              className={`${styles.toolBtn} ${zamanasimiBaslangic ? styles.toolBtnActive : ""}`}
              onClick={() =>
                zamanasimiBaslangic
                  ? (setField("zamanasimi", null), toast.success("Zamanaşımı kaldırıldı."))
                  : setShowZamanasimiModal(true)
              }
            >
              {zamanasimiBaslangic ? "Zamanaşımı" : "Zamanaşımı Hesabı"}
            </button>
            <button
              type="button"
              className={`${styles.toolBtn} ${hasCustomKatsayi ? styles.toolBtnActive : ""}`}
              onClick={() => (hasCustomKatsayi ? setField("katSayi", "1") : setShowKatsayiModal(true))}
            >
              {hasCustomKatsayi ? `Katsayı ${katSayiNum.toFixed(2)}` : "Kat Sayı"}
            </button>
          </div>
          <ZamanasimiCetvelBanner nihaiBaslangic={zamanasimiBaslangic} />
          {hiddenRowCount > 0 ? (
            <Button variant="soft" size="sm" onClick={showHiddenRows}>
              Gizlenen {hiddenRowCount} satırı göster
            </Button>
          ) : null}
        </section>
      </div>

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

      <section className={styles.card} style={{ animationDelay: "190ms" }}>
        <h2 className={styles.cardTitle}>Brütten nete</h2>
        <div className={styles.totalsList}>
          <div className={styles.totalRow}>
            <span>Brüt</span>
            <FlashValue value={formatMoney(result.toplamFm)} />
          </div>
          <div className={`${styles.totalRow} ${styles.deduct}`}>
            <span>SGK (%14)</span>
            <span>-{formatMoney(result.sgk)}</span>
          </div>
          <div className={`${styles.totalRow} ${styles.deduct}`}>
            <span>İşsizlik (%1)</span>
            <span>-{formatMoney(result.issizlik)}</span>
          </div>
          <div className={`${styles.totalRow} ${styles.deduct}`}>
            <span>Gelir vergisi {result.gelirVergisiDilimleri}</span>
            <span>-{formatMoney(result.gelirVergisi)}</span>
          </div>
          <div className={`${styles.totalRow} ${styles.deduct}`}>
            <span>Damga</span>
            <span>-{formatMoney(result.damgaVergisi)}</span>
          </div>
          <div className={`${styles.totalRow} ${styles.netRow}`}>
            <span>Net</span>
            <FlashValue value={formatMoney(result.netYillik)} />
          </div>
        </div>
      </section>

      <section className={`${styles.card} ${styles.hakkaniyetCard}`} style={{ animationDelay: "220ms" }}>
        <h2 className={styles.cardTitle}>Hakkaniyet indirimi / mahsuplaşma</h2>
        <p className={styles.panelHint}>
          Son net alacak, brüt fazla mesai üzerinden 1/3 hakkaniyet indirimi ve (varsa) mahsuplaşma düşülerek
          hesaplanır. Brütten nete bölümündeki vergi kesintileri ayrıdır.
        </p>
        <div className={styles.totalsList}>
          <div className={styles.totalRow}>
            <span>Toplam fazla mesai (brüt)</span>
            <FlashValue value={formatMoney(result.toplamFm)} />
          </div>
          <div className={`${styles.totalRow} ${styles.deduct}`}>
            <span>1/3 hakkaniyet indirimi</span>
            <span>-{formatMoney(result.hakkaniyetIndirimi)}</span>
          </div>
          {result.mahsupTutari > 0 ? (
            <div className={`${styles.totalRow} ${styles.deduct}`}>
              <span>Mahsuplaşma</span>
              <span>-{formatMoney(result.mahsupTutari)}</span>
            </div>
          ) : null}
          <div className={styles.mahsupRow}>
            <label className={styles.field}>
              <span>Mahsuplaşma miktarı</span>
              <input
                type="text"
                className={styles.input}
                value={form.mahsup}
                placeholder="0"
                onChange={(e) => setField("mahsup", sanitizeMoneyTyping(e.target.value))}
              />
            </label>
            <Button variant="soft" onClick={() => setShowMahsupModal(true)}>
              Mahsuplaşma ekle
            </Button>
          </div>
          <div className={`${styles.totalRow} ${styles.netRow}`}>
            <span>Son net alacak</span>
            <FlashValue value={formatMoney(result.sonNet)} className={styles.sonNet} />
          </div>
        </div>
      </section>

      <section className={styles.card} style={{ animationDelay: "250ms" }}>
        <NotlarAccordion />
      </section>

      <div
        className={`${styles.stickyBar} ${isDirty ? styles.stickyBarDirty : ""} ${saveFlash ? styles.stickyBarSaved : ""}`}
        data-tour="fm-vardiya-24-kaydet-actions"
      >
        <div className={styles.stickyInner}>
          <p className={styles.stickyStatus}>
            {caseLoading ? "Yükleniyor…" : isDirty ? "Kaydedilmemiş değişiklikler" : currentRecordName ? "Kayıtlı" : "Hazır"}
          </p>
          <div className={styles.stickyActions}>
            <Button variant="soft" onClick={() => setShowPreview(true)} disabled={displayRows.length === 0}>
              <Eye size={14} />
              Önizleme
            </Button>
            <Button variant="soft" onClick={() => requestAction({ kind: "new" })}>
              <FilePlus2 size={14} />
              Yeni
            </Button>
            <Button variant="primary" onClick={handleSaveCase} disabled={isSavingCase}>
              <Save size={14} />
              {isSavingCase ? "Kaydediliyor…" : currentRecordId ? "Güncelle" : "Kaydet"}
            </Button>
          </div>
        </div>
      </div>

      <CalculationPreviewModal
        open={showPreview}
        title={PAGE_TITLE}
        sections={previewSections}
        contentId="report-content-vardiya-24"
        onClose={() => setShowPreview(false)}
      />

      <UbgtPickerModal
        open={showUbgtPicker}
        rangeStart={ubgtRange.start}
        rangeEnd={ubgtRange.end}
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
        onApply={(k) => setField("katSayi", String(k))}
        onReset={() => setField("katSayi", "1")}
        onClose={() => setShowKatsayiModal(false)}
      />

      <MahsuplasamaModal
        open={showMahsupModal}
        years={mahsupYears}
        onSave={(total) => {
          setField("mahsup", formatMoney(total));
          setShowMahsupModal(false);
        }}
        onClose={() => setShowMahsupModal(false)}
      />

      <NameModal
        open={showCaseSaveModal}
        title="Hesabı Kaydet"
        placeholder="Kayıt adı"
        confirmLabel="Kaydet"
        initialValue={currentRecordName ?? ""}
        onClose={() => setShowCaseSaveModal(false)}
        onSave={persistCase}
      />

      {showRecordsModal ? (
        <div className={styles.modalOverlay} role="presentation" onClick={() => setShowRecordsModal(false)}>
          <div className={styles.modalCard} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className={styles.cardTitleRow}>
              <h2 className={styles.modalTitle}>Kayıtlı hesaplar</h2>
              <button type="button" className={styles.iconBtn} onClick={() => setShowRecordsModal(false)} aria-label="Kapat">
                <X size={16} />
              </button>
            </div>
            {savedCases.length === 0 ? (
              <p className={styles.emptyText}>Henüz kayıt yok.</p>
            ) : (
              <ul className={styles.setList}>
                {savedCases.map((c) => (
                  <li key={c.id} className={styles.setRow}>
                    <div className={styles.setInfo}>
                      <strong>{c.name}</strong>
                      <span>{new Date(c.updatedAt).toLocaleString("tr-TR")}</span>
                    </div>
                    <div className={styles.inlineActions}>
                      <Button variant="soft" size="sm" onClick={() => requestAction({ kind: "open", caseId: c.id })}>
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
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={discardOpen}
        title="Değişiklikler kaybolacak"
        description="Kaydedilmemiş değişiklikler var. Devam edilsin mi?"
        confirmLabel="Devam"
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

      <ConfirmDialog
        open={!!deleteCaseTarget}
        title="Kayıt silinsin mi?"
        description={deleteCaseTarget ? `"${deleteCaseTarget.name}" silinsin mi?` : ""}
        confirmLabel="Sil"
        danger
        onConfirm={confirmDeleteCase}
        onCancel={() => setDeleteCaseTarget(null)}
      />

      <div className={styles.srOnly} aria-hidden>
        <Calculator />
      </div>

      <GuidedTourHost
        definition={FM_VARDIYA_24_TOUR}
        active={tour.active}
        onActiveChange={tour.setActive}
        welcomeOpen={tour.welcomeOpen}
        onWelcomeOpenChange={tour.setWelcomeOpen}
        welcomeTitle={FM_VARDIYA_24_TOUR_WELCOME_TITLE}
        welcomeBody={FM_VARDIYA_24_TOUR_WELCOME_BODY}
        welcomeStartLabel="Başlat"
        welcomeLaterLabel="Kendim devam edeceğim"
        initialStepIndex={tour.resumeStepIndex}
        onCollectingComplete={() => {
          tour.completeTour();
          toast.info("Kılavuz tamamlandı. Hesaplamanızı önizleyebilir veya kaydedebilirsiniz.");
        }}
        paused={tourPaused}
      />
    </div>
  );
}
