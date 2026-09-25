import { Fragment, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Calculator, CirclePlay, Download, Eye, FilePlus2, FolderOpen, Plus, Save, ShieldCheck, Trash2, X } from "lucide-react";
import { ApiError } from "@/api/client";
import { getSavedCase } from "@/api/savedCases";
import { CalculationPreviewModal, type PreviewSection } from "@/components/calculation-preview";
import { DraftDateInput } from "@/components/form";
import { GuidedTourHost, useGuidedTourController } from "@/components/guided-tour";
import tourStyles from "@/components/guided-tour/GuidedTour.module.css";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { useToast } from "@/context/ToastContext";
import { useCalculationCaseBinding } from "@/hooks/useCalculationCaseBinding";
import {
  ManualBrutWageApplyControls,
  clearManualWageFromPeriodOverrides,
  isManualBrutActiveInOverrides,
  mergeManualWageBrutsIntoPeriodOverrides,
} from "@/features/manual-brut-wage";
import {
  buildTanikRanges,
  calcHakkaniyet,
  calcMahsupSonucuBilirkisi,
  calcMahsupSonucuStandart,
  calculateNet,
  collectDavaciHolidayIds,
  computeUbgt,
  deriveTaxYear,
  formatCoef,
  formatDateTR,
  formatDateTRLong,
  formatMoney,
  parseCoef,
  parseNum,
  round2,
  settleAmountFromMahsupMatrix,
} from "./engine";
import { ALL_STATIC_HOLIDAY_IDS, STATIC_HOLIDAYS } from "./lib/holidays";
import {
  createEmptyForm,
  newLocalId,
  snapshotKey,
  WEEKDAY_LABELS,
  type PeriodOverride,
  type SavedCase,
  type UbgtForm,
} from "./model";
import { clearCorruptCases, deleteCase } from "./storage";
import {
  buildUbgtSaveResult,
  getUbgtCaseCrud,
  listUbgtCasesFromBackend,
} from "./backendCase";
import { buildStandartUbgtPreviewSections } from "./standart/buildStandartUbgtPreviewSections";
import { buildBilirkisiUbgtPreviewSections } from "./bilirkisi/buildBilirkisiUbgtPreviewSections";
import {
  deleteExclusionSet,
  getAllExclusionSets,
  mergeUbgtExclusionImport,
  saveExclusionSet,
  type SavedUbgtExclusionSet,
} from "./exclusionSets";
import {
  detectUbgtModeFromType,
  mapLegacyExpertUbgtCase,
  mapLegacyStandardUbgtCase,
  resolveSavedCaseDisplayName,
} from "./legacyUbgtCaseAdapter";
import UBGTMahsuplasamaModal from "./UBGTMahsuplasamaModal";
import UbgtExclusionCompactUI from "./UbgtExclusionCompactUI";
import UbgtDayYearAccordion from "./UbgtDayYearAccordion";
import UbgtKatsayiModal from "./UbgtKatsayiModal";
import UbgtExpiryBox from "./UbgtExpiryBox";
import UbgtPeriodCetvelTable from "./UbgtPeriodCetvelTable";
import {
  buildCetvelDisplayRows,
  createEmptyManualPeriod,
  sumCetvelTotals,
  type ManualDayRow,
  type ManualPeriodRow,
} from "./ubgtCetvelRows";
import { createUbgtGuidedTour, getUbgtTourWelcome } from "./guidedTour";
import styles from "./UbgtCalcPage.module.css";

const HOLIDAY_NAME_BY_ID: Record<string, string> = Object.fromEntries(
  [
    ...STATIC_HOLIDAYS.national,
    ...STATIC_HOLIDAYS.official,
    ...STATIC_HOLIDAYS.general,
    ...STATIC_HOLIDAYS.religious,
  ].map((h) => [h.id, h.name]),
);

const HOLIDAY_GROUPS: Array<{ title: string; options: Array<{ id: string; name: string; days: number }> }> = [
  { title: "Ulusal Bayramlar", options: [...STATIC_HOLIDAYS.national] },
  { title: "Resmi Tatiller", options: [...STATIC_HOLIDAYS.official] },
  { title: "Genel Tatiller", options: [...STATIC_HOLIDAYS.general] },
  { title: "Dini Bayramlar", options: [...STATIC_HOLIDAYS.religious] },
];

const WEEKDAY_SHORT: Record<number, string> = {
  1: "Pzt",
  2: "Sal",
  3: "Çar",
  4: "Per",
  5: "Cum",
  6: "Cmt",
  0: "Paz",
};
const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

function FlashValue({ value, className }: { value: string; className?: string }) {
  const [flash, setFlash] = useState(false);
  useEffect(() => {
    setFlash(true);
    const t = window.setTimeout(() => setFlash(false), 450);
    return () => window.clearTimeout(t);
  }, [value]);
  return <span className={`${className ?? ""} ${flash ? styles.valueFlash : ""}`.trim()}>{value}</span>;
}

type Props = { mode: "standart" | "bilirkisi"; title: string; backTo: string };

const PAGE_DESCRIPTION: Record<Props["mode"], string> = {
  standart:
    "Ulusal bayram ve genel tatil ücreti hesabı; katsayı, cetvel ve mahsuplaşma V3 ile uyumludur.",
  bilirkisi:
    "Bilirkişi UBGT hesabı; tanık beyanları ve ücret düzenlemesi standart UBGT ile aynıdır.",
};

function NameModal({
  open,
  initial,
  onClose,
  onConfirm,
}: {
  open: boolean;
  initial: string;
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
        <h3 className={styles.modalTitle}>Kaydı adlandır</h3>
        <input className={styles.input} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        <div className={styles.modalActions}>
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            İptal
          </Button>
          <Button type="button" variant="primary" size="sm" disabled={!name.trim()} onClick={() => onConfirm(name.trim())}>
            Kaydet
          </Button>
        </div>
      </div>
    </div>
  );
}

function getHolidayTooltip(holidayId: string): string | undefined {
  if (holidayId === "1-mayis") {
    return "1 Mayıs tatili 2009 yılından itibaren uygulanır.";
  }
  if (holidayId === "15-temmuz") {
    return "15 Temmuz tatili 2017 yılından itibaren uygulanır.";
  }
  return undefined;
}

function HolidayChips({
  selected,
  options,
  onChange,
  ariaLabel,
}: {
  selected: string[];
  options: Array<{ id: string; name: string }>;
  onChange: (ids: string[]) => void;
  ariaLabel?: string;
}) {
  return (
    <div className={styles.chipGrid} role="group" aria-label={ariaLabel || "Seçili tatiller"}>
      {options.map((h) => {
        const on = selected.includes(h.id);
        const tooltip = getHolidayTooltip(h.id);
        return (
          <label key={h.id} className={`${styles.chip} ${on ? styles.chipOn : ""}`} title={tooltip}>
            <input
              type="checkbox"
              checked={on}
              onChange={(e) =>
                onChange(e.target.checked ? [...selected, h.id] : selected.filter((id) => id !== h.id))
              }
            />
            <span>{h.name}</span>
          </label>
        );
      })}
    </div>
  );
}

export default function UbgtCalcPage({ mode, title }: Props) {
  const { success, error: showError, info: toastInfo } = useToast();
  const tour = useGuidedTourController();
  const [searchParams, setSearchParams] = useSearchParams();
  const caseIdParam = searchParams.get("caseId");
  const backendLoadedCaseIdRef = useRef<string | null>(null);

  const [form, setForm] = useState<UbgtForm>(() => createEmptyForm(mode));
  const [cases, setCases] = useState<SavedCase[]>([]);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeName, setActiveName] = useState<string | null>(null);
  useCalculationCaseBinding(activeId);
  const [baseline, setBaseline] = useState(() => snapshotKey(createEmptyForm(mode)));
  const [nameOpen, setNameOpen] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [confirmNew, setConfirmNew] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [mahsupOpen, setMahsupOpen] = useState(false);
  const [showKatsayiModal, setShowKatsayiModal] = useState(false);
  const [hasCustomKatsayi, setHasCustomKatsayi] = useState(false);
  const [globalKatsayi, setGlobalKatsayi] = useState(1);
  const [exclusionSaveOpen, setExclusionSaveOpen] = useState(false);
  const [exclusionLoadOpen, setExclusionLoadOpen] = useState(false);
  const [expiryOpen, setExpiryOpen] = useState(false);
  const [exclusionSaveName, setExclusionSaveName] = useState("");
  const [savedExclusionSets, setSavedExclusionSets] = useState<SavedUbgtExclusionSet[]>([]);
  const [bilirkisiClipError, setBilirkisiClipError] = useState<string | null>(null);
  /** V3 UbgtNetConversion: local editable brüt override (null = use engine toplam). */
  const [brutOverride, setBrutOverride] = useState<number | null>(null);
  const [brutInputValue, setBrutInputValue] = useState("");
  const [caseLoading, setCaseLoading] = useState(false);
  const [caseSaving, setCaseSaving] = useState(false);
  const [importedFromV3, setImportedFromV3] = useState(false);
  const [v3SourceCaseId, setV3SourceCaseId] = useState<string | null>(null);

  const tourDefinition = useMemo(() => createUbgtGuidedTour(mode), [mode]);
  const tourWelcome = useMemo(() => getUbgtTourWelcome(mode), [mode]);
  const tourPaused =
    previewOpen ||
    nameOpen ||
    listOpen ||
    mahsupOpen ||
    showKatsayiModal ||
    exclusionSaveOpen ||
    exclusionLoadOpen ||
    confirmNew ||
    !!confirmDeleteId ||
    expiryOpen;
  const DislamalarTourShell = mode === "bilirkisi" ? "div" : Fragment;
  const dislamalarTourShellProps =
    mode === "bilirkisi"
      ? {
          "data-tour": "ubgt-bilirkisi-dislamalar",
          style: { display: "grid" as const, gap: "1rem", minWidth: 0 },
        }
      : {};

  const ubgtCaseCrud = useMemo(() => getUbgtCaseCrud(mode), [mode]);

  const setCaseIdParam = useCallback(
    (id: string) => {
      const next = new URLSearchParams(searchParams);
      next.set("caseId", id);
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  const holidayOptions = useMemo(
    () => [
      ...STATIC_HOLIDAYS.national,
      ...STATIC_HOLIDAYS.official,
      ...STATIC_HOLIDAYS.general,
      ...STATIC_HOLIDAYS.religious,
    ],
    [],
  );

  /** Bilirkişi: davacı dönem tatilleri birleşimi (V3 davaciSelectedHolidayIds) — no form.selectedHolidayIds fallback. */
  const davaciHolidayIds = useMemo(() => {
    if (mode !== "bilirkisi") return [] as string[];
    return collectDavaciHolidayIds(form.dateRanges);
  }, [mode, form.dateRanges]);

  const davaciAllowedSet = useMemo(() => new Set(davaciHolidayIds), [davaciHolidayIds]);

  const witnessHolidayOptions = useMemo(
    () => holidayOptions.filter((h) => davaciAllowedSet.has(h.id)),
    [holidayOptions, davaciAllowedSet],
  );

  /** V3: when davacı holidays change, strip invalid ids from witnesses. */
  const davaciHolidayKey = davaciHolidayIds.slice().sort().join(",");
  useEffect(() => {
    if (mode !== "bilirkisi") return;
    setForm((f) => {
      let changed = false;
      const witnesses = f.witnesses.map((w) => {
        const next = w.selectedHolidayIds.filter((hid) => davaciAllowedSet.has(hid));
        if (next.length !== w.selectedHolidayIds.length || next.some((id, i) => id !== w.selectedHolidayIds[i])) {
          changed = true;
          return { ...w, selectedHolidayIds: next };
        }
        return w;
      });
      return changed ? { ...f, witnesses } : f;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when davacı holiday set changes
  }, [mode, davaciHolidayKey]);

  const computeRanges = useMemo(() => {
    if (mode === "bilirkisi") {
      const davaci = form.dateRanges.filter((r) => r.start && r.end);
      const tanik = buildTanikRanges(
        davaci.map((r) => ({
          start: r.start,
          end: r.end,
          selectedHolidayIds: r.selectedHolidayIds ?? [],
        })),
        form.witnesses.map((w) => ({
          id: w.id,
          name: w.name || "Tanık",
          start: w.start,
          end: w.end,
          // V3: empty witness holidays stay empty (no fallback to form.selectedHolidayIds)
          selectedHolidayIds: w.selectedHolidayIds ?? [],
        })),
        davaciHolidayIds,
      );
      return tanik.map((t) => ({
        start: t.start,
        end: t.end,
        person: t.person,
        selectedHolidayIds: t.selectedHolidayIds,
      }));
    }
    return form.dateRanges
      .filter((r) => r.start && r.end)
      .map((r) => ({ start: r.start, end: r.end }));
  }, [form.dateRanges, form.witnesses, mode, davaciHolidayIds]);

  /** V3: tax year from latest non-empty range end (bilirkisi = computeRanges / davacı ends). */
  const taxYear = useMemo(() => {
    if (mode === "bilirkisi") {
      const ends = [
        ...form.dateRanges.map((r) => ({ end: r.end })),
        ...computeRanges.map((r) => ({ end: r.end })),
      ];
      return deriveTaxYear(ends);
    }
    return deriveTaxYear(form.dateRanges);
  }, [mode, form.dateRanges, computeRanges]);

  useEffect(() => {
    if (mode !== "bilirkisi") {
      setBilirkisiClipError(null);
      return;
    }
    const hasDavaci = form.dateRanges.some((r) => r.start && r.end);
    if (!hasDavaci) {
      setBilirkisiClipError(null);
      return;
    }
    if (computeRanges.length === 0) {
      setBilirkisiClipError("En az bir tanık için davacı aralığıyla kesişen geçerli tarih girin.");
    } else {
      setBilirkisiClipError(null);
    }
  }, [mode, form.dateRanges, computeRanges.length]);

  const ubgtComputeInput = useMemo(
    () => ({
      dateRanges: computeRanges,
      selectedHolidayIds: mode === "bilirkisi" ? [] : form.selectedHolidayIds,
      ubgtExcludedDays: form.ubgtExcludedDays,
      ubgtExpiryStart: form.ubgtExpiryStart || null,
      excludedWeekdays: form.excludedWeekdays,
      year: taxYear,
      periodOverrides: form.periodOverrides,
      ubgtExclusionRules: form.ubgtExclusionRules,
    }),
    [
      computeRanges,
      mode,
      form.selectedHolidayIds,
      form.ubgtExcludedDays,
      form.ubgtExpiryStart,
      form.excludedWeekdays,
      taxYear,
      form.periodOverrides,
      form.ubgtExclusionRules,
    ],
  );
  const deferredUbgtComputeInput = useDeferredValue(ubgtComputeInput);

  const result = useMemo(() => {
    if (!deferredUbgtComputeInput.dateRanges.length) return null;
    return computeUbgt(deferredUbgtComputeInput);
  }, [deferredUbgtComputeInput]);

  /** Görsel sıra: ISO `date` üzerinden kronolojik (yıl ve yıl-içi). Hesap motoruna dokunulmaz. */
  const sortedExcludedWeekdayHolidays = useMemo(() => {
    const list = result?.excludedWeekdayHolidays ?? [];
    if (list.length <= 1) return list;
    return [...list].sort((a, b) => {
      const ta = Date.parse(a.date.length === 10 ? `${a.date}T00:00:00` : a.date);
      const tb = Date.parse(b.date.length === 10 ? `${b.date}T00:00:00` : b.date);
      if (Number.isNaN(ta) && Number.isNaN(tb)) return 0;
      if (Number.isNaN(ta)) return 1;
      if (Number.isNaN(tb)) return -1;
      return ta - tb;
    });
  }, [result?.excludedWeekdayHolidays]);

  // Engine path already applies periodOverrides (incl. coefficient).
  // Cetvel: V3 benzeri manuel satır / gizlenen otomatik satır birleşimi (motor dışı).
  const enginePeriods = result?.periods ?? [];
  const displayCetvelRows = useMemo(
    () =>
      buildCetvelDisplayRows(
        enginePeriods,
        form.periodOverrides,
        form.manualPeriodRows,
        form.hiddenPeriodIds,
      ),
    [enginePeriods, form.periodOverrides, form.manualPeriodRows, form.hiddenPeriodIds],
  );
  const cetvelTotals = useMemo(() => sumCetvelTotals(displayCetvelRows), [displayCetvelRows]);
  const displayPeriods = displayCetvelRows.map((r) => ({
    period: r.period,
    startISO: r.startISO,
    wage: r.wage,
    coefficient: r.coefficient,
    dailyWage: r.dailyWage,
    ubgtDays: r.ubgtDays,
    ubgtTotal: r.ubgtTotal,
    persons: r.persons,
  }));
  const displayToplamBrut = cetvelTotals.totalBrut;
  const displayTotalDays = cetvelTotals.totalDays;

  // Sync editable brut display when engine brut changes (V3 UbgtNetConversion).
  useEffect(() => {
    const rounded = round2(displayToplamBrut);
    setBrutOverride(null);
    setBrutInputValue(
      rounded > 0 ? `${rounded.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺` : "",
    );
  }, [displayToplamBrut]);

  const displayBrutForNet = brutOverride !== null ? brutOverride : displayToplamBrut;
  const effectiveNet = useMemo(() => {
    if (!result || result.error) return null;
    if (displayBrutForNet <= 0) {
      return { ssk: 0, issizlik: 0, gelirVergisi: 0, gelirVergisiDilimleri: "", damgaVergisi: 0, netAmount: 0 };
    }
    if (brutOverride === null && result.toplamNet) return result.toplamNet;
    return calculateNet(displayBrutForNet, taxYear);
  }, [result, displayBrutForNet, brutOverride, taxYear]);

  const hakkaniyet = useMemo(() => calcHakkaniyet(displayBrutForNet), [displayBrutForNet]);
  const settleNum = parseNum(form.settleAmount);
  /** Mahsup sonucu kartı yalnız gerçek mahsup > 0 iken (standart + bilirkişi). */
  const showMahsupResultCard = Number.isFinite(settleNum) && settleNum > 0;
  const mahsupSonucu = useMemo(() => {
    if (mode === "bilirkisi") {
      return calcMahsupSonucuBilirkisi(displayBrutForNet, hakkaniyet, settleNum);
    }
    return calcMahsupSonucuStandart(effectiveNet?.netAmount ?? 0, hakkaniyet);
  }, [mode, displayBrutForNet, hakkaniyet, settleNum, effectiveNet]);

  const handleBrutInputChange = (value: string) => {
    setBrutInputValue(value);
    let cleanValue = value.replace(/₺/g, "").replace(/\s/g, "").trim();
    cleanValue = cleanValue.replace(/\./g, "").replace(",", ".");
    const numValue = Number(cleanValue) || 0;
    setBrutOverride(numValue);
  };

  const dirty = snapshotKey(form) !== baseline;

  const reloadCases = useCallback(async () => {
    try {
      const items = await listUbgtCasesFromBackend(mode);
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
  }, [mode]);

  useEffect(() => {
    reloadCases();
  }, [reloadCases]);

  const clearCaseIdFromUrl = useCallback(() => {
    if (!searchParams.has("caseId")) return;
    const next = new URLSearchParams(searchParams);
    next.delete("caseId");
    setSearchParams(next, { replace: true });
    backendLoadedCaseIdRef.current = null;
  }, [searchParams, setSearchParams]);

  const resetForm = () => {
    const empty = createEmptyForm(mode);
    setForm(empty);
    setActiveId(null);
    setActiveName(null);
    setBaseline(snapshotKey(empty));
    setImportedFromV3(false);
    setV3SourceCaseId(null);
    setBrutOverride(null);
    setBilirkisiClipError(null);
    setHasCustomKatsayi(false);
    setGlobalKatsayi(1);
    setShowKatsayiModal(false);
  };

  const applyMappedLegacy = useCallback(
    (mapped: NonNullable<ReturnType<typeof mapLegacyStandardUbgtCase>>) => {
      const next = { ...mapped.form, mode };
      setForm(next);
      setActiveId(null);
      setActiveName(mapped.displayName);
      setBaseline(snapshotKey(next));
      setImportedFromV3(true);
      setV3SourceCaseId(mapped.sourceCaseId || null);
      setBrutOverride(null);
      const coefFromOv = Object.values(next.periodOverrides)
        .map((o) => parseCoef(o.coefficient ?? ""))
        .find((n) => n && n !== 1);
      if (coefFromOv) {
        setGlobalKatsayi(coefFromOv);
        setHasCustomKatsayi(true);
      } else {
        setGlobalKatsayi(1);
        setHasCustomKatsayi(false);
      }
      if (mapped.report.warnings.length) {
        console.info("[UBGT legacy import]", mapped.report);
      }
    },
    [mode],
  );

  useEffect(() => {
    if (!caseIdParam) {
      if (backendLoadedCaseIdRef.current !== null) {
        backendLoadedCaseIdRef.current = null;
        resetForm();
      }
      return;
    }
    if (backendLoadedCaseIdRef.current === caseIdParam) return;

    let cancelled = false;
    resetForm();
    setCaseLoading(true);

    const numericId = Number(caseIdParam);
    if (!Number.isFinite(numericId) || numericId <= 0) {
      setCaseLoading(false);
      showError("Geçersiz kayıt kimliği");
      return;
    }

    void getSavedCase(numericId)
      .then((record) => {
        if (cancelled) return;
        const detected = detectUbgtModeFromType(record.type ?? record.hesaplama_tipi);
        if (detected && detected !== mode) {
          showError(
            detected === "bilirkisi"
              ? "Bu kayıt Bilirkişi UBGT sayfasında açılmalıdır."
              : "Bu kayıt Standart UBGT sayfasında açılmalıdır.",
          );
          return;
        }
        const mapped =
          mode === "bilirkisi"
            ? mapLegacyExpertUbgtCase(record.data, record)
            : mapLegacyStandardUbgtCase(record.data, record);
        if (!mapped) {
          showError("Kayıt verisi okunamadı");
          return;
        }
        applyMappedLegacy(mapped);
        setActiveId(String(numericId));
        setActiveName(resolveSavedCaseDisplayName(record));
        backendLoadedCaseIdRef.current = caseIdParam;
        setImportedFromV3(false);
        setV3SourceCaseId(null);
        success(`Kayıt yüklendi: ${resolveSavedCaseDisplayName(record)}`);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : "Kayıt yüklenemedi";
        showError(message);
      })
      .finally(() => {
        if (!cancelled) setCaseLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- resetForm is stable enough per mode
  }, [caseIdParam, mode, applyMappedLegacy, showError, success]);

  const applyCase = (c: SavedCase) => {
    setForm({ ...createEmptyForm(mode), ...c.form, mode });
    setActiveId(c.id);
    setActiveName(c.name);
    setBaseline(snapshotKey({ ...createEmptyForm(mode), ...c.form, mode }));
    setImportedFromV3(false);
    setV3SourceCaseId(null);
    setListOpen(false);
    const coefFromOv = Object.values(c.form.periodOverrides || {})
      .map((o) => parseCoef(o.coefficient ?? ""))
      .find((n) => n && n !== 1);
    if (coefFromOv) {
      setGlobalKatsayi(coefFromOv);
      setHasCustomKatsayi(true);
    } else {
      setGlobalKatsayi(1);
      setHasCustomKatsayi(false);
    }
  };

  const validateRangeDates = useCallback(
    (start: string, end: string) => {
      if (!start || !end) return true;
      if (new Date(start) > new Date(end)) {
        showError("Bitiş tarihi, başlangıç tarihinden önce olamaz.");
        return false;
      }
      return true;
    },
    [showError],
  );

  const handleSave = async (name: string) => {
    if (!result || result.error || !effectiveNet) return;
    setCaseSaving(true);
    const wasUpdate = !!(activeId && /^\d+$/.test(activeId));
    const results = {
      periods: displayPeriods,
      ubgtDayEntries: result.ubgtDayEntries,
      toplamBrut: displayToplamBrut,
      toplamNet: effectiveNet,
      totalDays: displayTotalDays,
    };
    const baseSave = buildUbgtSaveResult(results);
    const enrichedSave = {
      ...baseSave,
      v3Periods: displayCetvelRows,
      katsayi: globalKatsayi,
      excludedWeekdayHolidays: result.excludedWeekdayHolidays ?? [],
      ubgtDayEntries: result.ubgtDayEntries,
      netConversion: {
        ...effectiveNet,
        brut: displayBrutForNet,
        hakkaniyet,
        settleAmount: mode === "bilirkisi" ? form.settleAmount : settleNum,
        gelir: effectiveNet.gelirVergisi,
        gelirDilimleri: effectiveNet.gelirVergisiDilimleri,
        damga: effectiveNet.damgaVergisi,
        net: effectiveNet.netAmount,
        ssk: effectiveNet.ssk + effectiveNet.issizlik,
      },
    };
    const savePayload = mode === "standart" || mode === "bilirkisi" ? enrichedSave : baseSave;
    try {
      const record = await ubgtCaseCrud.saveCase(
        name,
        { ...form, mode },
        savePayload,
        activeId,
      );
      const recordId = String(record.id);
      setActiveId(recordId);
      setActiveName(resolveSavedCaseDisplayName(record));
      setBaseline(snapshotKey(form));
      setCaseIdParam(recordId);
      backendLoadedCaseIdRef.current = recordId;
      setNameOpen(false);
      setImportedFromV3(false);
      setV3SourceCaseId(null);
      await reloadCases();
      success(wasUpdate ? "Kayıt güncellendi" : "Kayıt kaydedildi");
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
  };

  const setOverride = (index: number, patch: PeriodOverride) => {
    setForm((f) => ({
      ...f,
      periodOverrides: {
        ...f.periodOverrides,
        [String(index)]: { ...f.periodOverrides[String(index)], ...patch },
      },
    }));
  };

  const addPeriodBelow = useCallback((rowId: string) => {
    setForm((f) => ({
      ...f,
      manualPeriodRows: [...f.manualPeriodRows, createEmptyManualPeriod(rowId)],
    }));
  }, []);

  const removePeriodRow = useCallback((rowId: string) => {
    setForm((f) => {
      const visible = buildCetvelDisplayRows(
        enginePeriods,
        f.periodOverrides,
        f.manualPeriodRows,
        f.hiddenPeriodIds,
      );
      if (visible.length <= 1) return f;
      if (rowId.startsWith("auto:")) {
        return { ...f, hiddenPeriodIds: [...f.hiddenPeriodIds, rowId] };
      }
      return {
        ...f,
        manualPeriodRows: f.manualPeriodRows.filter((r) => r.id !== rowId),
      };
    });
  }, [enginePeriods]);

  const patchManualPeriod = useCallback((id: string, patch: Partial<ManualPeriodRow>) => {
    setForm((f) => ({
      ...f,
      manualPeriodRows: f.manualPeriodRows.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    }));
  }, []);

  const setManualDayRows = useCallback((rows: ManualDayRow[]) => {
    setForm((f) => ({ ...f, manualDayRows: rows }));
  }, []);

  const excludeAutoDay = useCallback((date: string) => {
    setForm((f) => {
      const exists = f.ubgtExcludedDays.some((d) => d.start === date && d.end === date);
      if (exists) return f;
      return {
        ...f,
        ubgtExcludedDays: [
          ...f.ubgtExcludedDays,
          { id: newLocalId("ex"), type: "Diğer", start: date, end: date, days: 1 },
        ],
      };
    });
  }, []);

  const manualBrutActive = useMemo(
    () => isManualBrutActiveInOverrides(form.periodOverrides),
    [form.periodOverrides],
  );

  const manualBrutRows = useMemo(
    () =>
      enginePeriods.map((p, i) => ({
        id: String(i),
        startISO: p.startISO ?? "",
      })),
    [enginePeriods],
  );

  const handleApplyManualBruts = useCallback((brutById: Record<string, number>) => {
    setForm((f) => ({
      ...f,
      periodOverrides: mergeManualWageBrutsIntoPeriodOverrides(
        f.periodOverrides,
        brutById,
        formatMoney,
      ) as UbgtForm["periodOverrides"],
    }));
  }, []);

  const handleDeactivateManualBrut = useCallback(() => {
    setForm((f) => ({
      ...f,
      periodOverrides: clearManualWageFromPeriodOverrides(
        f.periodOverrides,
      ) as UbgtForm["periodOverrides"],
    }));
  }, []);

  const applyGlobalCoefficient = useCallback(
    (k: number) => {
      const fixed = Number(k.toFixed(4));
      const coefStr = formatCoef(fixed);
      setGlobalKatsayi(fixed);
      setHasCustomKatsayi(fixed !== 1);
      setForm((f) => {
        const nextOverrides = { ...f.periodOverrides };
        const n = Math.max(enginePeriods.length, Object.keys(nextOverrides).length, 1);
        for (let i = 0; i < n; i++) {
          const key = String(i);
          nextOverrides[key] = { ...nextOverrides[key], coefficient: coefStr };
        }
        return {
          ...f,
          periodOverrides: nextOverrides,
          manualPeriodRows: f.manualPeriodRows.map((r) => ({ ...r, coefficient: coefStr })),
        };
      });
    },
    [enginePeriods.length],
  );

  const handleResetKatsayi = useCallback(() => {
    setGlobalKatsayi(1);
    setHasCustomKatsayi(false);
    setForm((f) => {
      const nextOverrides: UbgtForm["periodOverrides"] = {};
      for (const [key, val] of Object.entries(f.periodOverrides)) {
        nextOverrides[key] = { ...val, coefficient: "1" };
      }
      return {
        ...f,
        periodOverrides: nextOverrides,
        manualPeriodRows: f.manualPeriodRows.map((r) => ({ ...r, coefficient: "1" })),
      };
    });
  }, []);

  /** V3: custom katsayı yeni dönem satırlarına da taşınır. */
  useEffect(() => {
    if (!hasCustomKatsayi || enginePeriods.length === 0) return;
    const coefStr = formatCoef(globalKatsayi);
    setForm((f) => {
      let changed = false;
      const next = { ...f.periodOverrides };
      for (let i = 0; i < enginePeriods.length; i++) {
        const key = String(i);
        if (next[key]?.coefficient !== coefStr) {
          next[key] = { ...next[key], coefficient: coefStr };
          changed = true;
        }
      }
      return changed ? { ...f, periodOverrides: next } : f;
    });
  }, [enginePeriods.length, hasCustomKatsayi, globalKatsayi]);

  const iseGirisEarliest = useMemo(() => {
    const starts = form.dateRanges.map((r) => r.start).filter(Boolean).sort();
    return starts[0] || undefined;
  }, [form.dateRanges]);

  const handleExpiryCancel = useCallback(() => {
    success("Zamanaşımı itirazı kaldırıldı, cetvel eski haline döndü.");
  }, [success]);

  const previewSections = useMemo((): PreviewSection[] => {
    if (!result || result.error || !effectiveNet) return [];
    if (mode === "standart") {
      return buildStandartUbgtPreviewSections({
        form,
        displayPeriods: displayCetvelRows,
        displayTotalDays,
        displayBrutForNet,
        effectiveNet,
        hakkaniyet,
      });
    }
    return buildBilirkisiUbgtPreviewSections({
      form,
      displayPeriods: displayCetvelRows,
      displayTotalDays,
      displayBrutForNet,
      effectiveNet,
      hakkaniyet,
      settleNum,
    });
  }, [
    result,
    displayCetvelRows,
    displayBrutForNet,
    displayTotalDays,
    effectiveNet,
    hakkaniyet,
    settleNum,
    mode,
    form,
  ]);

  const periodLabelByIndex = useMemo(() => {
    const out: Record<number, string> = {};
    enginePeriods.forEach((p, i) => {
      out[i] = p.period;
    });
    return out;
  }, [enginePeriods]);

  const amountByDate = useMemo(() => {
    const out: Record<string, number> = {};
    for (const e of result?.ubgtDayEntries ?? []) {
      const idx = e.periodIndex ?? 0;
      const auto = displayCetvelRows.find((r) => r.engineIndex === idx);
      const daily = auto?.dailyWage ?? enginePeriods[idx]?.dailyWage ?? 0;
      out[`${e.date}|${e.holidayId}`] = round2(daily * (e.days || 0));
    }
    return out;
  }, [result?.ubgtDayEntries, displayCetvelRows, enginePeriods]);

  return (
    <div className={styles.page} aria-busy={caseLoading || undefined}>
      {caseLoading ? (
        <div className={styles.privacyBadge} role="status">
          Kayıt yükleniyor…
        </div>
      ) : null}
      <header className={styles.hero}>
        <div className={styles.heroMain}>
          <div className={styles.heroIcon} aria-hidden>
            <Calculator size={22} />
          </div>
          <div>
            <h1 className={styles.title}>{title}</h1>
            <p className={styles.desc}>{PAGE_DESCRIPTION[mode]}</p>
            <div className={styles.privacyBadge}>
              <ShieldCheck size={14} />
              <span>Veriler hesabınıza güvenli şekilde kaydedilir</span>
            </div>
            {importedFromV3 ? (
              <p className={styles.importBanner}>
                Eski kayıt V3&apos;ten içe aktarıldı.
                {v3SourceCaseId ? ` (kaynak #${v3SourceCaseId})` : ""}
              </p>
            ) : null}
            {storageError ? (
              <p className={styles.helper}>
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
              </p>
            ) : null}
          </div>
        </div>
        <div className={styles.heroAside}>
          {activeName ? (
            <div className={styles.recordBadge}>
              <FolderOpen size={13} />
              <span>{activeName}</span>
              {dirty ? <em>· değişti</em> : null}
            </div>
          ) : null}
          <div className={styles.quickTotal}>
            <span>{mode === "bilirkisi" ? "Toplam UBGT ücreti" : "Toplam UBGT Ücreti"}</span>
            <FlashValue className={styles.quickTotalValue} value={`${formatMoney(displayToplamBrut)} ₺`} />
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
            <Button type="button" variant="soft" size="sm" onClick={() => setListOpen(true)}>
              <FolderOpen size={14} /> Kayıtlar ({cases.length})
            </Button>
            <Button
              type="button"
              variant="soft"
              size="sm"
              onClick={() => {
                if (dirty) setConfirmNew(true);
                else {
                  resetForm();
                  clearCaseIdFromUrl();
                }
              }}
            >
              <FilePlus2 size={14} /> Yeni Hesaplama
            </Button>
          </div>
        </div>
      </header>

      <div className={styles.singleColumn}>
        <section className={styles.card} style={{ animationDelay: "60ms" }}>
          <div className={styles.cardTitleRow}>
            <h2 className={styles.cardTitle}>
              {mode === "bilirkisi" ? "Davacı — işe giriş / çıkış" : "İşe Giriş - Çıkış Tarihleri"}
            </h2>
          </div>
          <p className={styles.panelHint}>
            {mode === "bilirkisi"
              ? "Tanık çalışma tarihleri bu aralığa göre kısıtlanır; hesaplama yalnızca tanık beyanları üzerinden yapılır."
              : "Çalışma dönemlerinizi ekleyin"}
          </p>
          <div data-tour={mode === "standart" ? "ubgt-alacagi-donem" : "ubgt-bilirkisi-davaci"}>
            <div className={styles.rangeStack}>
              {form.dateRanges.map((row, idx) => (
                <div key={row.id} className={styles.rangePanel} data-tour-period-row>
                  <div className={styles.rangePanelHead}>
                    <p className={styles.rangePanelTitle} />
                    <div className={styles.rangePanelActions}>
                      {form.dateRanges.length > 1 ? (
                        <button
                          type="button"
                          className={styles.rangeIconBtn}
                          aria-label="Sil"
                          title="Sil"
                          onClick={() =>
                            setForm((f) => ({ ...f, dateRanges: f.dateRanges.filter((_, i) => i !== idx) }))
                          }
                        >
                          <Trash2 size={14} />
                        </button>
                      ) : null}
                    </div>
                  </div>
                  <div className={styles.periodFields2}>
                    <label className={styles.field}>
                      <span className={styles.fieldLabel}>Başlangıç</span>
                      <DraftDateInput
                        className={styles.dateInput}
                        value={row.start}
                        onCommit={(v) =>
                          setForm((f) => ({
                            ...f,
                            dateRanges: f.dateRanges.map((r, i) => (i === idx ? { ...r, start: v } : r)),
                          }))
                        }
                        onBlur={() => validateRangeDates(row.start, row.end)}
                      />
                    </label>
                    <label className={styles.field}>
                      <span className={styles.fieldLabel}>Bitiş</span>
                      <DraftDateInput
                        className={styles.dateInput}
                        value={row.end}
                        onCommit={(v) =>
                          setForm((f) => ({
                            ...f,
                            dateRanges: f.dateRanges.map((r, i) => (i === idx ? { ...r, end: v } : r)),
                          }))
                        }
                        onBlur={() => validateRangeDates(row.start, row.end)}
                      />
                    </label>
                  </div>
                  {mode === "bilirkisi" ? (
                    <div className={styles.rangeHolidayBlock}>
                      <div className={styles.chipToolbar}>
                        <span className={styles.fieldLabel}>Davacı — tatil seçimi (üst sınır)</span>
                        <div className={styles.chipToolbarActions}>
                          <button
                            type="button"
                            className={styles.chipGhostBtn}
                            onClick={() =>
                              setForm((f) => ({
                                ...f,
                                dateRanges: f.dateRanges.map((r, i) =>
                                  i === idx ? { ...r, selectedHolidayIds: [...ALL_STATIC_HOLIDAY_IDS] } : r,
                                ),
                              }))
                            }
                          >
                            Tümünü Seç
                          </button>
                          <button
                            type="button"
                            className={styles.chipGhostBtn}
                            onClick={() =>
                              setForm((f) => ({
                                ...f,
                                dateRanges: f.dateRanges.map((r, i) =>
                                  i === idx ? { ...r, selectedHolidayIds: [] } : r,
                                ),
                              }))
                            }
                          >
                            Tümünü Kaldır
                          </button>
                        </div>
                      </div>
                      <div className={styles.chipGroup}>
                        {HOLIDAY_GROUPS.map((group) => (
                          <div key={group.title}>
                            <p className={styles.chipGroupTitle}>{group.title}</p>
                            <HolidayChips
                              selected={row.selectedHolidayIds ?? []}
                              options={group.options}
                              ariaLabel={group.title}
                              onChange={(ids) => {
                                const otherIds = (row.selectedHolidayIds ?? []).filter(
                                  (id) => !group.options.some((h) => h.id === id),
                                );
                                setForm((f) => ({
                                  ...f,
                                  dateRanges: f.dateRanges.map((r, i) =>
                                    i === idx ? { ...r, selectedHolidayIds: [...otherIds, ...ids] } : r,
                                  ),
                                }));
                              }}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
            <div className={styles.rangeAddRow}>
              <Button
                type="button"
                variant="soft"
                size="sm"
                className={styles.premiumSoftBtn}
                onClick={() =>
                  setForm((f) => ({
                    ...f,
                    dateRanges: [
                      ...f.dateRanges,
                      {
                        id: newLocalId("range"),
                        start: "",
                        end: "",
                        person: mode === "bilirkisi" ? "Davacı" : undefined,
                        selectedHolidayIds: mode === "bilirkisi" ? [] : undefined,
                      },
                    ],
                  }))
                }
              >
                <Plus size={14} /> {mode === "bilirkisi" ? "Davacı dönemi ekle" : "Yeni Tarih Aralığı Ekle"}
              </Button>
            </div>
          </div>

          {mode === "bilirkisi" ? (
            <div data-tour="ubgt-bilirkisi-taniklar" className={styles.witnessSection}>
              <h3 className={styles.subSectionTitle}>Tanıklar</h3>
              <p className={styles.panelHint}>
                Her tanık için çalışıldığı iddia edilen dönemi ve (davacının seçtiği tatiller içinden) kanıtlanan
                tatilleri işaretleyin.
              </p>
              <div className={styles.rangeStack}>
                {form.witnesses.map((w, idx) => (
                  <div key={w.id} className={styles.rangePanel} data-tour-period-row>
                    <div className={styles.rangePanelHead}>
                      <p className={styles.rangePanelTitle} />
                      <div className={styles.rangePanelActions}>
                        {form.witnesses.length > 1 ? (
                          <button
                            type="button"
                            className={styles.rangeIconBtn}
                            aria-label="Sil"
                            title="Sil"
                            onClick={() =>
                              setForm((f) => ({
                                ...f,
                                witnesses: f.witnesses.filter((_, i) => i !== idx),
                              }))
                            }
                          >
                            <Trash2 size={14} />
                          </button>
                        ) : null}
                      </div>
                    </div>
                    <div className={styles.periodFields3}>
                      <label className={styles.field}>
                        <span className={styles.fieldLabel}>Tanık adı</span>
                        <input
                          className={styles.input}
                          value={w.name}
                          onChange={(e) =>
                            setForm((f) => ({
                              ...f,
                              witnesses: f.witnesses.map((x, i) =>
                                i === idx ? { ...x, name: e.target.value } : x,
                              ),
                            }))
                          }
                        />
                      </label>
                      <label className={styles.field}>
                        <span className={styles.fieldLabel}>Başlangıç</span>
                        <DraftDateInput
                          className={styles.dateInput}
                          value={w.start}
                          onCommit={(v) =>
                            setForm((f) => ({
                              ...f,
                              witnesses: f.witnesses.map((x, i) =>
                                i === idx ? { ...x, start: v } : x,
                              ),
                            }))
                          }
                        />
                      </label>
                      <label className={styles.field}>
                        <span className={styles.fieldLabel}>Bitiş</span>
                        <DraftDateInput
                          className={styles.dateInput}
                          value={w.end}
                          onCommit={(v) =>
                            setForm((f) => ({
                              ...f,
                              witnesses: f.witnesses.map((x, i) =>
                                i === idx ? { ...x, end: v } : x,
                              ),
                            }))
                          }
                        />
                      </label>
                    </div>
                    <div className={styles.rangeHolidayBlock}>
                      <div className={styles.chipToolbar}>
                        <span className={styles.fieldLabel}>
                          {`${w.name || "Tanık"} — tatiller (davacı ile sınırlı)`}
                        </span>
                        <div className={styles.chipToolbarActions}>
                          <button
                            type="button"
                            className={styles.chipGhostBtn}
                            disabled={witnessHolidayOptions.length === 0}
                            onClick={() =>
                              setForm((f) => ({
                                ...f,
                                witnesses: f.witnesses.map((x, i) =>
                                  i === idx
                                    ? {
                                        ...x,
                                        selectedHolidayIds: witnessHolidayOptions.map((h) => h.id),
                                      }
                                    : x,
                                ),
                              }))
                            }
                          >
                            Tümünü Seç
                          </button>
                          <button
                            type="button"
                            className={styles.chipGhostBtn}
                            onClick={() =>
                              setForm((f) => ({
                                ...f,
                                witnesses: f.witnesses.map((x, i) =>
                                  i === idx ? { ...x, selectedHolidayIds: [] } : x,
                                ),
                              }))
                            }
                          >
                            Tümünü Kaldır
                          </button>
                        </div>
                      </div>
                      <HolidayChips
                        selected={w.selectedHolidayIds.filter((id) => davaciAllowedSet.has(id))}
                        options={witnessHolidayOptions}
                        ariaLabel={`Tanık ${w.name} tatilleri`}
                        onChange={(ids) =>
                          setForm((f) => ({
                            ...f,
                            witnesses: f.witnesses.map((x, i) =>
                              i === idx
                                ? { ...x, selectedHolidayIds: ids.filter((id) => davaciAllowedSet.has(id)) }
                                : x,
                            ),
                          }))
                        }
                      />
                    </div>
                  </div>
                ))}
              </div>
              <div className={styles.rangeAddRow}>
                <Button
                  type="button"
                  variant="soft"
                  size="sm"
                  className={styles.premiumSoftBtn}
                  onClick={() =>
                    setForm((f) => ({
                      ...f,
                      witnesses: [
                        ...f.witnesses,
                        {
                          id: newLocalId("tanik"),
                          name: `Tanık ${f.witnesses.length + 1}`,
                          start: "",
                          end: "",
                          selectedHolidayIds: [],
                        },
                      ],
                    }))
                  }
                >
                  <Plus size={14} /> Tanık ekle
                </Button>
              </div>
            </div>
          ) : null}

          <div className={styles.periodFields2} style={{ marginTop: "0.85rem" }}>
            <div className={styles.field}>
              <span className={styles.fieldLabel}>İşten çıkış yılı</span>
              <p className={styles.helper} style={{ marginTop: "0.45rem" }}>
                <strong>{taxYear}</strong>
              </p>
            </div>
          </div>
        </section>

        <DislamalarTourShell {...dislamalarTourShellProps}>
        <section
          className={styles.card}
          style={{ animationDelay: "100ms" }}
          data-tour={mode === "standart" ? "ubgt-alacagi-tatiller" : undefined}
        >
          <div className={styles.cardTitleRow}>
            <h2 className={styles.cardTitle}>Tatil Seçimi</h2>
            {mode === "standart" ? (
              <div className={styles.chipToolbarActions}>
                <button
                  type="button"
                  className={styles.chipGhostBtn}
                  onClick={() => setForm((f) => ({ ...f, selectedHolidayIds: [...ALL_STATIC_HOLIDAY_IDS] }))}
                >
                  Tümünü Seç
                </button>
                <button
                  type="button"
                  className={styles.chipGhostBtn}
                  onClick={() => setForm((f) => ({ ...f, selectedHolidayIds: [] }))}
                >
                  Tümünü Kaldır
                </button>
              </div>
            ) : null}
          </div>
          {mode === "standart" ? (
            <>
              <p className={styles.panelHint}>Hesaplamaya dahil edilecek tatilleri seçin</p>
              {HOLIDAY_GROUPS.map((group) => (
                <div key={group.title} className={styles.chipGroup}>
                  <p className={styles.chipGroupTitle}>{group.title}</p>
                  <HolidayChips
                    selected={form.selectedHolidayIds}
                    options={group.options}
                    ariaLabel={group.title}
                    onChange={(ids) => {
                      const otherIds = form.selectedHolidayIds.filter(
                        (id) => !group.options.some((h) => h.id === id),
                      );
                      setForm((f) => ({ ...f, selectedHolidayIds: [...otherIds, ...ids] }));
                    }}
                  />
                </div>
              ))}
            </>
          ) : (
            <p className={styles.panelHint}>Tanık tatili seçmek için önce davacı tatil seçimi yapın.</p>
          )}
          <div style={{ marginTop: "0.75rem" }}>
            <h2 className={styles.cardTitle}>Hafta günü dışlama</h2>
            <p className={styles.panelHint}>
              İşaretlenen hafta günlerine denk gelen resmi tatiller UBGT hesabına dahil edilmez.
            </p>
            <div className={styles.weekdayGrid} role="group" aria-label="Hafta günü dışlama">
              {WEEKDAY_ORDER.map((d) => {
                const on = form.excludedWeekdays.includes(d);
                return (
                  <label key={d} className={`${styles.chip} ${on ? styles.chipOn : ""}`}>
                    <input
                      type="checkbox"
                      checked={on}
                      aria-label={WEEKDAY_LABELS[d]}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          excludedWeekdays: e.target.checked
                            ? [...f.excludedWeekdays, d]
                            : f.excludedWeekdays.filter((x) => x !== d),
                        }))
                      }
                    />
                    <span>{WEEKDAY_SHORT[d]}</span>
                  </label>
                );
              })}
            </div>
          </div>
        </section>

        <section
          className={styles.card}
          style={{ animationDelay: "140ms" }}
          data-tour={mode === "standart" ? "ubgt-alacagi-dislamalar" : undefined}
        >
          <div className={styles.cardTitleRow}>
            <h2 className={styles.cardTitle}>Dışlanabilir günler</h2>
            <div className={styles.rowActions}>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={form.ubgtExcludedDays.length === 0}
                onClick={() => {
                  setExclusionSaveName("");
                  setExclusionSaveOpen(true);
                }}
              >
                <Save size={14} /> Kaydet
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  void getAllExclusionSets().then((sets) => {
                    setSavedExclusionSets(sets);
                    setExclusionLoadOpen(true);
                  });
                }}
              >
                <Download size={14} /> İçe aktar
              </Button>
              <Button
                type="button"
                variant="soft"
                size="sm"
                onClick={() =>
                  setForm((f) => ({
                    ...f,
                    ubgtExcludedDays: [
                      ...f.ubgtExcludedDays,
                      { id: newLocalId("ex"), type: "Yıllık İzin", start: "", end: "", days: 0 },
                    ],
                  }))
                }
              >
                <Plus size={14} /> + Ekle
              </Button>
            </div>
          </div>
          <p className={styles.panelHint}>Yıllık izin ve rapor günlerini dışlayın.</p>
          <p className={styles.chipGroupTitle}>Yıllık izin / çalışılmayan raporlu günler</p>
          {form.ubgtExcludedDays.length === 0 ? (
            <p className={styles.helper}>Henüz kayıtlı liste yok.</p>
          ) : (
            form.ubgtExcludedDays.map((ex, idx) => (
              <div key={ex.id || idx} className={styles.excludeRow}>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Başlangıç</span>
                  <DraftDateInput
                    className={styles.dateInput}
                    value={ex.start}
                    onCommit={(v) =>
                      setForm((f) => ({
                        ...f,
                        ubgtExcludedDays: f.ubgtExcludedDays.map((x, i) =>
                          i === idx ? { ...x, start: v } : x,
                        ),
                      }))
                    }
                  />
                </label>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Bitiş</span>
                  <DraftDateInput
                    className={styles.dateInput}
                    value={ex.end}
                    onCommit={(v) =>
                      setForm((f) => ({
                        ...f,
                        ubgtExcludedDays: f.ubgtExcludedDays.map((x, i) =>
                          i === idx ? { ...x, end: v } : x,
                        ),
                      }))
                    }
                  />
                </label>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Açıklama</span>
                  <select
                    className={styles.selectInput}
                    value={ex.type || "Yıllık İzin"}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        ubgtExcludedDays: f.ubgtExcludedDays.map((x, i) =>
                          i === idx
                            ? { ...x, type: e.target.value as UbgtForm["ubgtExcludedDays"][0]["type"] }
                            : x,
                        ),
                      }))
                    }
                  >
                    <option value="Yıllık İzin">Yıllık İzin</option>
                    <option value="Rapor">Rapor</option>
                    <option value="Diğer">Diğer</option>
                  </select>
                </label>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Sil"
                  onClick={() =>
                    setForm((f) => ({ ...f, ubgtExcludedDays: f.ubgtExcludedDays.filter((_, i) => i !== idx) }))
                  }
                >
                  <Trash2 size={14} />
                </Button>
              </div>
            ))
          )}
          <UbgtExclusionCompactUI
            dateRanges={
              mode === "bilirkisi"
                ? form.dateRanges.map((r) => ({ start: r.start, end: r.end }))
                : form.dateRanges.map((r) => ({ start: r.start, end: r.end }))
            }
            ubgtDayEntries={result?.ubgtDayEntriesTyped ?? []}
            ubgtExclusionRules={form.ubgtExclusionRules}
            setUbgtExclusionRules={(rules) => setForm((f) => ({ ...f, ubgtExclusionRules: rules }))}
          />
        </section>
        </DislamalarTourShell>

        <section className={styles.card} style={{ animationDelay: "180ms" }}>
          {bilirkisiClipError ? <p className={styles.errorText}>{bilirkisiClipError}</p> : null}
          {result?.error ? <p className={styles.errorText}>{result.error}</p> : null}
          <div
            className={styles.cetvelToolbar}
            data-tour={mode === "standart" ? "ubgt-alacagi-ayarlar" : "ubgt-bilirkisi-ayarlar"}
          >
            <div className={styles.katsayiRow}>
              <UbgtExpiryBox
                ubgtExpiryStart={form.ubgtExpiryStart || null}
                onUbgtExpiryStartChange={(d) =>
                  setForm((f) => ({ ...f, ubgtExpiryStart: d ?? "" }))
                }
                onUbgtExpiryCancel={handleExpiryCancel}
                onOpenChange={setExpiryOpen}
                iseGiris={iseGirisEarliest}
              />
              <button
                type="button"
                className={`${styles.katsayiBtn} ${hasCustomKatsayi ? styles.katsayiBtnActive : ""}`}
                onClick={() => setShowKatsayiModal(true)}
              >
                {hasCustomKatsayi ? "Katsayı" : mode === "bilirkisi" ? "Kat sayı hesapla" : "Kat Sayı Hesapla"}
              </button>
              {hasCustomKatsayi ? (
                <button type="button" className={styles.katsayiRemove} onClick={handleResetKatsayi} title="Katsayıyı kaldır">
                  Kaldır
                </button>
              ) : null}
            </div>
            {mode === "standart" && displayCetvelRows.length > 0 ? (
              <ManualBrutWageApplyControls
                rows={manualBrutRows}
                onApplyBrutsByRowId={handleApplyManualBruts}
                manualBrutActive={manualBrutActive}
                onDeactivateManualBrut={handleDeactivateManualBrut}
                success={success}
                error={showError}
              />
            ) : null}
          </div>
          {form.ubgtExpiryStart && displayCetvelRows.length > 0 ? (
            <p className={styles.expiryBanner}>
              Zamanaşımı başlangıç tarihi: {formatDateTR(form.ubgtExpiryStart)} — bu tarihten önceki dönemler
              cetvele dahil edilmemiştir.
            </p>
          ) : null}
          <UbgtPeriodCetvelTable
            rows={displayCetvelRows}
            mode={mode}
            totalBrut={displayToplamBrut}
            onAddBelow={addPeriodBelow}
            onRemove={removePeriodRow}
            onAutoOverride={setOverride}
            onManualPatch={patchManualPeriod}
            helperText={
              mode === "bilirkisi"
                ? "Cetvel, tanık beyanlarına göre oluşur; katsayı ve ücret düzenlemesi standart UBGT ile aynıdır."
                : "Katsayı hesapla butonu ile katsayınızı hesaplayabilirsiniz; bulunan katsayı otomatik olarak hesap tablosuna eklenecektir. Ücret (BRÜT) sütunu istenilirse ücretler bağımsız giriş yapılabilir. Hesaplama (ücret X katsayı / 30 X UBGT günleri = UBGT ücreti) olarak yapılıyor."
            }
          />
        </section>

        <section className={styles.card} style={{ animationDelay: "220ms" }}>
          {sortedExcludedWeekdayHolidays.length ? (
            <div style={{ marginBottom: "0.65rem" }}>
              <h2 className={styles.cardTitle}>Hafta tatili nedeniyle dışlanan tatiller</h2>
              <ul className={styles.helper} style={{ margin: 0, paddingLeft: "1.1rem" }}>
                {sortedExcludedWeekdayHolidays.map((h, i) => (
                  <li key={`${h.date}-${h.name}-${i}`}>
                    {formatDateTRLong(h.date)} — {h.name} ({h.duration} gün)
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <UbgtDayYearAccordion
            entries={result?.ubgtDayEntries ?? []}
            manualDayRows={form.manualDayRows}
            holidayNameById={HOLIDAY_NAME_BY_ID}
            periodLabelByIndex={periodLabelByIndex}
            amountByDate={amountByDate}
            onManualDayRowsChange={setManualDayRows}
            onExcludeAutoDay={excludeAutoDay}
            dateRanges={form.dateRanges.map((r) => ({ start: r.start, end: r.end }))}
            onValidationError={showError}
          />
        </section>

        {result && !result.error && effectiveNet ? (
          <>
            <article className={styles.panel} style={{ animationDelay: "260ms" }}>
              <header className={styles.panelHead}>
                <h3>Brütten nete çevir</h3>
              </header>
              <div className={styles.panelBody}>
                <p className={styles.panelHint}>
                  Tablodaki brüt UBGT toplamının nete çevrimi (işten çıkış yılına göre vergi).
                </p>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Brüt UBGT ücreti</span>
                  <input
                    className={styles.input}
                    value={brutInputValue}
                    onChange={(e) => handleBrutInputChange(e.target.value)}
                    placeholder="Örn: 25000"
                  />
                </label>
                <div className={styles.line}>
                  <span>Brüt UBGT ücreti</span>
                  <FlashValue value={`${formatMoney(displayBrutForNet)}₺`} />
                </div>
                <div className={styles.line}>
                  <span>SGK primi (%14)</span>
                  <span className={styles.deduction}>-{formatMoney(effectiveNet.ssk)}₺</span>
                </div>
                <div className={styles.line}>
                  <span>İşsizlik primi (%1)</span>
                  <span className={styles.deduction}>-{formatMoney(effectiveNet.issizlik)}₺</span>
                </div>
                <div className={styles.line}>
                  <span>Gelir vergisi {effectiveNet.gelirVergisiDilimleri}</span>
                  <span className={styles.deduction}>-{formatMoney(effectiveNet.gelirVergisi)}₺</span>
                </div>
                <div className={styles.line}>
                  <span>Damga vergisi (binde 7,59)</span>
                  <span className={styles.deduction}>-{formatMoney(effectiveNet.damgaVergisi)}₺</span>
                </div>
                <div className={`${styles.line} ${styles.netLine}`}>
                  <span>Net UBGT ücreti</span>
                  <FlashValue value={`${formatMoney(effectiveNet.netAmount)}₺`} />
                </div>
              </div>
            </article>

            <article className={styles.panel} style={{ animationDelay: "280ms" }}>
              <header className={styles.panelHead}>
                <h3>Hakkaniyet ve mahsuplaşma</h3>
              </header>
              <div className={styles.panelBody}>
                <div className={styles.line}>
                  <span>1/3 hakkaniyet indirimi (brüt üzerinden)</span>
                  <span>{formatMoney(hakkaniyet)}₺</span>
                </div>
                <p className={styles.helper}>
                  Brüt {formatMoney(displayBrutForNet)}₺ − 1/3 ={" "}
                  <strong>{formatMoney(displayBrutForNet - hakkaniyet)}₺</strong>
                </p>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Mahsuplaşma miktarı</span>
                  <div className={styles.mahsupRow}>
                    <div className={styles.inputWrap}>
                      <input
                        className={styles.input}
                        style={{ border: 0, height: "auto", boxShadow: "none" }}
                        value={form.settleAmount}
                        onChange={(e) => setForm((f) => ({ ...f, settleAmount: e.target.value }))}
                        placeholder="0,00₺"
                      />
                      <span className={styles.currency}>₺</span>
                    </div>
                    <Button type="button" variant="soft" size="sm" onClick={() => setMahsupOpen(true)}>
                      Mahsuplaşma ekle
                    </Button>
                  </div>
                </label>
                {showMahsupResultCard ? (
                  <>
                    <div className={`${styles.line} ${styles.netLine}`}>
                      <span>{mode === "bilirkisi" ? "Mahsuplaşma sonucu" : "Mahsuplaşma Sonucu"}</span>
                      <FlashValue value={`${formatMoney(mahsupSonucu)} ₺`} />
                    </div>
                    <p className={styles.helper}>
                      {mode === "bilirkisi"
                        ? "Brüt − hakkaniyet − mahsup (min 0)"
                        : "Net − hakkaniyet (mahsup rapor sonucuna dahil edilmez)"}
                    </p>
                  </>
                ) : null}
              </div>
            </article>

            {showMahsupResultCard ? (
              <div className={styles.finalNetCard} style={{ animationDelay: "300ms" }}>
                <p className={styles.finalNetLabel}>
                  {mode === "bilirkisi" ? "Mahsuplaşma sonucu" : "Mahsuplaşma Sonucu"}
                </p>
                <p className={styles.finalNetValue}>
                  <FlashValue value={`${formatMoney(mahsupSonucu)} ₺`} />
                </p>
                <p className={styles.helper}>
                  {mode === "bilirkisi" ? "Toplam UBGT günü" : "Toplam UBGT Günü"}: {displayTotalDays}
                </p>
              </div>
            ) : null}
          </>
        ) : null}

        <section className={styles.card} style={{ animationDelay: "320ms" }}>
          <h2 className={styles.cardTitle}>Notlar</h2>
          <p className={styles.panelHint}>Ulusal Bayram ve Genel Tatil Günleri Hakkında Kanun</p>
          <div className={styles.notesLegal}>
            <p>
              <strong>Madde 1</strong> – 1923 yılında Cumhuriyetin ilan edildiği 29 Ekim günü Ulusal Bayramdır.
            </p>
            <p>
              Türkiye&apos;nin içinde ve dışında Devlet adına yalnız bugün tören yapılır. Bayram 28 Ekim günü saat
              13.00&apos;ten itibaren başlar ve 29 Ekim günü devam eder.
            </p>
            <p>
              <strong>Madde 2</strong> – Aşağıda sayılan resmi ve dini bayram günleri ile yılbaşı günü, 1 Mayıs günü ve
              15 Temmuz günü genel tatil günleridir.
            </p>
            <p>
              <strong>A) Resmi bayram günleri şunlardır:</strong>
            </p>
            <p>
              1. 23 Nisan günü Ulusal Egemenlik ve Çocuk Bayramıdır.
              <br />
              2. 19 Mayıs günü Atatürk&apos;ü Anma ve Gençlik ve Spor Bayramı günüdür.
              <br />
              3. 30 Ağustos günü Zafer Bayramıdır.
            </p>
            <p>
              <strong>B) Dini bayramlar şunlardır:</strong>
            </p>
            <p>
              1. Ramazan Bayramı; Arefe günü saat 13.00&apos;ten itibaren 3,5 gündür.
              <br />
              2. Kurban Bayramı; Arefe günü saat 13.00&apos;ten itibaren 4,5 gündür.
            </p>
            <p>
              <strong>C)</strong> 1 Ocak günü yılbaşı tatili, 1 Mayıs günü Emek ve Dayanışma Günü ve 15 Temmuz günü
              Demokrasi ve Milli Birlik Günü tatilidir.
            </p>
            <p>
              <strong>Madde -2</strong> – 22/4/2009 tarihli ve 5892 sayılı Kanunun 1 inci maddesiyle, &quot;yılbaşı
              günü&quot; ibarelerinden sonra gelmek üzere &quot;ve 1 Mayıs günü&quot; ibaresi eklenmiştir. 25/10/2016
              tarihli ve 6752 sayılı Kanunun 2 nci maddesiyle, bu maddenin birinci fıkrasında yer alan &quot;ve 1 Mayıs
              günü&quot; ibareleri &quot;, 1 Mayıs günü ve 15 Temmuz günü&quot; olarak değiştirilmiştir.
            </p>
            <p>
              <strong>D)</strong> Ulusal, resmi ve dini bayram günleri ile yılbaşı günü, 1 Mayıs günü ve 15 Temmuz günü
              resmi daire ve kuruluşlar tatil edilir.
            </p>
            <p>
              Bu Kanunda belirtilen Ulusal Bayram ve genel tatil günleri; Cuma günü akşamı sona erdiğinde müteakip
              Cumartesi gününün tamamı tatil yapılır.
            </p>
            <p>
              Mahiyetleri itibariyle sürekli görev yapması gereken kuruluşların özel kanunlarındaki hükümler saklıdır.
            </p>
            <p>29 Ekim günü özel işyerlerinin kapanması zorunludur.</p>
          </div>
        </section>
      </div>

      <div
        className={`${styles.stickyBar} ${dirty ? styles.stickyBarDirty : ""}`}
        data-tour={mode === "standart" ? "ubgt-alacagi-kaydet-actions" : "ubgt-bilirkisi-kaydet-actions"}
      >
        <div className={styles.stickyInner}>
          <p className={styles.stickyStatus}>
            {dirty ? "Kaydedilmemiş değişiklikler var" : activeName ? "Tüm değişiklikler kaydedildi" : "Hazır"}
          </p>
          <div className={styles.stickyActions}>
            <Button type="button" variant="soft" size="sm" disabled={!result || !!result.error} onClick={() => setPreviewOpen(true)}>
              <Eye size={14} /> Önizleme
            </Button>
            <Button
              type="button"
              variant="soft"
              size="sm"
              onClick={() => {
                if (dirty) setConfirmNew(true);
                else {
                  resetForm();
                  clearCaseIdFromUrl();
                }
              }}
            >
              <FilePlus2 size={14} /> {mode === "bilirkisi" ? "Yeni hesapla" : "Yeni Hesapla"}
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              disabled={!result || !!result.error || caseSaving}
              onClick={() => {
                if (activeId && activeName && /^\d+$/.test(activeId)) void handleSave(activeName);
                else setNameOpen(true);
              }}
            >
              <Save size={14} /> {caseSaving ? "Kaydediliyor…" : activeId && /^\d+$/.test(activeId) ? "Güncelle" : "Kaydet"}
            </Button>
          </div>
        </div>
      </div>

      <NameModal open={nameOpen} initial={activeName ?? title} onClose={() => setNameOpen(false)} onConfirm={(name) => void handleSave(name)} />

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
                        {new Date(c.savedAt).toLocaleString("tr-TR")} · {formatMoney(c.results.toplamBrut)} ₺
                      </div>
                    </div>
                    <div className={styles.caseBtns}>
                      <Button type="button" variant="soft" size="sm" onClick={() => applyCase(c)}>
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
        description="Kaydedilmemiş değişiklikler kaybolacak. Devam edilsin mi?"
        confirmLabel="Devam et"
        onConfirm={() => {
          setConfirmNew(false);
          resetForm();
          clearCaseIdFromUrl();
        }}
        onCancel={() => setConfirmNew(false)}
      />
      <ConfirmDialog
        open={!!confirmDeleteId}
        title="Kaydı sil"
        description="Bu kayıt kalıcı olarak silinecek."
        confirmLabel="Sil"
        danger
        onConfirm={() => {
          if (!confirmDeleteId) return;
          void (async () => {
            try {
              if (/^\d+$/.test(confirmDeleteId)) {
                await ubgtCaseCrud.removeCase(confirmDeleteId);
              } else {
                deleteCase(confirmDeleteId);
              }
              if (activeId === confirmDeleteId) resetForm();
              await reloadCases();
              success("Kayıt silindi.");
            } catch (error) {
              showError(
                error instanceof ApiError
                  ? error.message
                  : error instanceof Error
                    ? error.message
                    : "Kayıt silinemedi",
              );
            } finally {
              setConfirmDeleteId(null);
            }
          })();
        }}
        onCancel={() => setConfirmDeleteId(null)}
      />
      <CalculationPreviewModal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        title={`${title} — Önizleme`}
        sections={previewSections}
        contentId={`ubgt-${mode}-preview`}
      />

      <UBGTMahsuplasamaModal
        open={mahsupOpen}
        onClose={() => setMahsupOpen(false)}
        tableData={displayPeriods.map((p) => ({
          period: p.period,
          wage: p.wage,
          coefficient: p.coefficient,
          dailyWage: p.dailyWage,
          ubgtDays: p.ubgtDays,
          ubgtTotal: p.ubgtTotal,
        }))}
        initialData={form.mahsuplasamaData}
        onSave={(total, data) => {
          setForm((f) => ({
            ...f,
            mahsuplasamaData: data,
            settleAmount: settleAmountFromMahsupMatrix(data) || formatMoney(total),
          }));
        }}
      />

      <UbgtKatsayiModal
        open={showKatsayiModal}
        onClose={() => setShowKatsayiModal(false)}
        onApply={applyGlobalCoefficient}
      />

      {exclusionSaveOpen ? (
        <div className={styles.modalOverlay} role="dialog" aria-modal="true">
          <div className={styles.modalCard}>
            <h3 className={styles.modalTitle}>Dışlanabilir günleri kaydet</h3>
            <input
              className={styles.input}
              placeholder="Örn: Davacı A - yıllık izinler"
              value={exclusionSaveName}
              onChange={(e) => setExclusionSaveName(e.target.value)}
              autoFocus
            />
            <div className={styles.modalActions}>
              <Button type="button" variant="ghost" size="sm" onClick={() => setExclusionSaveOpen(false)}>
                İptal
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                disabled={!exclusionSaveName.trim()}
                onClick={() => {
                  if (!exclusionSaveName.trim()) {
                    showError("Lütfen bir isim girin.");
                    return;
                  }
                  void (async () => {
                    const ok = await saveExclusionSet(exclusionSaveName.trim(), form.ubgtExcludedDays);
                    if (ok) {
                      success(`"${exclusionSaveName.trim()}" olarak kaydedildi.`);
                      setExclusionSaveOpen(false);
                    } else {
                      showError("Kaydetme başarısız oldu.");
                    }
                  })();
                }}
              >
                Kaydet
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {exclusionLoadOpen ? (
        <div className={styles.modalOverlay} role="dialog" aria-modal="true">
          <div className={styles.modalCard}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 className={styles.modalTitle}>Kayıtlı dışlanabilir günler</h3>
              <Button type="button" variant="ghost" size="icon" onClick={() => setExclusionLoadOpen(false)} aria-label="Kapat">
                <X size={16} />
              </Button>
            </div>
            {savedExclusionSets.length === 0 ? (
              <p className={styles.helper}>Henüz kayıtlı liste yok.</p>
            ) : (
              <div className={styles.caseList}>
                {savedExclusionSets.map((set) => (
                  <div key={set.id} className={styles.caseItem}>
                    <div style={{ minWidth: 0 }}>
                      <div className={styles.caseName}>{set.name}</div>
                      <div className={styles.caseMeta}>{set.data.length} kayıt</div>
                    </div>
                    <div className={styles.caseBtns}>
                      <Button
                        type="button"
                        variant="soft"
                        size="sm"
                        onClick={() => {
                          setForm((f) => ({
                            ...f,
                            ubgtExcludedDays: mergeUbgtExclusionImport(
                              f.ubgtExcludedDays,
                              set.data,
                              () => newLocalId("ex"),
                            ),
                          }));
                          success(`"${set.name}" içe aktarıldı.`);
                          setExclusionLoadOpen(false);
                        }}
                      >
                        Yükle
                      </Button>
                      <Button
                        type="button"
                        variant="danger"
                        size="icon"
                        aria-label="Sil"
                        onClick={() => {
                          void (async () => {
                            await deleteExclusionSet(set.id);
                            setSavedExclusionSets(await getAllExclusionSets());
                            success("Silindi.");
                          })();
                        }}
                      >
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

      <GuidedTourHost
        key={mode}
        definition={tourDefinition}
        active={tour.active}
        onActiveChange={tour.setActive}
        welcomeOpen={tour.welcomeOpen}
        onWelcomeOpenChange={tour.setWelcomeOpen}
        welcomeTitle={tourWelcome.title}
        welcomeBody={tourWelcome.body}
        welcomeStartLabel="Başlat"
        welcomeLaterLabel="Kendim devam edeceğim"
        initialStepIndex={tour.resumeStepIndex}
        onCollectingComplete={() => {
          tour.completeTour();
          toastInfo("Kılavuz tamamlandı. Hesaplamanızı önizleyebilir veya kaydedebilirsiniz.");
        }}
        paused={tourPaused}
      />
    </div>
  );
}
