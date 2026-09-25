import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Calculator,
  CirclePlay,
  Download,
  Eye,
  FilePlus2,
  FolderOpen,
  Plus,
  Save,
  Scale,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { ApiError } from "@/api/client";
import { getSavedCase } from "@/api/savedCases";
import { CalculationPreviewModal, type PreviewSection } from "@/components/calculation-preview";
import { GuidedTourHost, useGuidedTourController } from "@/components/guided-tour";
import tourStyles from "@/components/guided-tour/GuidedTour.module.css";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { useToast } from "@/context/ToastContext";
import {
  DAVACI_UCRETI_TOUR,
  DAVACI_UCRETI_TOUR_WELCOME_BODY,
  DAVACI_UCRETI_TOUR_WELCOME_TITLE,
} from "./guidedTour";
import { mapDavaciFormFromBackend, resolveSavedCaseDisplayName, saveDavaciCaseToBackend, listDavaciCasesFromBackend, deleteDavaciCaseFromBackend, isDavaciRecordType } from "./backendCase";
import {
  calculateTotalBrut,
  computeEklentiResult,
  deriveAsgariUcretError,
  deriveGrossFromNet,
  deriveNetFromGross,
  fmtCurrency,
  hasTwoPeriods,
  parseNum,
  sanitizeMoneyTyping,
} from "./engine";
import {
  createDefaultExtraItems,
  newLocalId,
  type DavaciFormSnapshot,
  type ExtraItem,
  type NetFromGrossData,
  type Period,
  type SavedCase,
  type SavedExtraSet,
} from "./model";
import {
  clearCorruptCases,
  deleteCase,
  loadCasesSafe,
  purgeObsoleteLocalSetStores,
  readExtraSetsCache,
  writeExtraSetsCache,
} from "./storage";
import {
  describeSetsError,
  listExtraSets,
  removeExtraSet,
  upsertExtraSet,
} from "./extraSetsApi";
import { YEAR_MIN } from "./taxData";
import styles from "./DavaciUcretiPage.module.css";

const PAGE_TITLE = "Davacı Ücreti Hesaplama";
const NOTE_INFO_LINES = [
  "Çıplak brüt ücret, işçinin ücret ekleri hariç brüt temel ücretidir.",
  "Prim, ikramiye ve benzeri dönemsel ücret eklerinin aylık ortalaması; son 12 aylık dönemde yapılan ödemelerin toplamının 360'a bölünüp 30 ile çarpılması suretiyle hesaplanır.",
] as const;

/* ── Değer değişince kısa vurgu animasyonu ── */
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

/* ── Kesinti satırları (brütten nete / netten brüte) ── */
function DeductionLines({ mode, data }: { mode: "gross-to-net" | "net-to-gross"; data: NetFromGrossData }) {
  const sign = (v: string) => (mode === "gross-to-net" ? `-${v}` : `+${v}`);
  const exSign = mode === "gross-to-net" ? "+" : "-";
  const hasIncomeEx = (data.gelirVergisiIstisna ?? 0) > 0;
  const hasStampEx = (data.damgaVergisiIstisna ?? 0) > 0;

  return (
    <>
      <div className={styles.line}>
        <span>SGK primi (%14)</span>
        <span className={styles.deduction}>{sign(`${fmtCurrency(data.sgk)} ₺`)}</span>
      </div>
      <div className={styles.line}>
        <span>İşsizlik primi (%1)</span>
        <span className={styles.deduction}>{sign(`${fmtCurrency(data.issizlik)} ₺`)}</span>
      </div>
      {hasIncomeEx ? (
        <>
          <div className={styles.line}>
            <span>Gelir vergisi (brüt)</span>
            <span className={styles.deduction}>{sign(`${fmtCurrency(data.gelirVergisiBrut)} ₺`)}</span>
          </div>
          <div className={styles.line}>
            <span>Asg. üc. gelir vergi ist.</span>
            <span className={styles.exemption}>
              {exSign}
              {fmtCurrency(data.gelirVergisiIstisna)} ₺
            </span>
          </div>
          <div className={styles.line}>
            <span>Net gelir vergisi</span>
            <span>{sign(`${fmtCurrency(data.gelirVergisi)} ₺`)}</span>
          </div>
        </>
      ) : (
        <div className={styles.line}>
          <span>Gelir vergisi {data.gelirVergisiDilimleri}</span>
          <span className={styles.deduction}>{sign(`${fmtCurrency(data.gelirVergisi)} ₺`)}</span>
        </div>
      )}
      {hasStampEx ? (
        <>
          <div className={styles.line}>
            <span>Damga vergisi (brüt)</span>
            <span className={styles.deduction}>{sign(`${fmtCurrency(data.damgaVergisiBrut)} ₺`)}</span>
          </div>
          <div className={styles.line}>
            <span>Asg. üc. damga vergi ist.</span>
            <span className={styles.exemption}>
              {exSign}
              {fmtCurrency(data.damgaVergisiIstisna)} ₺
            </span>
          </div>
          <div className={styles.line}>
            <span>Net damga vergisi</span>
            <span>{sign(`${fmtCurrency(data.damgaVergisi)} ₺`)}</span>
          </div>
        </>
      ) : (
        <div className={styles.line}>
          <span>Damga vergisi (binde 7,59)</span>
          <span className={styles.deduction}>{sign(`${fmtCurrency(data.damgaVergisi)} ₺`)}</span>
        </div>
      )}
    </>
  );
}

/* ── İsimle kaydetme modalı ── */
function NameModal({
  open,
  title,
  description,
  placeholder,
  confirmLabel,
  loadingLabel,
  initialValue,
  loading,
  onClose,
  onSave,
}: {
  open: boolean;
  title: string;
  description?: string;
  placeholder: string;
  confirmLabel: string;
  loadingLabel?: string;
  initialValue?: string;
  loading?: boolean;
  onClose: () => void;
  onSave: (name: string) => void;
}) {
  const [value, setValue] = useState(initialValue ?? "");
  useEffect(() => {
    if (open) setValue(initialValue ?? "");
  }, [open, initialValue]);

  if (!open) return null;
  return (
    <div className={styles.modalOverlay} role="presentation" onClick={loading ? undefined : onClose}>
      <div
        className={styles.modalCard}
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className={styles.modalTitle}>{title}</h2>
        {description ? <p className={styles.modalDesc}>{description}</p> : null}
        <input
          className={styles.modalInput}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          autoFocus
          disabled={loading}
          onKeyDown={(e) => {
            if (e.key === "Enter" && value.trim() && !loading) onSave(value.trim());
          }}
        />
        <div className={styles.modalActions}>
          <Button variant="soft" onClick={onClose} disabled={loading}>
            İptal
          </Button>
          <Button
            variant="primary"
            disabled={!value.trim() || loading}
            onClick={() => onSave(value.trim())}
          >
            {loading ? loadingLabel || "Kaydediliyor…" : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

type PendingAction = { kind: "new" } | { kind: "open"; caseId: string } | null;

export default function DavaciUcretiPage() {
  const toast = useToast();
  const tour = useGuidedTourController();
  const [searchParams, setSearchParams] = useSearchParams();
  const caseIdParam = searchParams.get("caseId");
  const currentYear = new Date().getFullYear();
  const yearOptions = useMemo(
    () => Array.from({ length: currentYear - (YEAR_MIN - 1) }, (_, i) => currentYear - i),
    [currentYear],
  );

  /* form state */
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedPeriod, setSelectedPeriod] = useState<Period>(2);
  const [ciplakBrut, setCiplakBrut] = useState("");
  const [extraItems, setExtraItems] = useState<ExtraItem[]>(createDefaultExtraItems);
  const [netForGross, setNetForGross] = useState("");

  /* kayıt state */
  const [currentRecordId, setCurrentRecordId] = useState<string | null>(null);
  const [currentRecordName, setCurrentRecordName] = useState<string | null>(null);
  const [savedCases, setSavedCases] = useState<SavedCase[]>([]);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [caseLoading, setCaseLoading] = useState(false);
  const [caseSaving, setCaseSaving] = useState(false);
  const backendLoadedCaseIdRef = useRef<string | null>(null);

  /* set state — asıl kaynak backend */
  const [savedSets, setSavedSets] = useState<SavedExtraSet[]>([]);
  const [setsLoading, setSetsLoading] = useState(false);
  const [setsSaving, setSetsSaving] = useState(false);
  const [setsDeleting, setSetsDeleting] = useState(false);
  const [setsError, setSetsError] = useState<string | null>(null);
  const [setsFromCache, setSetsFromCache] = useState(false);

  /* ui state */
  const [removingIds, setRemovingIds] = useState<string[]>([]);
  const [eklentiFor, setEklentiFor] = useState<string | null>(null);
  const [eklentiMonths, setEklentiMonths] = useState<Record<string, string[]>>({});
  const [showImportModal, setShowImportModal] = useState(false);
  const [showSetSaveModal, setShowSetSaveModal] = useState(false);
  const [showCaseSaveModal, setShowCaseSaveModal] = useState(false);
  const [showRecordsModal, setShowRecordsModal] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [deleteSetTarget, setDeleteSetTarget] = useState<SavedExtraSet | null>(null);
  const [deleteCaseTarget, setDeleteCaseTarget] = useState<SavedCase | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [saveFlash, setSaveFlash] = useState(false);
  const [formSwap, setFormSwap] = useState(false);
  const [baseline, setBaseline] = useState<string>("");

  const setCaseIdParam = useCallback(
    (id: string) => {
      const next = new URLSearchParams(searchParams);
      next.set("caseId", id);
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  const clearCaseIdParam = useCallback(() => {
    if (!searchParams.has("caseId")) return;
    const next = new URLSearchParams(searchParams);
    next.delete("caseId");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const snapshot = useCallback(
    (): DavaciFormSnapshot => ({
      ciplakBrut,
      extraItems: extraItems.map((i) => ({ id: i.id, name: i.name, value: i.value })),
      selectedYear,
      selectedPeriod,
      notes: "",
    }),
    [ciplakBrut, extraItems, selectedYear, selectedPeriod],
  );

  const snapshotKey = (s: DavaciFormSnapshot) =>
    JSON.stringify({
      c: s.ciplakBrut,
      e: s.extraItems.map((i) => [i.name, i.value]),
      y: s.selectedYear,
      p: s.selectedPeriod,
    });

  const reloadCases = useCallback(async () => {
    try {
      const items = await listDavaciCasesFromBackend(currentYear);
      setStorageError(null);
      setSavedCases(items);
    } catch (error) {
      const message =
        error instanceof ApiError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Kayıtlar yüklenemedi";
      setStorageError(message);
      const local = loadCasesSafe();
      setSavedCases(local.ok ? local.items : []);
    }
  }, [currentYear]);

  /** Backend'den set listesini yükler; başarısızsa yalnızca görüntüleme için cache gösterir. */
  const reloadSets = useCallback(async () => {
    setSetsLoading(true);
    setSetsError(null);
    try {
      const sets = await listExtraSets();
      setSavedSets(sets);
      setSetsFromCache(false);
      writeExtraSetsCache(sets);
    } catch (error) {
      const cached = readExtraSetsCache();
      setSavedSets(cached);
      setSetsFromCache(cached.length > 0);
      setSetsError(describeSetsError(error));
    } finally {
      setSetsLoading(false);
    }
  }, []);

  const openImportModal = () => {
    setShowImportModal(true);
    void reloadCases();
    void reloadSets();
  };

  useEffect(() => {
    purgeObsoleteLocalSetStores();
    void reloadCases();
    void reloadSets();
    setBaseline(
      snapshotKey({
        ciplakBrut: "",
        extraItems: createDefaultExtraItems().map((i) => ({ id: i.id, name: i.name, value: i.value })),
        selectedYear: currentYear,
        selectedPeriod: 2,
        notes: "",
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isDirty = useMemo(() => snapshotKey(snapshot()) !== baseline, [snapshot, baseline]);

  /* türetilmiş sonuçlar */
  const totalBrut = useMemo(() => calculateTotalBrut(ciplakBrut, extraItems), [ciplakBrut, extraItems]);
  const netFromGross = useMemo(
    () => deriveNetFromGross(totalBrut, selectedYear, selectedPeriod),
    [totalBrut, selectedYear, selectedPeriod],
  );
  const grossFromNet = useMemo(
    () => deriveGrossFromNet(netForGross, selectedYear, selectedPeriod),
    [netForGross, selectedYear, selectedPeriod],
  );
  const asgariHatasi = useMemo(
    () => deriveAsgariUcretError(ciplakBrut, selectedYear, selectedPeriod),
    [ciplakBrut, selectedYear, selectedPeriod],
  );
  const twoPeriods = useMemo(() => hasTwoPeriods(selectedYear), [selectedYear]);

  /* form işlemleri */
  const triggerFormSwap = () => {
    setFormSwap(true);
    window.setTimeout(() => setFormSwap(false), 480);
  };

  const resetFormFields = useCallback(() => {
    const fresh = createDefaultExtraItems();
    setCiplakBrut("");
    setExtraItems(fresh);
    setSelectedYear(currentYear);
    setSelectedPeriod(2);
    setNetForGross("");
    setCurrentRecordId(null);
    setCurrentRecordName(null);
    setEklentiMonths({});
    setBaseline(
      snapshotKey({
        ciplakBrut: "",
        extraItems: fresh.map((i) => ({ id: i.id, name: i.name, value: i.value })),
        selectedYear: currentYear,
        selectedPeriod: 2,
        notes: "",
      }),
    );
  }, [currentYear]);

  const applyNewForm = useCallback(() => {
    backendLoadedCaseIdRef.current = null;
    clearCaseIdParam();
    resetFormFields();
    triggerFormSwap();
  }, [clearCaseIdParam, resetFormFields]);

  const applyOpenCase = useCallback(
    (c: SavedCase) => {
      backendLoadedCaseIdRef.current = /^\d+$/.test(c.id) ? c.id : null;
      if (/^\d+$/.test(c.id)) {
        setCaseIdParam(c.id);
      } else {
        clearCaseIdParam();
      }
      const items: ExtraItem[] = (c.form.extraItems ?? []).map((i) => ({
        id: i.id || newLocalId(),
        name: String(i.name ?? ""),
        value: String(i.value ?? ""),
      }));
      const year = Number(c.form.selectedYear) || currentYear;
      setCiplakBrut(String(c.form.ciplakBrut ?? ""));
      setExtraItems(items);
      setSelectedYear(year);
      setSelectedPeriod(!hasTwoPeriods(year) ? 2 : ((Number(c.form.selectedPeriod) as Period) || 2));
      setNetForGross("");
      setCurrentRecordId(c.id);
      setCurrentRecordName(c.name);
      setBaseline(
        snapshotKey({
          ciplakBrut: String(c.form.ciplakBrut ?? ""),
          extraItems: items.map((i) => ({ id: i.id, name: i.name, value: i.value })),
          selectedYear: year,
          selectedPeriod: !hasTwoPeriods(year) ? 2 : ((Number(c.form.selectedPeriod) as Period) || 2),
          notes: "",
        }),
      );
      setShowRecordsModal(false);
      triggerFormSwap();
      toast.success("Kayıt yüklendi");
    },
    [clearCaseIdParam, currentYear, setCaseIdParam, toast],
  );

  const applyBackendForm = useCallback(
    (form: DavaciFormSnapshot, recordId: string, recordName: string) => {
      const items: ExtraItem[] = (form.extraItems ?? []).map((i) => ({
        id: i.id || newLocalId(),
        name: String(i.name ?? ""),
        value: String(i.value ?? ""),
      }));
      const year = Number(form.selectedYear) || currentYear;
      const period: Period = !hasTwoPeriods(year) ? 2 : ((Number(form.selectedPeriod) as Period) || 2);
      setCiplakBrut(String(form.ciplakBrut ?? ""));
      setExtraItems(items);
      setSelectedYear(year);
      setSelectedPeriod(period);
      setNetForGross("");
      setCurrentRecordId(recordId);
      setCurrentRecordName(recordName);
      setEklentiMonths({});
      setBaseline(
        snapshotKey({
          ciplakBrut: String(form.ciplakBrut ?? ""),
          extraItems: items.map((i) => ({ id: i.id, name: i.name, value: i.value })),
          selectedYear: year,
          selectedPeriod: period,
          notes: "",
        }),
      );
      triggerFormSwap();
    },
    [currentYear],
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
    resetFormFields();
    setCaseLoading(true);

    const numericId = Number(caseIdParam);
    if (!Number.isFinite(numericId) || numericId <= 0) {
      setCaseLoading(false);
      toast.error("Geçersiz kayıt kimliği");
      return;
    }

    void getSavedCase(numericId)
      .then((record) => {
        if (cancelled) return;
        if (!isDavaciRecordType(record.type ?? record.hesaplama_tipi)) {
          toast.error("Bu kayıt Davacı Ücreti hesaplamasına ait değil");
          return;
        }
        const mapped = mapDavaciFormFromBackend(record.data, currentYear);
        if (!mapped) {
          toast.error("Kayıt verisi okunamadı");
          return;
        }
        applyBackendForm(mapped, String(record.id), resolveSavedCaseDisplayName(record));
        backendLoadedCaseIdRef.current = caseIdParam;
        toast.success("Kayıt yüklendi");
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const message =
          error instanceof ApiError
            ? error.message
            : error instanceof Error
              ? error.message
              : "Kayıt yüklenemedi";
        toast.error(message);
      })
      .finally(() => {
        if (!cancelled) setCaseLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [applyBackendForm, caseIdParam, currentYear, resetFormFields, toast]);

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

  /* kalem işlemleri */
  const updateItem = (id: string, patch: Partial<ExtraItem>) => {
    setExtraItems((items) => items.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  };

  const removeItem = (id: string) => {
    setRemovingIds((prev) => [...prev, id]);
    window.setTimeout(() => {
      setExtraItems((items) => items.filter((row) => row.id !== id));
      setRemovingIds((prev) => prev.filter((x) => x !== id));
    }, 220);
  };

  const addItem = () => {
    setExtraItems((items) => [...items, { id: newLocalId(), name: "", value: "" }]);
  };

  /* eklenti */
  const openEklenti = (itemId: string) => {
    setEklentiMonths((prev) => (prev[itemId] ? prev : { ...prev, [itemId]: Array(12).fill("") }));
    setEklentiFor(itemId);
  };

  const applyEklenti = () => {
    if (!eklentiFor) return;
    const months = eklentiMonths[eklentiFor] ?? Array(12).fill("");
    const value = computeEklentiResult(months) || 0;
    updateItem(eklentiFor, { value: value.toFixed(2).replace(".", ",") });
    setEklentiFor(null);
  };

  /* set işlemleri — backend CRUD; başarı yalnızca sunucu cevabıyla */
  const handleSaveSet = async (name: string) => {
    if (extraItems.length === 0) {
      toast.error("Kaydedilecek ekstra hesaplama bulunamadı");
      return;
    }
    if (setsFromCache && setsError) {
      toast.error("Çevrimdışıyken set kaydedilemez. Bağlantıyı kontrol edip tekrar deneyin.");
      return;
    }
    setSetsSaving(true);
    try {
      await upsertExtraSet(name, extraItems);
      await reloadSets();
      setShowSetSaveModal(false);
      toast.success("Ekstra hesaplamalar kaydedildi");
    } catch (error) {
      toast.error(describeSetsError(error));
    } finally {
      setSetsSaving(false);
    }
  };

  const handleImportSet = (set: SavedExtraSet) => {
    if (!set.data || set.data.length === 0) {
      toast.error("Yüklenecek veri bulunamadı");
      return;
    }
    setExtraItems(
      set.data.map((i) => ({
        id: i.id || newLocalId(),
        name: String(i.name ?? ""),
        value: String(i.value ?? ""),
      })),
    );
    setShowImportModal(false);
    toast.success("Ekstra hesaplamalar yüklendi");
  };

  const confirmDeleteSet = async () => {
    if (!deleteSetTarget) return;
    if (setsFromCache && setsError) {
      toast.error("Çevrimdışıyken set silinemez. Bağlantıyı kontrol edip tekrar deneyin.");
      setDeleteSetTarget(null);
      return;
    }
    setSetsDeleting(true);
    try {
      await removeExtraSet(deleteSetTarget.id);
      await reloadSets();
      setDeleteSetTarget(null);
      toast.success("Set silindi");
    } catch (error) {
      toast.error(describeSetsError(error));
    } finally {
      setSetsDeleting(false);
    }
  };

  /* kayıt işlemleri — backend saved-cases */
  const persistCase = async (name: string) => {
    if (totalBrut <= 0 && (netFromGross.net || 0) <= 0) {
      toast.error("Önce geçerli bir hesaplama yapın");
      return;
    }
    setCaseSaving(true);
    const wasUpdate = !!(currentRecordId && /^\d+$/.test(currentRecordId));
    try {
      const record = await saveDavaciCaseToBackend(
        name,
        snapshot(),
        totalBrut,
        netFromGross,
        currentRecordId,
      );
      const recordId = String(record.id);
      setCurrentRecordId(recordId);
      setCurrentRecordName(resolveSavedCaseDisplayName(record));
      setBaseline(snapshotKey(snapshot()));
      setCaseIdParam(recordId);
      backendLoadedCaseIdRef.current = recordId;
      setShowCaseSaveModal(false);
      setSaveFlash(true);
      window.setTimeout(() => setSaveFlash(false), 700);
      await reloadCases();
      toast.success(wasUpdate ? "Kayıt güncellendi" : "Kayıt oluşturuldu");
    } catch (error) {
      const message =
        error instanceof ApiError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Kayıt başarısız";
      toast.error(message);
    } finally {
      setCaseSaving(false);
    }
  };

  const handleSaveCase = () => {
    if (currentRecordName && currentRecordId && /^\d+$/.test(currentRecordId)) {
      void persistCase(currentRecordName);
      return;
    }
    setShowCaseSaveModal(true);
  };

  const confirmDeleteCase = async () => {
    if (!deleteCaseTarget) return;
    const targetId = deleteCaseTarget.id;
    try {
      if (/^\d+$/.test(targetId)) {
        await deleteDavaciCaseFromBackend(targetId);
      } else {
        deleteCase(targetId);
      }
      if (currentRecordId === targetId) {
        setCurrentRecordId(null);
        setCurrentRecordName(null);
        clearCaseIdParam();
        backendLoadedCaseIdRef.current = null;
      }
      await reloadCases();
      setDeleteCaseTarget(null);
      toast.success("Kayıt silindi");
    } catch (error) {
      const message =
        error instanceof ApiError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Kayıt silinemedi";
      toast.error(message);
    }
  };

  /* önizleme bölümleri — V3 ile aynı içerik düzeni */
  const previewSections = useMemo((): PreviewSection[] => {
    const moneySpaced = (v: number) => `${fmtCurrency(v)} ₺`;
    const moneyTight = (v: number) => `${fmtCurrency(v)}₺`;
    const sections: PreviewSection[] = [];

    sections.push({
      id: "ust-bilgiler",
      title: "Üst Bilgiler",
      headers: ["Hesaplama Yılı", "Tarih"],
      rows: [[String(selectedYear), new Date().toLocaleDateString("tr-TR")]],
    });

    const compRows: string[][] = [["Çıplak Brüt Ücret", moneyTight(parseNum(ciplakBrut))]];
    extraItems
      .filter((i) => parseNum(i.value) > 0)
      .forEach((i, idx) => {
        compRows.push([i.name || `Ek Kalem ${idx + 1}`, moneyTight(parseNum(i.value))]);
      });
    compRows.push(["Giydirilmiş Brüt Ücret", moneyTight(totalBrut)]);
    sections.push({
      id: "ana-hesap",
      title: "Ücret Bileşenleri",
      headers: ["Kalem", "Tutar"],
      rows: compRows,
      lastRowTone: "blue",
    });

    if (netFromGross.gross > 0) {
      const rows: string[][] = [
        ["Brüt Ücret", moneySpaced(netFromGross.gross)],
        ["SGK Primi (%14)", `-${moneySpaced(netFromGross.sgk)}`],
        ["İşsizlik Primi (%1)", `-${moneySpaced(netFromGross.issizlik)}`],
      ];
      if (netFromGross.gelirVergisiIstisna > 0) {
        rows.push(
          ["Gelir Vergisi (Brüt)", `-${moneySpaced(netFromGross.gelirVergisiBrut)}`],
          ["Asg. Üc. Gelir Vergi İstisnası", `+${moneySpaced(netFromGross.gelirVergisiIstisna)}`],
          ["Net Gelir Vergisi", `-${moneySpaced(netFromGross.gelirVergisi)}`],
        );
      } else {
        rows.push([
          `Gelir Vergisi ${netFromGross.gelirVergisiDilimleri}`.trim(),
          `-${moneySpaced(netFromGross.gelirVergisi)}`,
        ]);
      }
      if (netFromGross.damgaVergisiIstisna > 0) {
        rows.push(
          ["Damga Vergisi (Brüt)", `-${moneySpaced(netFromGross.damgaVergisiBrut)}`],
          ["Asg. Üc. Damga Vergi İstisnası", `+${moneySpaced(netFromGross.damgaVergisiIstisna)}`],
          ["Net Damga Vergisi", `-${moneySpaced(netFromGross.damgaVergisi)}`],
        );
      } else {
        rows.push(["Damga Vergisi (binde 7,59)", `-${moneySpaced(netFromGross.damgaVergisi)}`]);
      }
      rows.push(["Net Ücret", moneySpaced(netFromGross.net)]);
      sections.push({
        id: "brutten-nete",
        title: "Brüt'ten Net'e Çeviri",
        headers: ["Kalem", "Tutar"],
        rows,
        lastRowTone: "green",
      });
    }

    if (grossFromNet.gross > 0) {
      const rows: string[][] = [
        ["Net Ücret", moneySpaced(grossFromNet.net)],
        ["SGK Primi (%14)", `+${moneySpaced(grossFromNet.sgk)}`],
        ["İşsizlik Primi (%1)", `+${moneySpaced(grossFromNet.issizlik)}`],
      ];
      if (grossFromNet.gelirVergisiIstisna > 0) {
        rows.push(
          ["Gelir Vergisi (Brüt)", `+${moneySpaced(grossFromNet.gelirVergisiBrut)}`],
          ["Asg. Üc. Gelir Vergi İstisnası", `-${moneySpaced(grossFromNet.gelirVergisiIstisna)}`],
          ["Net Gelir Vergisi", `+${moneySpaced(grossFromNet.gelirVergisi)}`],
        );
      } else {
        rows.push(["Gelir Vergisi", `+${moneySpaced(grossFromNet.gelirVergisi)}`]);
      }
      if (grossFromNet.damgaVergisiIstisna > 0) {
        rows.push(
          ["Damga Vergisi (Brüt)", `+${moneySpaced(grossFromNet.damgaVergisiBrut)}`],
          ["Asg. Üc. Damga Vergi İstisnası", `-${moneySpaced(grossFromNet.damgaVergisiIstisna)}`],
          ["Net Damga Vergisi", `+${moneySpaced(grossFromNet.damgaVergisi)}`],
        );
      } else {
        rows.push(["Damga Vergisi (binde 7,59)", `+${moneySpaced(grossFromNet.damgaVergisi)}`]);
      }
      rows.push(["Brüt Ücret", moneySpaced(grossFromNet.gross)]);
      sections.push({
        id: "netten-brute",
        title: "Net'ten Brüt'e Çeviri",
        headers: ["Kalem", "Tutar"],
        rows,
        lastRowTone: "green",
      });
    }

    return sections;
  }, [selectedYear, ciplakBrut, extraItems, totalBrut, netFromGross, grossFromNet]);

  const eklentiResult = eklentiFor
    ? computeEklentiResult(eklentiMonths[eklentiFor] ?? Array(12).fill(""))
    : 0;

  return (
    <div className={styles.page} aria-busy={caseLoading || undefined}>
      {caseLoading ? (
        <div className={styles.privacyBadge} role="status">
          Sunucu kaydı yükleniyor…
        </div>
      ) : null}
      {/* ── Hero ── */}
      <header className={styles.hero}>
        <div className={styles.heroMain}>
          <div className={styles.heroIcon} aria-hidden>
            <Scale size={22} />
          </div>
          <div>
            <h1 className={styles.title}>Davacı Ücreti Hesaplama</h1>
            <p className={styles.desc}>
              Çıplak brüt ücret ve ek kalemlerden giydirilmiş brüt oluşturun; brütten nete ve netten
              brüte çevirileri yıl bazlı vergi kurallarıyla anında hesaplayın.
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
          <div className={styles.heroActions}>
            <Button
              variant="soft"
              size="sm"
              className={tourStyles.howToBtn}
              onClick={() => tour.openTour(0)}
              aria-label="Nasıl kullanılır? Etkileşimli kılavuzu başlat"
            >
              <CirclePlay size={14} />
              Nasıl kullanılır?
            </Button>
            <Button
              variant="soft"
              size="sm"
              onClick={() => {
                void reloadCases();
                setShowRecordsModal(true);
              }}
            >
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

      {storageError ? (
        <div className={styles.storageBanner} role="alert">
          <p>{storageError}</p>
          <Button
            variant="soft"
            size="sm"
            onClick={() => {
              clearCorruptCases();
              setStorageError(null);
              reloadCases();
              toast.info("Bozuk lokal veri temizlendi");
            }}
          >
            Temizle ve devam et
          </Button>
        </div>
      ) : null}

      <div className={`${styles.layout} ${formSwap ? styles.formSwap : ""}`}>
        {/* ── Sol: form ── */}
        <div className={styles.formCol}>
          <section className={styles.card} style={{ animationDelay: "60ms" }}>
            <h2 className={styles.cardTitle}>Temel Bilgiler</h2>
            <div className={styles.basicGrid}>
              <div data-tour="davaci-ucreti-donem" className={styles.basicGrid} style={{ gridColumn: "1 / -1" }}>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Yıl</span>
                  <select
                    className={styles.select}
                    value={selectedYear}
                    onChange={(e) => {
                      const year = Number(e.target.value);
                      setSelectedYear(year);
                      if (!hasTwoPeriods(year)) setSelectedPeriod(2);
                    }}
                  >
                    {yearOptions.map((year) => (
                      <option key={year} value={year}>
                        {year}
                      </option>
                    ))}
                  </select>
                </label>

                {twoPeriods ? (
                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>Dönem</span>
                    <select
                      className={styles.select}
                      value={selectedPeriod}
                      onChange={(e) => setSelectedPeriod(Number(e.target.value) as Period)}
                    >
                      <option value={1}>Oca–Haz</option>
                      <option value={2}>Tem–Ara</option>
                    </select>
                  </label>
                ) : null}
              </div>

              <label className={`${styles.field} ${styles.fieldWide}`} data-tour="davaci-ucreti-ucret">
                <span className={styles.fieldLabel}>Çıplak Brüt (₺)</span>
                <div className={`${styles.inputWrap} ${asgariHatasi ? styles.inputWrapError : ""}`}>
                  <input
                    className={styles.input}
                    inputMode="decimal"
                    value={ciplakBrut}
                    onChange={(e) => setCiplakBrut(sanitizeMoneyTyping(e.target.value))}
                    placeholder="25.000,00"
                    aria-invalid={asgariHatasi ? true : undefined}
                  />
                  <span className={styles.currency} aria-hidden>
                    ₺
                  </span>
                </div>
                {asgariHatasi ? <p className={styles.errorText}>{asgariHatasi}</p> : null}
              </label>
            </div>
          </section>

          <section className={styles.card} style={{ animationDelay: "120ms" }} data-tour="davaci-ucreti-kalemler">
            <div className={styles.cardHead}>
              <h2 className={styles.cardTitle}>Ekstra Hesaplamalar</h2>
              <div className={styles.inlineActions}>
                <Button variant="soft" size="sm" onClick={openImportModal}>
                  <Download size={13} />
                  İçe Aktar
                </Button>
                <Button
                  variant="soft"
                  size="sm"
                  disabled={extraItems.length === 0}
                  onClick={() => setShowSetSaveModal(true)}
                >
                  <Save size={13} />
                  Kaydet
                </Button>
              </div>
            </div>

            <div className={styles.extraList}>
              {extraItems.map((item) => (
                <div
                  key={item.id}
                  className={`${styles.extraRow} ${removingIds.includes(item.id) ? styles.extraRowLeaving : ""}`}
                >
                  <input
                    className={styles.extraName}
                    value={item.name}
                    onChange={(e) => updateItem(item.id, { name: e.target.value })}
                    placeholder="Kalem"
                    aria-label="Kalem adı"
                  />
                  <div className={styles.inputWrap}>
                    <input
                      className={styles.input}
                      inputMode="decimal"
                      value={item.value}
                      onChange={(e) => updateItem(item.id, { value: sanitizeMoneyTyping(e.target.value) })}
                      placeholder="0,00"
                      aria-label={`${item.name || "Kalem"} tutarı`}
                    />
                    <span className={styles.currency} aria-hidden>
                      ₺
                    </span>
                  </div>
                  <button
                    type="button"
                    className={styles.eklentiBtn}
                    onClick={() => openEklenti(item.id)}
                    title="12 aylık eklenti hesabı"
                  >
                    <Calculator size={13} />
                    Eklenti
                  </button>
                  <button
                    type="button"
                    className={styles.removeBtn}
                    onClick={() => removeItem(item.id)}
                    aria-label={`${item.name || "Kalem"} sil`}
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
              <button type="button" className={styles.addRowBtn} onClick={addItem}>
                <Plus size={14} />
                Kalem ekle
              </button>
            </div>
          </section>

        </div>

        {/* ── Sağ: sonuçlar ── */}
        <div className={styles.resultCol}>
          <div className={`${styles.totalCard} ${saveFlash ? styles.totalCardSaved : ""}`} style={{ animationDelay: "100ms" }}>
            <span className={styles.totalLabel}>Giydirilmiş Brüt</span>
            <FlashValue className={styles.totalValue} value={`${fmtCurrency(totalBrut)} ₺`} />
            <span className={styles.totalMeta}>
              {selectedYear}
              {twoPeriods ? (selectedPeriod === 1 ? " · Oca–Haz" : " · Tem–Ara") : ""}
            </span>
          </div>

          <article className={styles.panel} style={{ animationDelay: "160ms" }}>
            <header className={styles.panelHead}>
              <h3>Brütten Nete</h3>
            </header>
            <div className={styles.panelBody}>
              <div className={styles.line}>
                <span>Brüt Ücret</span>
                <FlashValue value={totalBrut > 0 ? `${fmtCurrency(netFromGross.gross)} ₺` : "0,00 ₺"} />
              </div>
              {totalBrut > 0 ? (
                <div className={styles.resultReveal} key={`g2n-${selectedYear}-${selectedPeriod}`}>
                  <DeductionLines mode="gross-to-net" data={netFromGross} />
                  <div className={`${styles.line} ${styles.netLine}`}>
                    <span>Net Ücret</span>
                    <FlashValue value={`${fmtCurrency(netFromGross.net)} ₺`} />
                  </div>
                </div>
              ) : (
                <p className={styles.panelHint}>Çıplak brüt girildiğinde kesinti dökümü burada görünür.</p>
              )}
            </div>
          </article>

          <article className={styles.panel} style={{ animationDelay: "220ms" }}>
            <header className={styles.panelHead}>
              <h3>Netten Brüte</h3>
            </header>
            <div className={styles.panelBody}>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Net (₺)</span>
                <div className={styles.netInputRow}>
                  <div className={styles.inputWrap}>
                    <input
                      className={styles.input}
                      inputMode="decimal"
                      value={netForGross}
                      onChange={(e) => setNetForGross(sanitizeMoneyTyping(e.target.value))}
                      placeholder="18.000,00"
                    />
                    <span className={styles.currency} aria-hidden>
                      ₺
                    </span>
                  </div>
                  {netFromGross.net > 0 ? (
                    <Button variant="soft" size="sm" onClick={() => setNetForGross(fmtCurrency(netFromGross.net))}>
                      Net kullan
                    </Button>
                  ) : null}
                </div>
              </label>

              {grossFromNet.gross > 0 ? (
                <div className={styles.resultReveal} key={`n2g-${selectedYear}-${selectedPeriod}`}>
                  <div className={styles.line}>
                    <span>Net Ücret</span>
                    <FlashValue value={`${fmtCurrency(grossFromNet.net)} ₺`} />
                  </div>
                  <DeductionLines mode="net-to-gross" data={grossFromNet} />
                  <div className={`${styles.line} ${styles.netLine}`}>
                    <span>Brüt Ücret</span>
                    <FlashValue value={`${fmtCurrency(grossFromNet.gross)} ₺`} />
                  </div>
                </div>
              ) : (
                <p className={styles.panelHint}>Net tutar girildiğinde brüt karşılığı burada görünür.</p>
              )}
            </div>
          </article>

          <section className={styles.card} style={{ animationDelay: "180ms" }}>
            <h2 className={styles.cardTitle}>Notlar</h2>
            {NOTE_INFO_LINES.map((line) => (
              <p key={line} className={styles.noteInfo}>
                {line}
              </p>
            ))}
          </section>
        </div>
      </div>

      {/* ── Sticky işlem çubuğu ── */}
      <div
        className={`${styles.stickyBar} ${isDirty ? styles.stickyBarDirty : ""} ${saveFlash ? styles.stickyBarSaved : ""}`}
        data-tour="davaci-ucreti-kaydet-actions"
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
              disabled={caseSaving}
              className={saveFlash ? styles.saveBtnFlash : undefined}
            >
              <Save size={14} />
              {caseSaving ? "Kaydediliyor…" : currentRecordId ? "Güncelle" : "Kaydet"}
            </Button>
          </div>
        </div>
      </div>

      {/* ── Eklenti modalı ── */}
      {eklentiFor ? (
        <div className={styles.modalOverlay} role="presentation" onClick={() => setEklentiFor(null)}>
          <div
            className={`${styles.modalCard} ${styles.modalWide}`}
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className={styles.modalTitle}>Eklenti hesaplama</h2>
            <p className={styles.modalDesc}>Son 12 aylık bordro tutarlarını girin.</p>
            <div className={styles.monthGrid}>
              {(eklentiMonths[eklentiFor] ?? Array(12).fill("")).map((value, index) => (
                <label key={index} className={styles.monthField}>
                  <span>{index + 1}. ay</span>
                  <input
                    inputMode="decimal"
                    value={value}
                    onChange={(e) => {
                      const v = sanitizeMoneyTyping(e.target.value);
                      setEklentiMonths((prev) => ({
                        ...prev,
                        [eklentiFor]: (prev[eklentiFor] ?? Array(12).fill("")).map((m, i) =>
                          i === index ? v : m,
                        ),
                      }));
                    }}
                    placeholder="1.250,00"
                  />
                </label>
              ))}
            </div>
            <p className={styles.formulaText}>Formül: (aylık toplam / 360) × 30</p>
            <p className={styles.formulaResult}>
              Sonuç: <strong>{fmtCurrency(eklentiResult)} ₺</strong>
            </p>
            <div className={styles.modalActions}>
              <Button variant="soft" onClick={() => setEklentiFor(null)}>
                İptal
              </Button>
              <Button variant="primary" onClick={applyEklenti}>
                Uygula
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {/* ── İçe aktar modalı (backend setleri) ── */}
      {showImportModal ? (
        <div className={styles.modalOverlay} role="presentation" onClick={() => setShowImportModal(false)}>
          <div
            className={`${styles.modalCard} ${styles.modalWide}`}
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.importHead}>
              <h2 className={styles.modalTitle}>Kaydedilmiş setler</h2>
              <Button
                variant="ghost"
                size="sm"
                disabled={setsLoading}
                onClick={() => void reloadSets()}
                title="Listeyi yenile"
              >
                {setsLoading ? "Yükleniyor…" : "Yenile"}
              </Button>
            </div>

            {setsError ? (
              <div className={styles.legacyNotice} role="alert">
                <p>
                  {setsError}
                  {setsFromCache ? " Son bilinen liste geçici olarak gösteriliyor (yalnızca görüntüleme)." : ""}
                </p>
                <Button variant="soft" size="sm" disabled={setsLoading} onClick={() => void reloadSets()}>
                  <Download size={13} />
                  {setsLoading ? "Yükleniyor…" : "Tekrar dene"}
                </Button>
              </div>
            ) : null}

            {setsLoading && savedSets.length === 0 ? (
              <p className={styles.emptyText}>Setler yükleniyor…</p>
            ) : savedSets.length === 0 && !setsError ? (
              <p className={styles.emptyText}>
                Kaydedilmiş set yok. Ekstra Hesaplamalar bölümündeki “Kaydet” ile mevcut kalemleri
                saklayabilirsiniz.
              </p>
            ) : savedSets.length > 0 ? (
              <ul className={styles.setList}>
                {savedSets.map((set) => (
                  <li key={set.id} className={styles.setRow}>
                    <div className={styles.setInfo}>
                      <strong>{set.name}</strong>
                      <span>{set.data.length} kalem</span>
                    </div>
                    <div className={styles.inlineActions}>
                      <Button variant="soft" size="sm" onClick={() => handleImportSet(set)}>
                        İçe Aktar
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        disabled={setsDeleting || (!!setsError && setsFromCache)}
                        onClick={() => setDeleteSetTarget(set)}
                        title={
                          setsError && setsFromCache
                            ? "Çevrimdışıyken silme yapılamaz"
                            : "Seti sil"
                        }
                      >
                        <Trash2 size={13} />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : null}

            <div className={styles.modalActions}>
              <Button variant="soft" onClick={() => setShowImportModal(false)}>
                Kapat
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {/* ── Kayıtlar modalı ── */}
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
                        {fmtCurrency(c.results.totalBrut)} ₺ brüt ·{" "}
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
        contentId="davaci-word-copy"
        onClose={() => setShowPreview(false)}
      />

      {/* ── İsim modalları ── */}
      <NameModal
        open={showSetSaveModal}
        title="Ekstra Hesaplamaları Kaydet"
        description="Aynı isimde kayıt varsa güncellenir. Set büro hesaplarınızda saklanır."
        placeholder="Set adı"
        confirmLabel="Kaydet"
        loadingLabel="Kaydediliyor…"
        loading={setsSaving}
        onClose={() => {
          if (!setsSaving) setShowSetSaveModal(false);
        }}
        onSave={(name) => {
          void handleSaveSet(name);
        }}
      />
      <NameModal
        open={showCaseSaveModal}
        title="Hesaplamayı Kaydet"
        description="Kaydedilen hesaplamalarınızda görünecek bir isim girin."
        placeholder="Örn: Hesaplama adı"
        confirmLabel="Kaydet"
        loadingLabel="Kaydediliyor…"
        loading={caseSaving}
        initialValue={currentRecordName ?? ""}
        onClose={() => {
          if (!caseSaving) setShowCaseSaveModal(false);
        }}
        onSave={(name) => {
          void persistCase(name);
        }}
      />

      {/* ── Onay modalları ── */}
      <ConfirmDialog
        open={deleteSetTarget !== null}
        title="Seti sil"
        description={`“${deleteSetTarget?.name ?? ""}” seti silinecek. Bu işlem büro hesabındaki kaydı kaldırır ve geri alınamaz.`}
        confirmLabel="Sil"
        danger
        loading={setsDeleting}
        onConfirm={() => {
          void confirmDeleteSet();
        }}
        onCancel={() => {
          if (!setsDeleting) setDeleteSetTarget(null);
        }}
      />
      <ConfirmDialog
        open={deleteCaseTarget !== null}
        title="Kaydı sil"
        description={`“${deleteCaseTarget?.name ?? ""}” kaydı silinecek. Bu işlem geri alınamaz.`}
        confirmLabel="Sil"
        danger
        onConfirm={() => {
          void confirmDeleteCase();
        }}
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
        definition={DAVACI_UCRETI_TOUR}
        active={tour.active}
        onActiveChange={tour.setActive}
        welcomeOpen={tour.welcomeOpen}
        onWelcomeOpenChange={tour.setWelcomeOpen}
        welcomeTitle={DAVACI_UCRETI_TOUR_WELCOME_TITLE}
        welcomeBody={DAVACI_UCRETI_TOUR_WELCOME_BODY}
        welcomeStartLabel="Başlat"
        welcomeLaterLabel="Kendim devam edeceğim"
        initialStepIndex={tour.resumeStepIndex}
        onCollectingComplete={() => {
          tour.completeTour();
          toast.info("Kılavuz tamamlandı. Hesaplamanızı önizleyebilir veya kaydedebilirsiniz.");
        }}
        paused={
          showPreview ||
          showRecordsModal ||
          showCaseSaveModal ||
          showSetSaveModal ||
          showImportModal ||
          !!eklentiFor
        }
      />
    </div>
  );
}
