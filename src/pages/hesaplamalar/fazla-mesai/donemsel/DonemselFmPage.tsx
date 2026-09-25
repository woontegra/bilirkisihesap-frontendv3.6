/**
 * Dönemsel Fazla Mesai — V3.5 sayfa (V3 klasik işlev paritesi).
 */

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
  Sun,
  Trash2,
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
  ManualBrutWageApplyControls,
  clearAllManualBrutFromRowOverrides,
  isManualBrutActiveInOverrides,
  mergeManualWageBrutsIntoRowOverrides,
} from "@/features/manual-brut-wage";
import {
  listDonemselFmCases,
  loadDonemselFmCase,
  removeDonemselFmCase,
  resolveSavedCaseDisplayName,
  saveDonemselFmCase,
} from "./backendCase";
import {
  FM_DONEMSEL_TOUR,
  FM_DONEMSEL_TOUR_WELCOME_BODY,
  FM_DONEMSEL_TOUR_WELCOME_TITLE,
} from "./guidedTour";
import type { FmSavedCaseListItem } from "../shared/fmBackendCrud";
import { MONTH_OPTIONS, WEEKDAY_OPTIONS } from "./constants";
import {
  createManualPeriodRow,
  formatMoney,
  parseKatsayi,
  sanitizeMoneyTyping,
  validateDateRange,
} from "./engine";
import {
  computeDonemselResultV3,
  logDonemselFmV3EngineCheck,
} from "./v3-engine/adapter";
import {
  createEmptyDonemselForm,
  createEmptyWitness,
  type DonemselFormSnapshot,
  type DonemselWitness,
  type RowOverride,
  type SeasonalPattern,
  type SevenDayMode,
} from "./model";
import { CetvelTable } from "./CetvelTable";
import { ExclusionsPanel } from "./ExclusionsPanel";
import { KatsayiModal } from "./KatsayiModal";
import { MahsuplasamaModal } from "./MahsuplasamaModal";
import { MetinHesaplamasi } from "./MetinHesaplamasi";
import { UbgtPickerModal } from "./UbgtPickerModal";
import { ZamanasimiPickerModal } from "./ZamanasimiPickerModal";
import { ZamanasimiCetvelBanner } from "../shared/ZamanasimiCetvelBanner";
import { formatIsoDateRangeTR, formatIsoDateTR } from "@/utils/dateDisplay";
import styles from "./DonemselFmPage.module.css";

const PAGE_TITLE = "Dönemsel Fazla Mesai Hesaplama";

type PendingAction = { kind: "new" } | { kind: "open"; caseId: string } | null;

function snapshotKey(s: DonemselFormSnapshot): string {
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
        {description ? <p className={styles.panelHint}>{description}</p> : null}
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

function SeasonPatternEditor({
  title,
  season,
  pattern,
  otherMonths,
  onChange,
  showHolidayOnWitness,
}: {
  title: string;
  season: "summer" | "winter";
  pattern: SeasonalPattern;
  otherMonths: number[];
  onChange: (next: SeasonalPattern) => void;
  /** Tanık kartında 7-gün tatil düğmesi yok (V3). */
  showHolidayOnWitness?: boolean;
}) {
  const wd = Math.max(1, Math.min(7, Math.floor(Number(pattern.workDays) || 6)));
  const showHoliday = showHolidayOnWitness !== false && wd === 7;

  const toggleMonth = (month: number) => {
    if (otherMonths.includes(month)) {
      const label = MONTH_OPTIONS.find((m) => m.value === month)?.label || "";
      window.alert(`${label} ayı diğer sezonda seçili. Bir ay sadece bir sezonda olabilir.`);
      return;
    }
    const next = pattern.months.includes(month)
      ? pattern.months.filter((m) => m !== month)
      : [...pattern.months, month].sort((a, b) => a - b);
    onChange({ ...pattern, months: next });
  };

  return (
    <div className={styles.seasonBlock}>
      <h4 className={styles.seasonTitle}>{title}</h4>
      <span className={styles.fieldLabel}>Aylar</span>
      <div className={styles.monthGrid}>
        {MONTH_OPTIONS.map((m) => {
          const sel = pattern.months.includes(m.value);
          const dis = otherMonths.includes(m.value);
          return (
            <button
              key={m.value}
              type="button"
              disabled={dis}
              className={`${styles.monthChip} ${
                sel
                  ? season === "summer"
                    ? styles.monthChipActiveSummer
                    : styles.monthChipActiveWinter
                  : ""
              } ${dis ? styles.monthChipDisabled : ""}`.trim()}
              onClick={() => toggleMonth(m.value)}
            >
              {m.label}
            </button>
          );
        })}
      </div>
      <div className={styles.grid2}>
        <label className={styles.field}>
          <span>Giriş Saati</span>
          <input
            type="time"
            className={styles.input}
            value={pattern.startTime}
            onChange={(e) => onChange({ ...pattern, startTime: e.target.value })}
          />
        </label>
        <label className={styles.field}>
          <span>Çıkış Saati</span>
          <input
            type="time"
            className={styles.input}
            value={pattern.endTime}
            onChange={(e) => onChange({ ...pattern, endTime: e.target.value })}
          />
        </label>
      </div>
      <div className={styles.grid2} style={{ marginTop: "0.65rem" }}>
        <label className={styles.field}>
          <span>Haftada çalışılan gün</span>
          <input
            type="number"
            className={styles.input}
            min={1}
            max={7}
            value={pattern.workDays}
            onChange={(e) => {
              const raw = e.target.value;
              if (raw === "") {
                onChange({ ...pattern, workDays: "", sevenDayMode: "tatilsiz" });
                return;
              }
              const n = Math.max(1, Math.min(7, Math.floor(Number(raw) || 1)));
              onChange({
                ...pattern,
                workDays: String(n),
                ...(n !== 7 ? { sevenDayMode: "tatilsiz" as SevenDayMode } : {}),
              });
            }}
          />
        </label>
      </div>
      {showHoliday ? (
        <div style={{ marginTop: "0.65rem" }}>
          <span className={styles.fieldLabel}>Hafta tatili</span>
          <div className={styles.modeToggleRow}>
            <button
              type="button"
              className={`${styles.modeToggleBtn} ${pattern.sevenDayMode === "tatilsiz" ? styles.modeToggleBtnActive : ""}`}
              onClick={() => onChange({ ...pattern, sevenDayMode: "tatilsiz" })}
            >
              Hafta tatilsiz
            </button>
            <button
              type="button"
              className={`${styles.modeToggleBtn} ${pattern.sevenDayMode === "tatilli" ? styles.modeToggleBtnActive : ""}`}
              onClick={() => onChange({ ...pattern, sevenDayMode: "tatilli" })}
            >
              Hafta tatilli
            </button>
          </div>
          {pattern.sevenDayMode === "tatilli" ? (
            <label className={styles.field} style={{ marginTop: "0.55rem", maxWidth: "20rem" }}>
              <span>Hafta tatili hangi gün?</span>
              <select
                className={styles.selectInput}
                value={String(pattern.weeklyHolidayWeekday ?? 0)}
                onChange={(e) =>
                  onChange({
                    ...pattern,
                    weeklyHolidayWeekday: Math.max(0, Math.min(6, Number(e.target.value) || 0)),
                  })
                }
              >
                {WEEKDAY_OPTIONS.map((o) => (
                  <option key={o.value} value={String(o.value)}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default function DonemselFmPage() {
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const caseIdParam = searchParams.get("caseId");

  const [form, setForm] = useState<DonemselFormSnapshot>(() => createEmptyDonemselForm());

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

  const setField = <K extends keyof DonemselFormSnapshot>(key: K, value: DonemselFormSnapshot[K]) => {
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
      const items = await listDonemselFmCases();
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
    setBaseline(snapshotKey(createEmptyDonemselForm()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isDirty = useMemo(() => snapshotKey(form) !== baseline, [form, baseline]);
  const dateError = useMemo(() => validateDateRange(form.dateIn, form.dateOut), [form.dateIn, form.dateOut]);
  const result = useDeferredFormMemo(form, computeDonemselResultV3);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    (window as unknown as { __donemselFmV3Check?: () => void }).__donemselFmV3Check = () =>
      logDonemselFmV3EngineCheck(form);
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
    if (form.dateIn) years.add(Number(form.dateIn.slice(0, 4)));
    if (form.dateOut) years.add(Number(form.dateOut.slice(0, 4)));
    return Array.from(years).sort((a, b) => a - b);
  }, [result.rows, form.dateIn, form.dateOut]);

  const ubgtRange = useMemo(() => {
    let start = form.dateIn || "";
    let end = form.dateOut || "";
    for (const r of result.rows) {
      if (r.startISO && (!start || r.startISO < start)) start = r.startISO;
      if (r.endISO && (!end || r.endISO > end)) end = r.endISO;
    }
    return { start, end };
  }, [form.dateIn, form.dateOut, result.rows]);

  const hiddenRowCount = useMemo(
    () => Object.values(form.rowOverrides).filter((o) => o?.hidden).length,
    [form.rowOverrides],
  );

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
      else if (discardOpen) setDiscardOpen(false);
      else if (showMahsupModal) setShowMahsupModal(false);
      else if (showKatsayiModal) setShowKatsayiModal(false);
      else if (showZamanasimiModal) setShowZamanasimiModal(false);
      else if (showUbgtPicker) setShowUbgtPicker(false);
      else if (showPreview) setShowPreview(false);
      else if (showCaseSaveModal) setShowCaseSaveModal(false);
      else if (showRecordsModal) setShowRecordsModal(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", onKeyDown);
      modalReturnFocusRef.current?.focus?.();
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

  const resetFormFields = useCallback(() => {
    const empty = createEmptyDonemselForm();
    setForm(empty);
    setBaseline(snapshotKey(empty));
    setCurrentRecordId(null);
    setCurrentRecordName(null);
    setFormSwap(true);
    window.setTimeout(() => setFormSwap(false), 350);
  }, []);

  const applyBackendForm = useCallback((mapped: DonemselFormSnapshot, displayName: string, id: string) => {
    setForm(mapped);
    setBaseline(snapshotKey(mapped));
    setCurrentRecordId(id);
    setCurrentRecordName(displayName);
    setFormSwap(true);
    window.setTimeout(() => setFormSwap(false), 350);
  }, []);

  const applyOpenCase = useCallback(
    async (c: FmSavedCaseListItem) => {
      try {
        const { record, form: loaded } = await loadDonemselFmCase(Number(c.id));
        backendLoadedCaseIdRef.current = String(record.id);
        const next = new URLSearchParams(searchParams);
        next.set("caseId", String(record.id));
        setSearchParams(next, { replace: true });
        applyBackendForm(loaded, resolveSavedCaseDisplayName(record), String(record.id));
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

    void loadDonemselFmCase(numericId)
      .then(({ record, form: mapped }) => {
        if (cancelled) return;
        applyBackendForm(mapped, resolveSavedCaseDisplayName(record), String(record.id));
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
      backendLoadedCaseIdRef.current = null;
      clearCaseIdParam();
      resetFormFields();
      return;
    }
    const found = savedCases.find((c) => c.id === action.caseId);
    if (found) void applyOpenCase(found);
  };

  const requestAction = (action: PendingAction) => {
    if (isDirty) {
      setPendingAction(action);
      setDiscardOpen(true);
      return;
    }
    commitAction(action);
  };

  const confirmDiscard = () => {
    setDiscardOpen(false);
    commitAction(pendingAction);
    setPendingAction(null);
  };

  const persistCase = async (name: string) => {
    if (isSavingCase) return;
    setIsSavingCase(true);
    const wasUpdate = !!currentRecordId;
    try {
      const saved = await saveDonemselFmCase(
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
        await removeDonemselFmCase(deleteCaseTarget.id);
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

  const updateWitness = (id: string, patch: Partial<DonemselWitness>) => {
    setField(
      "witnessesSeasons",
      form.witnessesSeasons.map((w) => (w.id === id ? { ...w, ...patch } : w)),
    );
  };

  const handleRowOverrideChange = (id: string, patch: RowOverride | null) => {
    setForm((prev) => {
      const next = { ...prev.rowOverrides };
      if (patch == null) delete next[id];
      else next[id] = patch;
      return { ...prev, rowOverrides: next };
    });
  };

  const handleAddRow = (afterId: string) => {
    const row = createManualPeriodRow(afterId, katSayiNum);
    setField("manualRows", [...form.manualRows, row]);
  };

  const handleRemoveRow = (id: string) => {
    const isManual = form.manualRows.some((r) => r.id === id) || result.rows.find((r) => r.id === id)?.isManual;
    if (isManual) {
      setField(
        "manualRows",
        form.manualRows.filter((r) => r.id !== id),
      );
      setForm((prev) => {
        const next = { ...prev.rowOverrides };
        delete next[id];
        return { ...prev, rowOverrides: next };
      });
      return;
    }
    handleRowOverrideChange(id, { ...form.rowOverrides[id], hidden: true });
  };

  const showHiddenRows = () => {
    setForm((prev) => {
      const next: Record<string, RowOverride> = {};
      for (const [id, ov] of Object.entries(prev.rowOverrides)) {
        if (!ov.hidden) next[id] = ov;
        else {
          const { hidden: _h, ...rest } = ov;
          if (Object.keys(rest).length > 0) next[id] = rest;
        }
      }
      return { ...prev, rowOverrides: next };
    });
  };

  const previewSections = useMemo((): PreviewSection[] => {
    const money = (v: number) => `${formatMoney(v)} ₺`;
    const sections: PreviewSection[] = [
      {
        id: "ust",
        title: "Genel Bilgiler",
        headers: ["İşe Giriş", "İşten Çıkış"],
        rows: [[formatIsoDateTR(form.dateIn, "-"), formatIsoDateTR(form.dateOut, "-")]],
      },
      {
        id: "cetvel",
        title: "Fazla Mesai Hesaplama Cetveli",
        headers: ["Dönem", "Hafta", "Ücret", "Katsayı", "FM Saat", "225", "1,5", "Fazla Mesai"],
        rows: result.rows.map((r) => [
          `${formatIsoDateRangeTR(r.startISO, r.endISO)}${r.yillikIzinAciklama ? ` ${r.yillikIzinAciklama}` : ""}`,
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
    ];
    if (form.exclusions.length > 0) {
      sections.push({
        id: "exclusions",
        title: "Yıllık İzin Düşümü / Dışlanan Günler",
        headers: ["Tür", "Başlangıç", "Bitiş", "Gün"],
        rows: form.exclusions.map((e) => [
          e.type,
          formatIsoDateTR(e.start),
          formatIsoDateTR(e.end),
          String(e.days),
        ]),
      });
    }
    sections.push(
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
        title: "Hakkaniyet İndirimi / Mahsuplaşma",
        headers: ["Kalem", "Tutar"],
        rows: [
          ["Toplam Fazla Mesai (Brüt)", money(result.toplamFm)],
          ["1/3 Hakkaniyet İndirimi", `-${money(result.hakkaniyetOneri)}`],
          ["Mahsuplaşma Miktarı", `-${money(result.mahsupTutari)}`],
          ["Son Net Alacak", money(result.mahsupSonrasiNet)],
        ],
        lastRowTone: "green",
      },
    );
    return sections;
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
            <Sun size={22} />
          </div>
          <div>
            <h1 className={styles.title}>{PAGE_TITLE}</h1>
            <p className={styles.desc}>
              Yaz ve kış dönemlerine göre farklı çalışma desenleri; tanık beyanları, düşüm ve 270 kuralları standart
              cetvel ile uyumludur.
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
        <section className={styles.card} style={{ animationDelay: "40ms" }}>
          <h2 className={styles.cardTitle}>Dönem ve Yaz/Kış Desen (Davacı)</h2>
          <div data-tour="fm-donemsel-donem" className={styles.grid2}>
            <label className={styles.field}>
              <span>İşe Giriş Tarihi</span>
              <DraftDateInput className={styles.input} value={form.dateIn} onCommit={(v) => setField("dateIn", v)} />
            </label>
            <label className={styles.field}>
              <span>İşten Çıkış Tarihi</span>
              <DraftDateInput className={styles.input} value={form.dateOut} onCommit={(v) => setField("dateOut", v)} />
            </label>
          </div>
          {dateError ? <p className={styles.fieldError}>{dateError}</p> : null}

          <div data-tour="fm-donemsel-desen">
            <SeasonPatternEditor
              title="Yaz Dönemi"
              season="summer"
              pattern={form.summerPattern}
              otherMonths={form.winterPattern.months}
              onChange={(p) => setField("summerPattern", p)}
            />
            <SeasonPatternEditor
              title="Kış Dönemi"
              season="winter"
              pattern={form.winterPattern}
              otherMonths={form.summerPattern.months}
              onChange={(p) => setField("winterPattern", p)}
            />
          </div>

          <p className={styles.infoLine}>
            Haftalık FM Saati — Yaz:{" "}
            <FlashValue value={result.yazFmHours.toFixed(2)} className={styles.infoStrong} /> · Kış:{" "}
            <FlashValue value={result.kisFmHours.toFixed(2)} className={styles.infoStrong} />
          </p>
        </section>

        <section className={styles.card} style={{ animationDelay: "70ms" }} data-tour="fm-donemsel-taniklar">
          <div className={styles.cardTitleRow}>
            <h2 className={styles.cardTitle}>Tanık Dönemleri (Yaz/Kış Desen)</h2>
            <Button
              variant="soft"
              type="button"
              onClick={() => setField("witnessesSeasons", [...form.witnessesSeasons, createEmptyWitness()])}
            >
              <Plus size={14} /> Tanık Ekle
            </Button>
          </div>
          {form.witnessesSeasons.length === 0 ? (
            <p className={styles.emptyText}>Henüz tanık eklenmedi.</p>
          ) : (
            form.witnessesSeasons.map((w, idx) => (
              <div key={w.id} className={styles.witnessCard}>
                <div className={styles.cardTitleRow}>
                  <input
                    className={styles.input}
                    value={w.name}
                    onChange={(e) => updateWitness(w.id, { name: e.target.value })}
                    placeholder={`Tanık ${idx + 1}`}
                    aria-label={`Tanık ${idx + 1}`}
                  />
                  {form.witnessesSeasons.length > 1 ? (
                    <button
                      type="button"
                      className={styles.iconBtn}
                      onClick={() =>
                        setField(
                          "witnessesSeasons",
                          form.witnessesSeasons.filter((x) => x.id !== w.id),
                        )
                      }
                      title="Sil"
                      aria-label="Sil"
                    >
                      <Trash2 size={14} />
                    </button>
                  ) : null}
                </div>
                <div className={styles.grid2}>
                  <label className={styles.field}>
                    <span>İşe Giriş</span>
                    <DraftDateInput className={styles.input} value={w.dateIn} onCommit={(v) => updateWitness(w.id, { dateIn: v })} />
                  </label>
                  <label className={styles.field}>
                    <span>İşten Çıkış</span>
                    <DraftDateInput className={styles.input} value={w.dateOut} onCommit={(v) => updateWitness(w.id, { dateOut: v })} />
                  </label>
                </div>
                <SeasonPatternEditor
                  title="Yaz Dönemi"
                  season="summer"
                  pattern={w.summerPattern}
                  otherMonths={w.winterPattern.months}
                  onChange={(p) => updateWitness(w.id, { summerPattern: p })}
                  showHolidayOnWitness={false}
                />
                <SeasonPatternEditor
                  title="Kış Dönemi"
                  season="winter"
                  pattern={w.winterPattern}
                  otherMonths={w.summerPattern.months}
                  onChange={(p) => updateWitness(w.id, { winterPattern: p })}
                  showHolidayOnWitness={false}
                />
              </div>
            ))
          )}
        </section>

        <MetinHesaplamasi form={form} />

        <div data-tour="fm-donemsel-ayarlar" style={{ display: "grid", gap: "1rem", minWidth: 0 }}>
          <ExclusionsPanel
            exclusions={form.exclusions}
            onChange={(next) => setField("exclusions", next)}
            onOpenUbgtPicker={() => setShowUbgtPicker(true)}
            visibleAfterIso={form.zamanasimi?.nihaiBaslangic ?? null}
            onOverlayOpenChange={setExclusionOverlayOpen}
          />

          <p className={styles.noteInfo}>
            Son haftaya isabet eden izin/UBGT düşümlerinde, tabloda görülen tarih aralığı 7 günden kısa olsa dahi
            hesaplama bu süre üzerinden yapılmaz. İlgili düşüm, üst satırdaki toplam haftadan 1 hafta eksiltilerek ayrı
            bir satırda 1 hafta olarak dikkate alınmıştır.
          </p>

          <section className={styles.card} style={{ animationDelay: "140ms" }}>
            <h2 className={styles.cardTitle}>Diğer Ayarlar</h2>
            <div className={styles.basicGrid}>
              <div className={styles.field}>
                <span className={styles.fieldLabel}>Kat Sayı</span>
                <button
                  type="button"
                  className={`${styles.zamanasimiBadge} ${hasCustomKatsayi ? styles.zamanasimiBadgeActive : ""}`}
                  onClick={() => (hasCustomKatsayi ? setField("katSayi", "1") : setShowKatsayiModal(true))}
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
                  onChange={(e) => setField("mode270", e.target.value as DonemselFormSnapshot["mode270"])}
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

        <ZamanasimiCetvelBanner nihaiBaslangic={form.zamanasimi?.nihaiBaslangic} />

        {hiddenRowCount > 0 ? (
          <div className={styles.infoBanner}>
            <span>{hiddenRowCount} satır gizlendi.</span>
            <Button variant="soft" type="button" onClick={showHiddenRows}>
              Gizlenenleri göster
            </Button>
          </div>
        ) : null}

        {!form.dateIn || !form.dateOut ? (
          <p className={styles.emptyText}>
            Davacı için işe giriş ve işten çıkış tarihlerini girin. Tanık yoksa veya tanık tarihleri davacı dönemiyle
            örtüşmüyorsa cetvel davacı beyanına göre oluşturulur.
          </p>
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
        data-tour="fm-donemsel-kaydet-actions"
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

      {showRecordsModal ? (
        <div className={styles.modalOverlay} role="presentation" onClick={() => setShowRecordsModal(false)}>
          <div className={styles.modalCard} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>Kayıtlarım</h2>
            {savedCases.length === 0 ? (
              <p className={styles.emptyText}>Henüz kayıt yok.</p>
            ) : (
              <ul className={styles.setList}>
                {savedCases.map((c) => (
                  <li key={c.id} className={styles.setRow}>
                    <div className={styles.setInfo}>
                      <strong>{c.name}</strong>
                      <span className={styles.panelHint}>
                        {formatMoney(c.result.sonNet)} ₺ son net · {c.result.rowCount} satır ·{" "}
                        {new Date(c.updatedAt).toLocaleDateString("tr-TR")}
                      </span>
                    </div>
                    <div className={styles.inlineActions}>
                      <Button variant="soft" size="sm" onClick={() => requestAction({ kind: "open", caseId: c.id })}>
                        Yükle
                      </Button>
                      <Button variant="danger" size="sm" onClick={() => setDeleteCaseTarget(c)} title="Sil">
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

      <NameModal
        open={showCaseSaveModal}
        title="Hesaplamayı Kaydet"
        placeholder="Kayıt adı"
        confirmLabel="Kaydet"
        onClose={() => setShowCaseSaveModal(false)}
        onSave={persistCase}
      />

      <CalculationPreviewModal
        open={showPreview}
        title={PAGE_TITLE}
        sections={previewSections}
        contentId="fm-donemsel-word-copy"
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
        iseGiris={form.dateIn}
        onApply={(info) => {
          setField("zamanasimi", info);
          setShowZamanasimiModal(false);
        }}
        onClear={() => {
          setField("zamanasimi", null);
          setShowZamanasimiModal(false);
        }}
        onClose={() => setShowZamanasimiModal(false)}
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

      <MahsuplasamaModal
        open={showMahsupModal}
        years={mahsupYears}
        onSave={(total) => {
          setField("mahsup", formatMoney(total));
          setShowMahsupModal(false);
        }}
        onClose={() => setShowMahsupModal(false)}
      />

      <ConfirmDialog
        open={deleteCaseTarget != null}
        title="Kaydı sil"
        description={deleteCaseTarget ? `"${deleteCaseTarget.name}" kaydı silinecek. Bu işlem geri alınamaz.` : ""}
        confirmLabel="Sil"
        cancelLabel="İptal"
        danger
        onConfirm={confirmDeleteCase}
        onCancel={() => setDeleteCaseTarget(null)}
      />

      <ConfirmDialog
        open={discardOpen}
        title="Kaydedilmemiş değişiklikler"
        description="Devam ederseniz kaydedilmemiş değişiklikler kaybolur."
        confirmLabel="Devam et"
        cancelLabel="İptal"
        danger
        onConfirm={confirmDiscard}
        onCancel={() => {
          setDiscardOpen(false);
          setPendingAction(null);
        }}
      />

      <GuidedTourHost
        definition={FM_DONEMSEL_TOUR}
        active={tour.active}
        onActiveChange={tour.setActive}
        welcomeOpen={tour.welcomeOpen}
        onWelcomeOpenChange={tour.setWelcomeOpen}
        welcomeTitle={FM_DONEMSEL_TOUR_WELCOME_TITLE}
        welcomeBody={FM_DONEMSEL_TOUR_WELCOME_BODY}
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
