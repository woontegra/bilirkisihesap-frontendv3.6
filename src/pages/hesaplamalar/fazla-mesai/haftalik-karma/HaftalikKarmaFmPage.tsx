/**
 * Haftalık Karma Fazla Mesai — V3.5 sayfa (V3 işlev paritesi).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  Calculator,
  CalendarRange,
  CirclePlay,
  Eye,
  FilePlus2,
  FolderOpen,
  History,
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
  FM_HAFTALIK_KARMA_TOUR,
  FM_HAFTALIK_KARMA_TOUR_WELCOME_BODY,
  FM_HAFTALIK_KARMA_TOUR_WELCOME_TITLE,
} from "./guidedTour";
import {
  listHaftalikKarmaFmCases,
  loadHaftalikKarmaFmCase,
  removeHaftalikKarmaFmCase,
  resolveSavedCaseDisplayName,
  saveHaftalikKarmaFmCase,
} from "./backendCase";
import type { FmSavedCaseListItem } from "../shared/fmBackendCrud";
import {
  clampDayCountForGroup,
  createManualPeriodRow,
  formatMoney,
  parseKatsayi,
  sanitizeMoneyTyping,
  sumRegisteredWorkDays,
  toNumericDayGroups,
  validateDateRange,
} from "./engine";
import {
  computeHaftalikKarmaResultV3,
  logHaftalikKarmaV3EngineCheck,
} from "./v3-engine/adapter";
import {
  createEmptyHaftalikKarmaForm,
  createEmptyWitness,
  createEmptyWitnessDayGroup,
  type DayGroup,
  type ExclusionItem,
  type HaftalikKarmaFormSnapshot,
  type RowOverride,
  type Witness,
  type WitnessDayGroup,
} from "./model";
import { CetvelTable } from "./CetvelTable";
import { ExclusionsPanel } from "./ExclusionsPanel";
import { KatsayiModal } from "./KatsayiModal";
import { MahsuplasamaModal } from "./MahsuplasamaModal";
import { MetinHesaplamasi } from "./MetinHesaplamasi";
import { UbgtPickerModal } from "./UbgtPickerModal";
import { ZamanasimiPickerModal } from "./ZamanasimiPickerModal";
import { ZamanasimiCetvelBanner } from "../shared/ZamanasimiCetvelBanner";
import { insertExclusionsPreviewSection } from "../shared/exclusionsPreview";
import { formatIsoDateRangeTR, formatIsoDateTR } from "@/utils/dateDisplay";
import styles from "./HaftalikKarmaFmPage.module.css";

const PAGE_TITLE = "Haftalık Karma Fazla Mesai Hesaplama";
const WEEKDAY_OPTIONS: Array<{ value: number | ""; label: string }> = [
  { value: "", label: "Seçilmedi (tüm günlerde düşüm)" },
  { value: 1, label: "Pazartesi" },
  { value: 2, label: "Salı" },
  { value: 3, label: "Çarşamba" },
  { value: 4, label: "Perşembe" },
  { value: 5, label: "Cuma" },
  { value: 6, label: "Cumartesi" },
  { value: 0, label: "Pazar" },
];

type PendingAction = { kind: "new" } | { kind: "open"; caseId: string } | null;

function snapshotKey(s: HaftalikKarmaFormSnapshot): string {
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

function DayGroupRows({
  groups,
  onChange,
  allowAddRemove,
  timeLabels = "giris",
}: {
  groups: DayGroup[] | WitnessDayGroup[];
  onChange: (next: DayGroup[] | WitnessDayGroup[]) => void;
  allowAddRemove: boolean;
  /** Davacı: Giriş/Çıkış; tanık: Başlangıç/Bitiş (V3). */
  timeLabels?: "giris" | "baslangic";
}) {
  const startLabel = timeLabels === "baslangic" ? "Başlangıç" : "Giriş";
  const endLabel = timeLabels === "baslangic" ? "Bitiş" : "Çıkış";

  const update = (index: number, patch: Partial<DayGroup>) => {
    const next = groups.map((g, i) => {
      if (i !== index) return g;
      const merged = { ...g, ...patch };
      if (patch.dayCount !== undefined) {
        merged.dayCount = clampDayCountForGroup(groups, index, patch.dayCount);
      }
      return merged;
    });
    onChange(next);
  };

  return (
    <div className={styles.witnessList}>
      {groups.map((g, index) => (
        <div key={g.id} className={styles.witnessRow} data-tour-day-group-row>
          <label className={styles.field}>
            <span>Gün Sayısı</span>
            <input
              type="number"
              min={0}
              max={7}
              className={styles.input}
              value={g.dayCount}
              onChange={(e) => update(index, { dayCount: e.target.value })}
            />
          </label>
          <label className={styles.field}>
            <span>{startLabel}</span>
            <input
              type="time"
              className={styles.input}
              value={g.startTime}
              onChange={(e) => update(index, { startTime: e.target.value })}
            />
          </label>
          <label className={styles.field}>
            <span>{endLabel}</span>
            <input
              type="time"
              className={styles.input}
              value={g.endTime}
              onChange={(e) => update(index, { endTime: e.target.value })}
            />
          </label>
          {allowAddRemove ? (
            <button
              type="button"
              className={styles.iconBtn}
              disabled={groups.length <= 1}
              onClick={() => onChange(groups.filter((_, i) => i !== index))}
              title="Sil"
              aria-label="Sil"
            >
              <Trash2 size={14} />
            </button>
          ) : (
            <span />
          )}
        </div>
      ))}
      {allowAddRemove ? (
        <Button
          variant="soft"
          type="button"
          onClick={() => onChange([...groups, createEmptyWitnessDayGroup()])}
        >
          + Grup Ekle
        </Button>
      ) : null}
    </div>
  );
}

export default function HaftalikKarmaFmPage() {
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const caseIdParam = searchParams.get("caseId");

  const [form, setForm] = useState<HaftalikKarmaFormSnapshot>(() => createEmptyHaftalikKarmaForm());

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

  const setField = <K extends keyof HaftalikKarmaFormSnapshot>(key: K, value: HaftalikKarmaFormSnapshot[K]) => {
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
      const items = await listHaftalikKarmaFmCases();
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
    setBaseline(snapshotKey(createEmptyHaftalikKarmaForm()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isDirty = useMemo(() => snapshotKey(form) !== baseline, [form, baseline]);
  const dateError = useMemo(() => validateDateRange(form.iseGiris, form.istenCikis), [form.iseGiris, form.istenCikis]);
  const result = useDeferredFormMemo(form, computeHaftalikKarmaResultV3);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    (window as unknown as { __haftalikKarmaV3Check?: () => void }).__haftalikKarmaV3Check = () =>
      logHaftalikKarmaV3EngineCheck(form);
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

  const davaciTotalDays = useMemo(
    () => sumRegisteredWorkDays(toNumericDayGroups(form.dayGroups)),
    [form.dayGroups],
  );
  const showHolidayControls = davaciTotalDays === 7;

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
    const empty = createEmptyHaftalikKarmaForm();
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
        const { record, form: loaded } = await loadHaftalikKarmaFmCase(Number(c.id));
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

  const applyBackendForm = useCallback((loaded: HaftalikKarmaFormSnapshot, recordId: string, recordName: string) => {
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

    void loadHaftalikKarmaFmCase(numericId)
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
    const fmHours =
      result.rows.find((r) => r.id === afterId)?.fmHours ?? result.davaciWeeklyFmHours ?? 0;
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
      const saved = await saveHaftalikKarmaFmCase(
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
        await removeHaftalikKarmaFmCase(deleteCaseTarget.id);
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
      "witnesses",
      form.witnesses.map((w) => (w.id === id ? { ...w, ...patch } : w)),
    );
  };

  const previewSections = useMemo((): PreviewSection[] => {
    const money = (v: number) => `${formatMoney(v)} ₺`;
    return insertExclusionsPreviewSection(
      [
      {
        id: "ust",
        title: "Genel Bilgiler",
        headers: ["İşe Giriş", "İşten Çıkış", "Haftalık FM Saat"],
        rows: [
          [
            formatIsoDateTR(form.iseGiris, "-"),
            formatIsoDateTR(form.istenCikis, "-"),
            result.davaciWeeklyFmHours.toFixed(2),
          ],
        ],
      },
      {
        id: "cetvel",
        title: "Fazla Mesai Hesaplama Cetveli",
        headers: ["Tarih Aralığı", "Hafta", "Ücret", "Kat Sayı", "FM Saat", "225", "1,5", "Fazla Mesai"],
        rows: result.rows.map((r) => [
          `${formatIsoDateRangeTR(r.startISO, r.endISO)}${r.yillikIzinAciklama || r.note ? ` ${r.yillikIzinAciklama || r.note}` : ""}`,
          String(r.weeks),
          money(r.brut),
          String(r.katsayi),
          r.fmHours.toFixed(2),
          "225",
          "1,5",
          money(r.fm),
        ]),
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
          ["Damga Vergisi (Binde 7,59)", `-${money(result.damgaVergisi)}`],
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
          ["1/3 Hakkaniyet İndirimi", `-${money(result.hakkaniyetOneri)}`],
          ...(result.mahsupTutari > 0
            ? ([["Mahsuplaşma Miktarı", `-${money(result.mahsupTutari)}`]] as string[][])
            : []),
          ["Son Net Alacak", money(result.mahsupSonrasiNet)],
        ],
        lastRowTone: "green",
      },
      ],
      form.exclusions,
    );
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
            <CalendarRange size={22} />
          </div>
          <div>
            <h1 className={styles.title}>{PAGE_TITLE}</h1>
            <p className={styles.desc}>
              Haftalık farklı gün grupları ve tanık desenleriyle fazla mesai hesabı; düşüm ve 270 kuralları
              standart cetvel ile uyumludur.
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

      {result.warnings.length > 0 ? (
        <div className={styles.warnBanner} role="status">
          <AlertTriangle size={16} />
          <ul className={styles.warnList}>
            {result.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className={`${styles.formStack} ${formSwap ? styles.formSwap : ""}`.trim()}>
        {/* 1. Dönem ve Haftalık Desen */}
        <section className={styles.card} style={{ animationDelay: "40ms" }}>
          <h2 className={styles.cardTitle}>Dönem ve Haftalık Desen</h2>
          <div className={styles.grid2} data-tour="fm-haftalik-karma-donem">
            <label className={styles.field}>
              <span>İşe Giriş</span>
              <DraftDateInput
                className={styles.input}
                value={form.iseGiris}
                onCommit={(v) => setField("iseGiris", v)}
              />
            </label>
            <label className={styles.field}>
              <span>İşten Çıkış</span>
              <DraftDateInput
                className={styles.input}
                value={form.istenCikis}
                onCommit={(v) => setField("istenCikis", v)}
              />
            </label>
          </div>
          {dateError ? <p className={styles.fieldError}>{dateError}</p> : null}

          <div data-tour="fm-haftalik-karma-desen">
            <h3 className={styles.subTitle}>Haftalık Karma Desen</h3>
            <DayGroupRows
              groups={form.dayGroups}
              onChange={(next) => setField("dayGroups", next as DayGroup[])}
              allowAddRemove={false}
              timeLabels="giris"
            />

            {showHolidayControls ? (
              <div className={styles.inlineChecks} style={{ marginTop: "0.75rem" }}>
                <label className={styles.checkLabel}>
                  <input
                    type="checkbox"
                    checked={form.hasWeeklyHoliday}
                    onChange={(e) => setField("hasWeeklyHoliday", e.target.checked)}
                  />
                  Hafta Tatili Var mı?
                </label>
                {form.hasWeeklyHoliday ? (
                  <label className={styles.field}>
                    <span>Hafta tatili hangi gruba dahil?</span>
                    <select
                      className={styles.input}
                      value={form.weeklyHolidayGroup}
                      onChange={(e) => setField("weeklyHolidayGroup", Number(e.target.value) || 1)}
                    >
                      <option value={1}>Grup 1</option>
                      <option value={2}>Grup 2</option>
                    </select>
                  </label>
                ) : null}
              </div>
            ) : null}

            <p className={styles.infoLine}>
              Haftalık FM Saati (Davacı):{" "}
              <FlashValue
                value={result.davaciWeeklyFmHours.toFixed(2)}
                className={styles.infoStrong}
              />{" "}
              (45 saat üzeri)
            </p>
          </div>
        </section>

        {/* 2. Tanık Dönemleri */}
        <section
          className={styles.card}
          style={{ animationDelay: "70ms" }}
          data-tour="fm-haftalik-karma-taniklar"
        >
          <div className={styles.cardTitleRow}>
            <h2 className={styles.cardTitle}>Tanık Dönemleri</h2>
            <Button
              variant="soft"
              type="button"
              onClick={() => setField("witnesses", [...form.witnesses, createEmptyWitness()])}
            >
              <Plus size={14} /> Tanık Ekle
            </Button>
          </div>
          {form.witnesses.length === 0 ? (
            <p className={styles.emptyText}>Henüz tanık eklenmedi.</p>
          ) : (
            form.witnesses.map((w, idx) => (
              <div key={w.id} className={styles.witnessCard}>
                <div className={styles.cardTitleRow}>
                  <input
                    className={styles.input}
                    value={w.name}
                    onChange={(e) => updateWitness(w.id, { name: e.target.value })}
                    placeholder={`Tanık ${idx + 1}`}
                    aria-label={`Tanık ${idx + 1}`}
                  />
                  <button
                    type="button"
                    className={styles.iconBtn}
                    onClick={() => setField("witnesses", form.witnesses.filter((x) => x.id !== w.id))}
                    title="Sil"
                    aria-label="Sil"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <div className={styles.grid2}>
                  <label className={styles.field}>
                    <span>İşe Giriş</span>
                    <input
                      type="date"
                      className={styles.input}
                      value={w.startISO}
                      onChange={(e) => updateWitness(w.id, { startISO: e.target.value })}
                    />
                  </label>
                  <label className={styles.field}>
                    <span>İşten Çıkış</span>
                    <input
                      type="date"
                      className={styles.input}
                      value={w.endISO}
                      onChange={(e) => updateWitness(w.id, { endISO: e.target.value })}
                    />
                  </label>
                </div>
                <div className={styles.cardTitleRow} style={{ marginBottom: "0.35rem" }}>
                  <span className={styles.fieldLabel}>Gün Grupları</span>
                  <span className={styles.panelHint}>
                    Toplam:{" "}
                    <strong>{sumRegisteredWorkDays(toNumericDayGroups(w.dayGroups))}</strong> gün
                  </span>
                </div>
                <DayGroupRows
                  groups={w.dayGroups}
                  onChange={(next) => updateWitness(w.id, { dayGroups: next as WitnessDayGroup[] })}
                  allowAddRemove
                  timeLabels="baslangic"
                />
              </div>
            ))
          )}
        </section>

        {/* 3. Metin */}
        <MetinHesaplamasi
          dayGroups={form.dayGroups}
          hasWeeklyHoliday={form.hasWeeklyHoliday}
          weeklyHolidayGroup={form.weeklyHolidayGroup}
          witnesses={form.witnesses}
        />

        {/* 4. Hafta tatili + istisnalar + diğer ayarlar */}
        <div data-tour="fm-haftalik-karma-ayarlar" style={{ display: "grid", gap: "1rem", minWidth: 0 }}>
          <section className={styles.card} style={{ animationDelay: "110ms" }}>
            <label className={styles.field} style={{ maxWidth: "34rem", marginBottom: "0.75rem" }}>
              <span className={styles.fieldLabel}>Hafta tatili günü (yıllık izin / UBGT düşümü)</span>
              <span className={styles.panelHint}>
                Seçilmezse işaretlenen her takvim günü düşüme girer. Bir gün seçilirse, o haftanın tatil günü dışlamada
                sayılmaz (Tanıklı Standart ile aynı).
              </span>
              <select
                className={styles.selectInput}
                value={form.haftaTatiliGunu === "" ? "" : String(form.haftaTatiliGunu)}
                onChange={(e) => {
                  const v = e.target.value;
                  setField("haftaTatiliGunu", v === "" ? "" : Number(v));
                }}
              >
                {WEEKDAY_OPTIONS.map((o) => (
                  <option key={String(o.value)} value={o.value === "" ? "" : String(o.value)}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          </section>
          <ExclusionsPanel
            exclusions={form.exclusions}
            onChange={(next) => setField("exclusions", next)}
            onOpenUbgtPicker={() => setShowUbgtPicker(true)}
            visibleAfterIso={form.zamanasimi?.nihaiBaslangic ?? null}
            onOverlayOpenChange={setExclusionOverlayOpen}
          />

          <section className={styles.card} style={{ animationDelay: "140ms" }}>
            <h2 className={styles.cardTitle}>Diğer Ayarlar</h2>
            <div className={styles.basicGrid}>
              <div className={styles.field}>
                <span className={styles.fieldLabel}>Kat Sayı</span>
                <button
                  type="button"
                  className={`${styles.zamanasimiBadge} ${hasCustomKatsayi ? styles.zamanasimiBadgeActive : ""}`}
                  onClick={() =>
                    hasCustomKatsayi ? setField("katSayi", "1") : setShowKatsayiModal(true)
                  }
                  title={hasCustomKatsayi ? "Katsayıyı kaldır" : "Katsayı hesapla"}
                >
                  <Calculator size={13} />
                  {hasCustomKatsayi ? `Katsayı ${katSayiNum.toFixed(2)}` : "Kat Sayı"}
                </button>
              </div>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>270 Saat</span>
                <select
                  className={styles.selectInput}
                  value={form.mode270}
                  onChange={(e) => setField("mode270", e.target.value as HaftalikKarmaFormSnapshot["mode270"])}
                >
                  <option value="none">Kapalı</option>
                  <option value="detailed">Şirket Uygulaması</option>
                  <option value="simple">Yargıtay Uygulaması</option>
                </select>
              </label>
              <div className={styles.field}>
                <span className={styles.fieldLabel}>Zamanaşımı</span>
                <button
                  type="button"
                  className={`${styles.zamanasimiBadge} ${form.zamanasimi ? styles.zamanasimiBadgeActive : ""}`}
                  onClick={() =>
                    form.zamanasimi ? setField("zamanasimi", null) : setShowZamanasimiModal(true)
                  }
                  title={form.zamanasimi ? "Zamanaşımını kaldır" : "Zamanaşımı hesapla"}
                >
                  <History size={13} />
                  {form.zamanasimi ? "Zamanaşımı" : "Zamanaşımı İtirazı"}
                </button>
              </div>
            </div>
          </section>
        </div>

        <p className={styles.noteInfo}>
          Son haftaya isabet eden izin/UBGT düşümlerinde, tabloda görülen tarih aralığı 7 günden kısa olsa dahi
          hesaplama bu süre üzerinden yapılmaz. İlgili düşüm, üst satırdaki toplam haftadan 1 hafta eksiltilerek ayrı
          bir satırda 1 hafta olarak dikkate alınmıştır.
        </p>

        {/* 6. Cetvel */}
        <ZamanasimiCetvelBanner nihaiBaslangic={form.zamanasimi?.nihaiBaslangic} />
        {hiddenRowCount > 0 ? (
          <div className={styles.infoBanner}>
            <span>{hiddenRowCount} satır gizlendi.</span>
            <Button variant="soft" type="button" onClick={showHiddenRows}>
              Gizlenenleri göster
            </Button>
          </div>
        ) : null}
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

        {/* 7. Brütten Nete */}
        <article className={styles.panel} style={{ animationDelay: "180ms" }}>
          <header className={styles.panelHead}>
            <h3>Brütten Nete Çevir</h3>
          </header>
          <div className={styles.totalsGrid}>
            <div>
              <span>Brüt Fazla Mesai</span>
              <FlashValue value={`${formatMoney(result.toplamFm)} ₺`} />
            </div>
            <div>
              <span>SGK (%14)</span>
              <span>−{formatMoney(result.sgk)} ₺</span>
            </div>
            <div>
              <span>İşsizlik (%1)</span>
              <span>−{formatMoney(result.issizlik)} ₺</span>
            </div>
            <div>
              <span>Gelir Vergisi {result.gelirVergisiDilimleri}</span>
              <span>−{formatMoney(result.gelirVergisi)} ₺</span>
            </div>
            <div>
              <span>Damga Vergisi (Binde 7,59)</span>
              <span>−{formatMoney(result.damgaVergisi)} ₺</span>
            </div>
            <div className={styles.totalsHighlight}>
              <span>Net Fazla Mesai</span>
              <FlashValue value={`${formatMoney(result.netYillik)} ₺`} />
            </div>
          </div>
        </article>

        {/* 8. Hakkaniyet / Mahsup */}
        <article className={styles.panel} style={{ animationDelay: "200ms" }}>
          <header className={styles.panelHead}>
            <h3>Hakkaniyet İndirimi / Mahsuplaşma</h3>
          </header>
          <div className={styles.totalsGrid}>
            <div>
              <span>Toplam Fazla Mesai (Brüt)</span>
              <span>{formatMoney(result.toplamFm)} ₺</span>
            </div>
            <div>
              <span>1/3 Hakkaniyet İndirimi</span>
              <span>−{formatMoney(result.hakkaniyetOneri)} ₺</span>
            </div>
            <div>
              <span>Mahsuplaşma Miktarı</span>
              <div className={styles.mahsupRow}>
                <input
                  className={styles.input}
                  value={form.mahsup}
                  onChange={(e) => setField("mahsup", sanitizeMoneyTyping(e.target.value))}
                  placeholder="0"
                  inputMode="decimal"
                />
                <Button variant="soft" type="button" onClick={() => setShowMahsupModal(true)}>
                  Mahsuplaşma Ekle
                </Button>
              </div>
            </div>
            <div className={styles.totalsHighlight}>
              <span>Son Net Alacak</span>
              <FlashValue value={`${formatMoney(result.mahsupSonrasiNet)} ₺`} className={styles.sonNet} />
            </div>
          </div>
        </article>
      </div>

      <div
        className={`${styles.stickyBar} ${isDirty ? styles.stickyBarDirty : ""} ${saveFlash ? styles.stickyBarSaved : ""}`}
        data-tour="fm-haftalik-karma-kaydet-actions"
      >
        <div className={styles.stickyInner}>
          <p className={styles.stickyStatus}>
            {isDirty
              ? "Kaydedilmemiş değişiklikler var"
              : currentRecordName
                ? "Tüm değişiklikler kaydedildi"
                : "Hazır"}
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
              disabled={isSavingCase}
              className={saveFlash ? styles.saveBtnFlash : undefined}
            >
              <Save size={14} />
              {isSavingCase ? "Kaydediliyor…" : currentRecordId ? "Güncelle" : "Kaydet"}
            </Button>
          </div>
        </div>
      </div>

      {/* Modals */}
      {showRecordsModal ? (
        <div className={styles.modalOverlay} role="presentation" onClick={() => setShowRecordsModal(false)}>
          <div
            className={styles.modalCardWide}
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.modalHead}>
              <h2 className={styles.modalTitle}>Kayıtlarım</h2>
              <button type="button" className={styles.iconBtn} onClick={() => setShowRecordsModal(false)}>
                <X size={16} />
              </button>
            </div>
            {savedCases.length === 0 ? (
              <p className={styles.emptyText}>Henüz kayıt yok.</p>
            ) : (
              <ul className={styles.recordsList}>
                {savedCases.map((c) => (
                  <li key={c.id} className={styles.recordItem}>
                    <div>
                      <strong>{c.name}</strong>
                      <span className={styles.recordMeta}>
                        {formatMoney(c.result.sonNet)} ₺ son net · {c.result.rowCount} satır ·{" "}
                        {new Date(c.updatedAt).toLocaleDateString("tr-TR")}
                      </span>
                    </div>
                    <div className={styles.recordActions}>
                      <Button
                        variant="soft"
                        type="button"
                        onClick={() => requestAction({ kind: "open", caseId: c.id })}
                      >
                        Aç
                      </Button>
                      <Button variant="soft" type="button" onClick={() => setDeleteCaseTarget(c)}>
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}

      <NameModal
        open={showCaseSaveModal}
        title="Kaydı Adlandır"
        placeholder="Örn. Dosya 2024/123"
        confirmLabel="Kaydet"
        onClose={() => setShowCaseSaveModal(false)}
        onSave={persistCase}
      />

      <KatsayiModal
        open={showKatsayiModal}
        currentKatsayi={katSayiNum}
        onApply={(k) => {
          setField("katSayi", String(k));
          setShowKatsayiModal(false);
        }}
        onReset={() => {
          setField("katSayi", "1");
          setShowKatsayiModal(false);
        }}
        onClose={() => setShowKatsayiModal(false)}
      />

      <ZamanasimiPickerModal
        open={showZamanasimiModal}
        initial={form.zamanasimi}
        iseGiris={form.iseGiris}
        onApply={(z) => setField("zamanasimi", z)}
        onClear={() => setField("zamanasimi", null)}
        onClose={() => setShowZamanasimiModal(false)}
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

      <UbgtPickerModal
        open={showUbgtPicker}
        rangeStart={ubgtRange.start}
        rangeEnd={ubgtRange.end}
        exclusions={form.exclusions}
        onApply={(next: ExclusionItem[]) => {
          setField("exclusions", next);
          setShowUbgtPicker(false);
        }}
        onClose={() => setShowUbgtPicker(false)}
        visibleAfterIso={form.zamanasimi?.nihaiBaslangic ?? null}
      />

      <CalculationPreviewModal
        open={showPreview}
        title={PAGE_TITLE}
        sections={previewSections}
        contentId="fm-haftalik-karma-word-copy"
        onClose={() => setShowPreview(false)}
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

      <ConfirmDialog
        open={!!deleteCaseTarget}
        title="Kaydı sil"
        description={
          deleteCaseTarget
            ? `"${deleteCaseTarget.name}" kaydı silinecek. Bu işlem geri alınamaz.`
            : ""
        }
        confirmLabel="Sil"
        danger
        onConfirm={confirmDeleteCase}
        onCancel={() => setDeleteCaseTarget(null)}
      />

      <GuidedTourHost
        definition={FM_HAFTALIK_KARMA_TOUR}
        active={tour.active}
        onActiveChange={tour.setActive}
        welcomeOpen={tour.welcomeOpen}
        onWelcomeOpenChange={tour.setWelcomeOpen}
        welcomeTitle={FM_HAFTALIK_KARMA_TOUR_WELCOME_TITLE}
        welcomeBody={FM_HAFTALIK_KARMA_TOUR_WELCOME_BODY}
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
