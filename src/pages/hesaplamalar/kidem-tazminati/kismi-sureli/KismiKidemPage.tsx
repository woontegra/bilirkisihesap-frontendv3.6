/**
 * Kıdem Tazminatı — Kısmi Süreli / Part Time — %100 izole sayfa.
 * SSK 360 günlük sistemi tamamen lokal olarak (backend'e istek atmadan)
 * aktuerya-backend/src/services/kidemKismiSureli.service.js formülleriyle uygulanır.
 * Network yalnızca ekstra hesaplama seti CRUD'u için kullanılır (V3 sözleşmesi).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  Calculator,
  CirclePlay,
  Clock,
  Download,
  FilePlus2,
  FolderOpen,
  Eye,
  Plus,
  Save,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { ApiError } from "@/api/client";
import { getSavedCase } from "@/api/savedCases";
import { CalculationPreviewModal, type PreviewSection } from "@/components/calculation-preview";
import { GuidedTourHost, useGuidedTourController } from "@/components/guided-tour";
import { trackUsageEvent } from "@/telemetry/trackUsageEvent";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { useToast } from "@/context/ToastContext";
import {
  mapKismiFormFromBackend,
  resolveSavedCaseDisplayName,
  kismiCaseCrud,
  buildKismiSaveResult,
  mapKismiRecordToSavedCase,
  KIDEM_KISMI_SURELI_TYPE,
} from "./backendCase";
import { listKidemSavedCases } from "../shared/listKidemCases";
import { formatKidemMoneyFields } from "../shared/formatKidemMoneyFields";
import {
  calculateKismiKidem,
  calculatePeriodDays,
  calculateTotalBrut,
  computeEklentiResult,
  convertDaysToYilAyGun,
  deriveBrutNet,
  earliestPeriodStart,
  fmtCurrency,
  formatYilAyGun,
  latestPeriodEnd,
  parseNum,
  sanitizeIntTyping,
  sanitizeMoneyTyping,
  sumPeriodsDays,
} from "./engine";
import { deriveAsgariUcretError } from "./asgariUcret";
import {
  describeSetsError,
  listExtraSets,
  removeExtraSet,
  upsertExtraSet,
  type ExtraSetItem,
  type SavedExtraSet,
} from "./extraSetsApi";
import { emptyForm, emptyPeriod, newLocalId, type ExtraItem, type KismiFormSnapshot, type SavedCase, type WorkPeriod } from "./model";
import { clearCorruptCases, deleteCase, loadCasesSafe } from "./storage";
import { KIDEM_KISMI_TOUR } from "./guidedTour";
import styles from "./KismiKidemPage.module.css";
import tourStyles from "@/components/guided-tour/GuidedTour.module.css";

const PAGE_TITLE = "Kıdem Tazminatı — Kısmi Süreli / Part Time";
const NOTE_INFO =
  "Çalışma süresi 360 günlük yıla göre yıl/ay/gün'e çevrilir; günlük pay brüt ücretin 360'a bölünmesiyle bulunur. Net tutar, brüt tazminattan yalnızca binde 7,59 oranında damga vergisi düşülerek hesaplanır.";

/* Sabit ekstra satırları (V3 KidemTazminatiForm sırası ve id/ad eşlemesi) */
type FixedFieldKey = "prim" | "ikramiye" | "yol" | "yemek" | "diger";

const FIXED_FIELDS: { key: FixedFieldKey; label: string; placeholder: string }[] = [
  { key: "prim", label: "Prim", placeholder: "Örn: 2.500,00" },
  { key: "ikramiye", label: "İkramiye", placeholder: "Örn: 1.000,00" },
  { key: "yol", label: "Yol", placeholder: "Örn: 500,00" },
  { key: "yemek", label: "Yemek", placeholder: "Örn: 1.200,00" },
  { key: "diger", label: "Diğer", placeholder: "Örn: 1.000,00" },
];

const FIXED_FIELD_IDS: string[] = FIXED_FIELDS.map((f) => f.key);

/* Eklenti hedefi: sabit alan veya dinamik kalem */
type EklentiTarget = { kind: "fixed"; field: FixedFieldKey } | { kind: "extra"; id: string };

const eklentiKeyOf = (t: EklentiTarget) => (t.kind === "fixed" ? `fixed:${t.field}` : `extra:${t.id}`);

/** 12 aylık eklenti girişi için boş ay dizisi. */
const emptyMonths = (): string[] => Array.from({ length: 12 }, () => "");

function isoToTR(iso: string): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}.${m}.${y}`;
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
      <div className={styles.modalCard} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
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
          <Button variant="primary" disabled={!value.trim() || loading} onClick={() => onSave(value.trim())}>
            {loading ? loadingLabel || "Kaydediliyor…" : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

type PendingAction = { kind: "new" } | { kind: "open"; caseId: string } | null;

export default function KismiKidemPage() {
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const caseIdParam = searchParams.get("caseId");
  const tour = useGuidedTourController();

  const [form, setForm] = useState<KismiFormSnapshot>(emptyForm);
  const [currentRecordId, setCurrentRecordId] = useState<string | null>(null);
  const [currentRecordName, setCurrentRecordName] = useState<string | null>(null);
  const [savedCases, setSavedCases] = useState<SavedCase[]>([]);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [caseLoading, setCaseLoading] = useState(false);
  const [caseSaving, setCaseSaving] = useState(false);
  const backendLoadedCaseIdRef = useRef<string | null>(null);

  /* set state — asıl kaynak backend (yalnızca set CRUD; hesap lokaldir) */
  const [savedSets, setSavedSets] = useState<SavedExtraSet[]>([]);
  const [setsLoading, setSetsLoading] = useState(false);
  const [setsSaving, setSetsSaving] = useState(false);
  const [setsDeleting, setSetsDeleting] = useState(false);
  const [setsError, setSetsError] = useState<string | null>(null);

  const [removingPeriodIds, setRemovingPeriodIds] = useState<string[]>([]);
  const [removingExtraIds, setRemovingExtraIds] = useState<string[]>([]);
  const [eklentiTarget, setEklentiTarget] = useState<EklentiTarget | null>(null);
  const [eklentiTitle, setEklentiTitle] = useState("Eklenti Hesapla");
  const [eklentiMonths, setEklentiMonths] = useState<Record<string, string[]>>({});
  const [showImportModal, setShowImportModal] = useState(false);
  const [showSetSaveModal, setShowSetSaveModal] = useState(false);
  const [showRecordsModal, setShowRecordsModal] = useState(false);
  const [showCaseSaveModal, setShowCaseSaveModal] = useState(false);
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

  const snapshotKey = (s: KismiFormSnapshot) =>
    JSON.stringify({
      ...s,
      periods: s.periods.map((p) => [p.start, p.end, p.days]),
      extras: s.extras.map((i) => [i.name, i.value]),
    });

  const reloadCases = useCallback(async () => {
    try {
      const items = await listKidemSavedCases(KIDEM_KISMI_SURELI_TYPE, mapKismiRecordToSavedCase);
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
  }, []);

  /** Set listesini backend'den yeniler; hata durumunda sayfa çalışmaya devam eder. */
  const reloadSets = useCallback(async () => {
    setSetsLoading(true);
    setSetsError(null);
    try {
      const sets = await listExtraSets();
      setSavedSets(sets);
    } catch (error) {
      setSetsError(describeSetsError(error));
    } finally {
      setSetsLoading(false);
    }
  }, []);

  useEffect(() => {
    void reloadCases();
    setBaseline(snapshotKey(emptyForm()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isDirty = useMemo(() => snapshotKey(form) !== baseline, [form, baseline]);

  /* ── Dönemler / gün hesabı ── */
  const calculatedTotalDays = useMemo(() => sumPeriodsDays(form.periods), [form.periods]);

  const effectiveTotalDays = useMemo(() => {
    if (form.isManualOverride) {
      const n = parseInt(form.totalDaysManual.replace(/[^\d]/g, ""), 10);
      return Number.isFinite(n) && n >= 0 ? n : calculatedTotalDays;
    }
    return calculatedTotalDays;
  }, [form.isManualOverride, form.totalDaysManual, calculatedTotalDays]);

  const { yil, ay, gun } = useMemo(() => convertDaysToYilAyGun(effectiveTotalDays), [effectiveTotalDays]);

  const iseGiris = useMemo(() => earliestPeriodStart(form.periods), [form.periods]);
  const istenCikis = useMemo(
    () => form.exitDateOverride || latestPeriodEnd(form.periods),
    [form.exitDateOverride, form.periods],
  );

  const toplamBrutUcret = useMemo(
    () => calculateTotalBrut(form.ciplakBrut, form.prim, form.ikramiye, form.yemek, form.yol, form.diger, form.extras),
    [form.ciplakBrut, form.prim, form.ikramiye, form.yemek, form.yol, form.diger, form.extras],
  );

  const kismiResult = useMemo(
    () => calculateKismiKidem(toplamBrutUcret, yil, ay, gun, istenCikis || undefined),
    [toplamBrutUcret, yil, ay, gun, istenCikis],
  );

  const brutNet = useMemo(() => deriveBrutNet(kismiResult.toplamTutar), [kismiResult.toplamTutar]);

  const startedRef = useRef(false);
  const completedFingerprintRef = useRef<string | null>(null);

  const markKidemStarted = useCallback(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    trackUsageEvent({
      eventType: "CALCULATION_STARTED",
      moduleKey: KIDEM_KISMI_SURELI_TYPE,
      route: "/kidem-tazminati/kismi-sureli",
      dedupeKey: "started:kidem_kismi_sureli",
    });
  }, []);

  useEffect(() => {
    const valid = kismiResult.toplamTutar > 0 || brutNet.net > 0;
    if (!valid) return;
    const fingerprint = snapshotKey(form);
    if (completedFingerprintRef.current === fingerprint) return;
    completedFingerprintRef.current = fingerprint;
    trackUsageEvent({
      eventType: "CALCULATION_COMPLETED",
      moduleKey: KIDEM_KISMI_SURELI_TYPE,
      route: "/kidem-tazminati/kismi-sureli",
    });
  }, [kismiResult.toplamTutar, brutNet.net, form]);

  const totalDaysWarning = effectiveTotalDays > 0 && effectiveTotalDays < 360;

  /* Asgari ücret kontrolü: çıkış tarihi = dönemlerin en geç bitişi (bilgilendirme, hesabı engellemez) */
  const asgariHatasi = useMemo(
    () => deriveAsgariUcretError(form.ciplakBrut, latestPeriodEnd(form.periods)),
    [form.ciplakBrut, form.periods],
  );

  /* ── Form işlemleri ── */
  const triggerFormSwap = () => {
    setFormSwap(true);
    window.setTimeout(() => setFormSwap(false), 480);
  };

  const resetFormFields = useCallback(() => {
    setForm(emptyForm());
    setCurrentRecordId(null);
    setCurrentRecordName(null);
    setBaseline(snapshotKey(emptyForm()));
    setEklentiMonths({});
  }, []);

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
      const nextForm: KismiFormSnapshot = formatKidemMoneyFields({
        ...emptyForm(),
        ...c.form,
        periods: (c.form.periods ?? []).map((p) => ({
          id: p.id || newLocalId(),
          start: p.start,
          end: p.end,
          days: p.days,
        })),
        extras: (c.form.extras ?? []).map((i) => ({
          id: i.id || newLocalId(),
          name: i.name,
          value: i.value,
        })),
      });
      if (nextForm.periods.length === 0) nextForm.periods = [emptyPeriod()];
      setForm(nextForm);
      setCurrentRecordId(c.id);
      setCurrentRecordName(c.name);
      setBaseline(snapshotKey(nextForm));
      setShowRecordsModal(false);
      triggerFormSwap();
      toast.success("Kayıt yüklendi");
    },
    [clearCaseIdParam, setCaseIdParam, toast],
  );

  const applyBackendForm = useCallback((nextForm: KismiFormSnapshot, recordId: string, recordName: string) => {
    setForm(nextForm);
    setCurrentRecordId(recordId);
    setCurrentRecordName(recordName);
    setEklentiMonths({});
    setBaseline(snapshotKey(nextForm));
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
        const mapped = mapKismiFormFromBackend(record.data);
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

  /* ── Dönem işlemleri ── */
  const updatePeriod = (id: string, field: "start" | "end" | "days", value: string) => {
    setForm((p) => ({
      ...p,
      periods: p.periods.map((row) => {
        if (row.id !== id) return row;
        if (field === "days") {
          const n = parseInt(value, 10);
          return { ...row, days: Number.isFinite(n) && n >= 0 ? n : 0 };
        }
        const next: WorkPeriod = { ...row, [field]: value };
        next.days = next.start && next.end ? calculatePeriodDays(next.start, next.end) : 0;
        return next;
      }),
      ...(field === "start" || field === "end" ? { isManualOverride: false } : {}),
    }));
  };

  const addPeriod = () => {
    setForm((p) => ({ ...p, periods: [...p.periods, emptyPeriod()] }));
  };

  const removePeriod = (id: string) => {
    if (form.periods.length <= 1) return;
    setRemovingPeriodIds((prev) => [...prev, id]);
    window.setTimeout(() => {
      setForm((p) => ({ ...p, periods: p.periods.filter((row) => row.id !== id) }));
      setRemovingPeriodIds((prev) => prev.filter((x) => x !== id));
    }, 220);
  };

  /* ── Ücret alanı / kalem işlemleri ── */
  const setFixedField = (key: FixedFieldKey, value: string) => {
    setForm((p) => {
      const next = { ...p };
      next[key] = value;
      return next;
    });
  };

  const updateExtra = (id: string, patch: Partial<ExtraItem>) => {
    setForm((p) => ({ ...p, extras: p.extras.map((row) => (row.id === id ? { ...row, ...patch } : row)) }));
  };

  const removeExtra = (id: string) => {
    setRemovingExtraIds((prev) => [...prev, id]);
    window.setTimeout(() => {
      setForm((p) => ({ ...p, extras: p.extras.filter((row) => row.id !== id) }));
      setRemovingExtraIds((prev) => prev.filter((x) => x !== id));
    }, 220);
  };

  const addExtra = () => {
    setForm((p) => ({ ...p, extras: [...p.extras, { id: newLocalId(), name: "", value: "" }] }));
  };

  /* ── Eklenti (12 aylık) modalı ── */
  const openEklenti = (target: EklentiTarget, title: string) => {
    const key = eklentiKeyOf(target);
    setEklentiTitle(title);
    setEklentiMonths((prev) => (prev[key] ? prev : { ...prev, [key]: emptyMonths() }));
    setEklentiTarget(target);
  };

  const applyEklenti = () => {
    if (!eklentiTarget) return;
    const key = eklentiKeyOf(eklentiTarget);
    const months = eklentiMonths[key] ?? emptyMonths();
    const value = computeEklentiResult(months) || 0;
    const formatted = value.toFixed(2).replace(".", ",");
    if (eklentiTarget.kind === "fixed") {
      setFixedField(eklentiTarget.field, formatted);
    } else {
      updateExtra(eklentiTarget.id, { value: formatted });
    }
    setEklentiTarget(null);
  };

  const eklentiKey = eklentiTarget ? eklentiKeyOf(eklentiTarget) : null;
  const eklentiResult = eklentiKey ? computeEklentiResult(eklentiMonths[eklentiKey] ?? emptyMonths()) : 0;

  /* ── Ekstra hesaplama setleri (V3 sözleşmesi; yalnızca set CRUD network kullanır) ── */
  const hasAnyExtraData = useMemo(
    () => form.extras.length > 0 || FIXED_FIELDS.some((f) => form[f.key].trim() !== ""),
    [form],
  );

  const openImportModal = () => {
    setShowImportModal(true);
    void reloadSets();
  };

  /** V3 kalem eşlemesi: prim→"Prim", ikramiye→"İkramiye", yol→"Yol", yemek→"Yemek", diger→"Diğer" + ek kalemler. */
  const buildSetItems = (): ExtraSetItem[] => {
    const items: ExtraSetItem[] = [];
    for (const f of FIXED_FIELDS) {
      const v = form[f.key].trim();
      if (v) items.push({ id: f.key, name: f.label, value: v });
    }
    form.extras.forEach((item) => {
      if (item.value.trim()) items.push({ id: item.id, name: item.name, value: item.value.trim() });
    });
    return items;
  };

  const handleSaveSet = async (name: string) => {
    const items = buildSetItems();
    if (items.length === 0) {
      toast.error("Kaydedilecek ekstra hesaplama bulunamadı");
      return;
    }
    setSetsSaving(true);
    try {
      await upsertExtraSet(name, items);
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
    setForm((p) => {
      const next = { ...p };
      for (const f of FIXED_FIELDS) {
        const item = set.data.find((x) => x.id === f.key);
        if (item?.value) next[f.key] = item.value;
      }
      next.extras = set.data
        .filter((x) => !FIXED_FIELD_IDS.includes(x.id))
        .map((x) => ({ id: x.id || newLocalId(), name: x.name, value: x.value }));
      return next;
    });
    setShowImportModal(false);
    toast.success("Ekstra hesaplamalar yüklendi");
  };

  const confirmDeleteSet = async () => {
    if (!deleteSetTarget) return;
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

  /* ── Kayıt işlemleri — backend saved-cases ── */
  const persistCase = async (name: string) => {
    if (kismiResult.toplamTutar <= 0 && brutNet.net <= 0) {
      toast.error("Önce geçerli bir hesaplama yapın");
      return;
    }
    setCaseSaving(true);
    const wasUpdate = !!(currentRecordId && /^\d+$/.test(currentRecordId));
    try {
      const record = await kismiCaseCrud.saveCase(
        name,
        form,
        buildKismiSaveResult(kismiResult.toplamTutar, brutNet.net),
        currentRecordId,
      );
      const recordId = String(record.id);
      setCurrentRecordId(recordId);
      setCurrentRecordName(resolveSavedCaseDisplayName(record));
      setBaseline(snapshotKey(form));
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
        await kismiCaseCrud.removeCase(targetId);
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

  /* ── Escape ile modal kapatma (öncelik: en üstteki) ── */
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (eklentiTarget) setEklentiTarget(null);
      else if (deleteSetTarget) {
        if (!setsDeleting) setDeleteSetTarget(null);
      } else if (deleteCaseTarget) setDeleteCaseTarget(null);
      else if (discardOpen) {
        setDiscardOpen(false);
        setPendingAction(null);
      } else if (showSetSaveModal) {
        if (!setsSaving) setShowSetSaveModal(false);
      } else if (showImportModal) setShowImportModal(false);
      else if (showCaseSaveModal) setShowCaseSaveModal(false);
      else if (showPreview) setShowPreview(false);
      else if (showRecordsModal) setShowRecordsModal(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    eklentiTarget,
    deleteSetTarget,
    setsDeleting,
    deleteCaseTarget,
    discardOpen,
    showSetSaveModal,
    setsSaving,
    showImportModal,
    showCaseSaveModal,
    showPreview,
    showRecordsModal,
  ]);

  /* ── Önizleme bölümleri (V3 başlık ve satır düzeni; %100 lokal üretim) ── */
  const previewSections = useMemo((): PreviewSection[] => {
    const money = (v: number) => `${fmtCurrency(v)} ₺`;
    const sections: PreviewSection[] = [];

    sections.push({
      id: "ust",
      title: "Tarih Bilgileri",
      headers: ["İşe Giriş", "İşten Çıkış", "Çalışma Süresi"],
      rows: [[isoToTR(iseGiris), isoToTR(istenCikis), formatYilAyGun({ yil, ay, gun })]],
    });

    const compRows: string[][] = [
      ["Çıplak Brüt", money(parseNum(form.ciplakBrut))],
      ["Prim", money(parseNum(form.prim))],
      ["İkramiye", money(parseNum(form.ikramiye))],
      ["Yemek", money(parseNum(form.yemek))],
    ];
    if (parseNum(form.yol) > 0) compRows.push(["Yol", money(parseNum(form.yol))]);
    if (parseNum(form.diger) > 0) compRows.push(["Diğer", money(parseNum(form.diger))]);
    form.extras.forEach((i, idx) => {
      if (parseNum(i.value) > 0) compRows.push([i.name || `Ek Kalem ${idx + 1}`, money(parseNum(i.value))]);
    });
    compRows.push(["Toplam Brüt", money(toplamBrutUcret)]);
    sections.push({ id: "bilesen", title: "Ücret bileşenleri", headers: ["Kalem", "Tutar"], rows: compRows, lastRowTone: "blue" });

    if (kismiResult.warnings.length > 0) {
      sections.push({
        id: "uyari",
        title: "Uyarılar",
        headers: ["Uyarı"],
        rows: kismiResult.warnings.map((w) => [w]),
      });
    }

    const hesapRows: string[][] = [];
    if (yil > 0) hesapRows.push([`${fmtCurrency(kismiResult.yilBrut)} × ${yil} yıl`, money(kismiResult.yilTutar)]);
    if (ay > 0) hesapRows.push([`${fmtCurrency(kismiResult.yilBrut)} / 12 × ${ay} ay`, money(kismiResult.ayTutar)]);
    if (gun > 0) hesapRows.push([`${fmtCurrency(kismiResult.yilBrut)} / 360 × ${gun} gün`, money(kismiResult.gunTutar)]);
    hesapRows.push(["Toplam Brüt Kıdem Tazminatı", money(kismiResult.toplamTutar)]);
    sections.push({ id: "hesap", title: "Kıdem Tazminatı Hesaplaması", headers: ["Hesap", "Tutar"], rows: hesapRows, lastRowTone: "blue" });

    const netRows: string[][] = [
      ["Brüt Kıdem Tazminatı", money(brutNet.brut)],
      ["Damga Vergisi (Binde 7,59)", `-${money(brutNet.damgaVergisi)}`],
      ["Toplam Net Kıdem Tazminatı", money(brutNet.net)],
    ];
    sections.push({ id: "net", title: "Brüt'ten Net'e", headers: ["Kalem", "Tutar"], rows: netRows, lastRowTone: "green" });

    return sections;
  }, [form, iseGiris, istenCikis, yil, ay, gun, toplamBrutUcret, kismiResult, brutNet]);

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
            <Clock size={22} />
          </div>
          <div>
            <h1 className={styles.title}>Kıdem Tazminatı — Kısmi Süreli / Part Time</h1>
            <p className={styles.desc}>
              SSK 360 günlük sistemine göre birden fazla çalışma dönemi toplanır; kıdem tazminatı tavanı çıkış tarihine
              göre otomatik uygulanır.
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

      {storageError ? (
        <div className={styles.storageBanner} role="alert">
          <p>{storageError}</p>
          <Button
            variant="soft"
            size="sm"
            onClick={() => {
              clearCorruptCases();
              setStorageError(null);
              void reloadCases();
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
          <section className={styles.card} style={{ animationDelay: "60ms" }} data-tour="kismi-donemler">
            <h2 className={styles.cardTitle}>Çalışma dönemleri</h2>
            <p className={styles.cardHint}>
              Her dönem için başlangıç ve bitiş tarihlerini girin; gün sayısı SSK 360 gün kuralına göre hesaplanır, istenirse elle düzenlenebilir.
            </p>
            <div className={styles.periodList}>
              {form.periods.map((period) => (
                <div
                  key={period.id}
                  className={`${styles.periodRow} ${removingPeriodIds.includes(period.id) ? styles.periodRowLeaving : ""}`}
                >
                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>Başlangıç</span>
                    <input
                      type="date"
                      max="9999-12-31"
                      value={period.start}
                      onChange={(e) => {
                        markKidemStarted();
                        updatePeriod(period.id, "start", e.target.value);
                      }}
                      className={styles.dateInput}
                    />
                  </label>
                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>Bitiş</span>
                    <input
                      type="date"
                      max="9999-12-31"
                      value={period.end}
                      onChange={(e) => {
                        markKidemStarted();
                        updatePeriod(period.id, "end", e.target.value);
                      }}
                      className={styles.dateInput}
                    />
                  </label>
                  <label className={styles.periodDaysField}>
                    <span className={styles.fieldLabel}>Gün</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      className={styles.periodDaysInput}
                      value={period.days ? String(period.days) : ""}
                      onChange={(e) => {
                        markKidemStarted();
                        updatePeriod(period.id, "days", e.target.value);
                      }}
                    />
                  </label>
                  <button
                    type="button"
                    className={styles.removeBtn}
                    onClick={() => removePeriod(period.id)}
                    disabled={form.periods.length <= 1}
                    aria-label="Dönemi sil"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              <button type="button" className={styles.addRowBtn} onClick={addPeriod}>
                <Plus size={14} />
                Dönem ekle
              </button>
            </div>

            <div className={styles.totalDaysRow}>
              <span className={styles.totalDaysLabel}>Hesaplanan toplam gün</span>
              <span className={styles.totalDaysValue}>{calculatedTotalDays} gün</span>
            </div>

            <label className={styles.field} style={{ marginTop: "0.6rem" }}>
              <span className={styles.fieldLabel}>Toplam çalışma günü (isteğe bağlı)</span>
              <input
                type="text"
                inputMode="numeric"
                value={form.totalDaysManual}
                onChange={(e) =>
                  setForm((p) => ({ ...p, totalDaysManual: sanitizeIntTyping(e.target.value), isManualOverride: true }))
                }
                onBlur={() => {
                  if (!form.totalDaysManual.trim()) setForm((p) => ({ ...p, isManualOverride: false }));
                }}
                placeholder={calculatedTotalDays > 0 ? String(calculatedTotalDays) : "0"}
                className={styles.textInput}
              />
            </label>
            <p className={styles.hintText}>Boş bırakılırsa dönemlerden hesaplanan toplam kullanılır.</p>

            <label className={styles.field} style={{ marginTop: "0.6rem" }}>
              <span className={styles.fieldLabel}>Çıkış tarihi geçersiz kılma (tavan tespiti için, opsiyonel)</span>
              <input
                type="date"
                max="9999-12-31"
                value={form.exitDateOverride}
                onChange={(e) => setForm((p) => ({ ...p, exitDateOverride: e.target.value }))}
                className={styles.dateInput}
              />
            </label>
            <p className={styles.hintText}>
              Boş bırakılırsa dönemlerdeki en son bitiş tarihi kullanılır (tavan tutarı bu tarihe göre belirlenir).
            </p>
          </section>

          <section className={styles.card} style={{ animationDelay: "120ms" }}>
            <h2 className={styles.cardTitle}>Ücret bilgileri</h2>
            <p className={styles.cardHint}>Aylık giydirilmiş brüt ve ek ödemeler.</p>

            <label className={styles.field} data-tour="kismi-ciplak-brut">
              <span className={styles.fieldLabel}>Çıplak Brüt Ücret (₺)</span>
              <div className={`${styles.inputWrap} ${asgariHatasi ? styles.inputWrapError : ""}`}>
                <input
                  className={styles.input}
                  inputMode="decimal"
                  value={form.ciplakBrut}
                  onChange={(e) => {
                    markKidemStarted();
                    setForm((p) => ({ ...p, ciplakBrut: sanitizeMoneyTyping(e.target.value) }));
                  }}
                  placeholder="Örn: 25.000,00"
                  aria-invalid={asgariHatasi ? true : undefined}
                />
                <span className={styles.currency} aria-hidden>₺</span>
              </div>
              {asgariHatasi ? <p className={styles.errorText}>{asgariHatasi}</p> : null}
            </label>

            {/* Ekstra Hesaplamalar — V3 KidemTazminatiForm paritesi */}
            <div data-tour="kismi-ekstra">
            <div className={styles.cardHead} style={{ marginTop: "0.95rem" }}>
              <h3 className={styles.subTitle}>Ekstra Hesaplamalar</h3>
              <div className={styles.inlineActions}>
                <Button variant="soft" size="sm" onClick={openImportModal}>
                  <Download size={13} />
                  İçe Aktar
                </Button>
                <Button variant="soft" size="sm" disabled={!hasAnyExtraData} onClick={() => setShowSetSaveModal(true)}>
                  <Save size={13} />
                  Kaydet
                </Button>
              </div>
            </div>
            <p className={styles.subHint}>Ekstra Hesaplamalar (Prim, İkramiye, Yemek vb.)</p>

            <div className={styles.extraList}>
              {FIXED_FIELDS.map((f) => (
                <div key={f.key} className={styles.fixedRow}>
                  <input disabled value={f.label} className={styles.rowLabel} aria-label={`${f.label} kalemi`} />
                  <div className={styles.inputWrap}>
                    <input
                      className={styles.input}
                      inputMode="decimal"
                      value={form[f.key]}
                      onChange={(e) => setFixedField(f.key, sanitizeMoneyTyping(e.target.value))}
                      placeholder={f.placeholder}
                      aria-label={`${f.label} tutarı`}
                    />
                    <span className={styles.currency} aria-hidden>₺</span>
                  </div>
                  <button
                    type="button"
                    className={styles.eklentiBtn}
                    onClick={() => openEklenti({ kind: "fixed", field: f.key }, `${f.label} için eklenti hesapla`)}
                    title="Son 12 ayın değerlerini girerek aylık ortalama tutarı otomatik hesaplayın"
                  >
                    <Calculator size={13} />
                    Eklenti Hesapla
                  </button>
                  <button
                    type="button"
                    className={styles.removeBtn}
                    onClick={() => setFixedField(f.key, "")}
                    aria-label={`${f.label} temizle`}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}

              {form.extras.map((item) => (
                <div key={item.id} className={`${styles.extraRow} ${removingExtraIds.includes(item.id) ? styles.extraRowLeaving : ""}`}>
                  <input
                    className={styles.extraName}
                    value={item.name}
                    onChange={(e) => updateExtra(item.id, { name: e.target.value })}
                    placeholder="Kalem"
                    aria-label="Kalem adı"
                  />
                  <div className={styles.inputWrap}>
                    <input
                      className={styles.input}
                      inputMode="decimal"
                      value={item.value}
                      onChange={(e) => updateExtra(item.id, { value: sanitizeMoneyTyping(e.target.value) })}
                      placeholder="Örn: 1.000,00"
                      aria-label={`${item.name || "Kalem"} tutarı`}
                    />
                    <span className={styles.currency} aria-hidden>₺</span>
                  </div>
                  <button
                    type="button"
                    className={styles.eklentiBtn}
                    onClick={() => openEklenti({ kind: "extra", id: item.id }, "Eklenti Hesapla")}
                    title="Son 12 ayın değerlerini girerek aylık ortalama tutarı otomatik hesaplayın"
                  >
                    <Calculator size={13} />
                    Eklenti Hesapla
                  </button>
                  <button type="button" className={styles.removeBtn} onClick={() => removeExtra(item.id)} aria-label="Satırı sil">
                    <X size={14} />
                  </button>
                </div>
              ))}
              <button type="button" className={styles.addRowBtn} onClick={addExtra}>
                <Plus size={14} />
                Kalem ekle
              </button>
            </div>
            </div>
          </section>

        </div>

        {/* ── Sağ: sonuçlar ── */}
        <div className={styles.resultCol}>
          <div className={`${styles.totalCard} ${saveFlash ? styles.totalCardSaved : ""}`} style={{ animationDelay: "100ms" }}>
            <span className={styles.totalLabel}>Brüt Kıdem Tazminatı</span>
            <FlashValue className={styles.totalValue} value={`${fmtCurrency(kismiResult.toplamTutar)} ₺`} />
            <span className={styles.totalMeta}>
              Süre: {formatYilAyGun({ yil, ay, gun })} ({effectiveTotalDays} gün{form.isManualOverride ? ", manuel" : ""})
            </span>
          </div>

          {kismiResult.warnings.length > 0 || totalDaysWarning ? (
            <article className={styles.panel} style={{ animationDelay: "150ms" }}>
              <header className={styles.panelHead}>
                <h3>Uyarılar</h3>
              </header>
              <div className={styles.panelBody}>
                {kismiResult.warnings.map((w, i) => (
                  <div key={i} className={styles.warningBanner}>
                    <AlertTriangle size={16} />
                    <span>{w}</span>
                  </div>
                ))}
                {totalDaysWarning ? (
                  <div className={styles.warningBanner}>
                    <AlertTriangle size={16} />
                    <span>Toplam çalışma süresi 360 günden az ise kıdem tazminatı hakkı doğmayabilir (bilgilendirme).</span>
                  </div>
                ) : null}
              </div>
            </article>
          ) : null}

          <article className={styles.panel} style={{ animationDelay: "200ms" }}>
            <header className={styles.panelHead}>
              <h3>Kıdem Tazminatı Hesaplaması</h3>
            </header>
            <div className={styles.panelBody}>
              {kismiResult.tavanUygulandi ? (
                <p className={styles.panelHint}>
                  Hesaplamada aylık brüt yerine dönem tavanı ({fmtCurrency(kismiResult.tavanDegeri ?? 0)} ₺) kullanılmıştır.
                </p>
              ) : null}
              {yil > 0 ? (
                <div className={styles.line}>
                  <span>{fmtCurrency(kismiResult.yilBrut)} × {yil} yıl</span>
                  <span>{fmtCurrency(kismiResult.yilTutar)} ₺</span>
                </div>
              ) : null}
              {ay > 0 ? (
                <div className={styles.line}>
                  <span>{fmtCurrency(kismiResult.yilBrut)} / 12 × {ay} ay</span>
                  <span>{fmtCurrency(kismiResult.ayTutar)} ₺</span>
                </div>
              ) : null}
              {gun > 0 ? (
                <div className={styles.line}>
                  <span>{fmtCurrency(kismiResult.yilBrut)} / 360 × {gun} gün</span>
                  <span>{fmtCurrency(kismiResult.gunTutar)} ₺</span>
                </div>
              ) : null}
              <div className={`${styles.line} ${styles.netLine}`}>
                <span>Toplam Brüt Kıdem Tazminatı</span>
                <FlashValue value={`${fmtCurrency(kismiResult.toplamTutar)} ₺`} />
              </div>
            </div>
          </article>

          <article className={styles.panel} style={{ animationDelay: "240ms" }}>
            <header className={styles.panelHead}>
              <h3>Brüt&apos;ten Net&apos;e</h3>
            </header>
            <div className={styles.panelBody}>
              <div className={styles.line}>
                <span>Brüt Kıdem Tazminatı</span>
                <span>{fmtCurrency(brutNet.brut)} ₺</span>
              </div>
              <div className={styles.line}>
                <span>Damga Vergisi (Binde 7,59)</span>
                <span className={styles.deduction}>-{fmtCurrency(brutNet.damgaVergisi)} ₺</span>
              </div>
              <div className={`${styles.line} ${styles.netLine}`}>
                <span>Toplam Net Kıdem Tazminatı</span>
                <FlashValue value={`${fmtCurrency(brutNet.net)} ₺`} />
              </div>
              <p className={styles.panelHint}>
                Kısmi süreli çalışmada net tutar brüt tazminattan yalnızca binde 7,59 damga vergisi düşülerek
                hesaplanır; gelir vergisi uygulanmaz.
              </p>
            </div>
          </article>

          <section className={styles.card} style={{ animationDelay: "180ms" }}>
            <h2 className={styles.cardTitle}>Notlar</h2>
            <p className={styles.noteInfo}>{NOTE_INFO}</p>
          </section>
        </div>
      </div>

      {/* ── Sticky işlem çubuğu ── */}
      <div
        className={`${styles.stickyBar} ${isDirty ? styles.stickyBarDirty : ""} ${saveFlash ? styles.stickyBarSaved : ""}`}
        data-tour="kismi-kaydet-actions"
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
            <Button variant="primary" size="sm" onClick={handleSaveCase} disabled={caseSaving} className={saveFlash ? styles.saveBtnFlash : undefined}>
              <Save size={14} />
              {caseSaving ? "Kaydediliyor…" : currentRecordId ? "Güncelle" : "Kaydet"}
            </Button>
          </div>
        </div>
      </div>

      {/* ── Eklenti (12 aylık) modalı ── */}
      {eklentiTarget && eklentiKey ? (
        <div className={styles.modalOverlay} role="presentation" onClick={() => setEklentiTarget(null)}>
          <div
            className={`${styles.modalCard} ${styles.modalWide}`}
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className={styles.modalTitle}>{eklentiTitle}</h2>
            <p className={styles.modalDesc}>Son 12 aylık bordro tutarlarını girin.</p>
            <div className={styles.monthGrid}>
              {(eklentiMonths[eklentiKey] ?? emptyMonths()).map((value, index) => (
                <label key={index} className={styles.monthField}>
                  <span>{index + 1}. ay</span>
                  <input
                    inputMode="decimal"
                    value={value}
                    onChange={(e) => {
                      const v = sanitizeMoneyTyping(e.target.value);
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
            <p className={styles.formulaText}>Formül: (aylık toplam / 360) × 30</p>
            <p className={styles.formulaResult}>
              Sonuç: <strong>{fmtCurrency(eklentiResult)} ₺</strong>
            </p>
            <div className={styles.modalActions}>
              <Button variant="soft" onClick={() => setEklentiTarget(null)}>
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
              <Button variant="ghost" size="sm" disabled={setsLoading} onClick={() => void reloadSets()} title="Listeyi yenile">
                {setsLoading ? "Yükleniyor…" : "Yenile"}
              </Button>
            </div>

            {setsError ? (
              <div className={styles.legacyNotice} role="alert">
                <p>{setsError}</p>
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
                Kaydedilmiş set yok. Ekstra Hesaplamalar bölümündeki &quot;Kaydet&quot; ile mevcut kalemleri
                saklayabilirsiniz.
              </p>
            ) : savedSets.length > 0 ? (
              <ul className={styles.setList}>
                {savedSets.map((set) => (
                  <li key={set.id} className={styles.setRow}>
                    <div className={styles.setInfo}>
                      <strong>{set.name}</strong>
                      <span>
                        {set.data.length} kalem
                        {set.createdAt ? ` · ${new Date(set.createdAt).toLocaleDateString("tr-TR")}` : ""}
                      </span>
                    </div>
                    <div className={styles.inlineActions}>
                      <Button variant="soft" size="sm" onClick={() => handleImportSet(set)}>
                        İçe Aktar
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        disabled={setsDeleting}
                        onClick={() => setDeleteSetTarget(set)}
                        title="Seti sil"
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
              <p className={styles.emptyText}>Henüz kayıt yok. "Kaydet" ile mevcut hesaplamayı saklayabilirsiniz.</p>
            ) : (
              <ul className={styles.setList}>
                {savedCases.map((c) => (
                  <li key={c.id} className={styles.setRow}>
                    <div className={styles.setInfo}>
                      <strong>{c.name}</strong>
                      <span>
                        {fmtCurrency(c.results.brut)} ₺ brüt · {new Date(c.updatedAt).toLocaleDateString("tr-TR")}
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

      <GuidedTourHost
        definition={KIDEM_KISMI_TOUR}
        active={tour.active}
        onActiveChange={tour.setActive}
        welcomeOpen={tour.welcomeOpen}
        onWelcomeOpenChange={tour.setWelcomeOpen}
        welcomeTitle="İlk Kısmi Süreli kıdem hesabınızı birlikte yapalım mı?"
        welcomeBody="Birkaç kısa adımda hesaplamayı tamamlayın."
        welcomeStartLabel="Başlat"
        welcomeLaterLabel="Kendim devam edeceğim"
        welcomeNeverLabel="Bir daha gösterme"
        initialStepIndex={tour.resumeStepIndex}
        onCollectingComplete={() => {
          tour.completeTour();
          trackUsageEvent({
            eventType: "GUIDE_COMPLETED",
            moduleKey: KIDEM_KISMI_SURELI_TYPE,
            route: "/kidem-tazminati/kismi-sureli",
            guideVersion: KIDEM_KISMI_TOUR.version,
          });
          toast.info("Kılavuz tamamlandı. Hesaplamanızı önizleyebilir veya kaydedebilirsiniz.");
        }}
        onTourStarted={() => {
          trackUsageEvent({
            eventType: "GUIDE_STARTED",
            moduleKey: KIDEM_KISMI_SURELI_TYPE,
            route: "/kidem-tazminati/kismi-sureli",
            guideVersion: KIDEM_KISMI_TOUR.version,
            dedupeKey: "guide-started:kidem_kismi_sureli",
          });
        }}
        paused={showPreview}
      />

      <CalculationPreviewModal
        open={showPreview}
        title={PAGE_TITLE}
        sections={previewSections}
        contentId="kismi-word-copy"
        moduleKey={KIDEM_KISMI_SURELI_TYPE}
        onClose={() => setShowPreview(false)}
      />

      {/* ── İsim modalları ── */}
      <NameModal
        open={showSetSaveModal}
        title="Ekstra Hesaplamaları Kaydet"
        description="Aynı isimde kayıt varsa güncellenir. Set büro hesaplarınızda saklanır."
        placeholder="Set adı girin"
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
        description={`"${deleteSetTarget?.name ?? ""}" seti silinecek. Bu işlem büro hesabındaki kaydı kaldırır ve geri alınamaz.`}
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
    </div>
  );
}
