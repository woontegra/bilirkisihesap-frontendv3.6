import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  Calculator,
  CirclePlay,
  Download,
  Eye,
  FilePlus2,
  FolderOpen,
  Plus,
  Save,
  ShieldCheck,
  Sun,
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
import { getAsgariUcretByDate } from "./asgariUcret";
import {
  mapMevsimlikFormFromBackend,
  resolveSavedCaseDisplayName,
  mevsimlikCaseCrud,
  buildMevsimlikSaveResult,
  mapMevsimlikRecordToSavedCase,
  KIDEM_MEVSIMLIK_TYPE,
} from "./backendCase";
import { listKidemSavedCases } from "../shared/listKidemCases";
import { formatKidemMoneyFields } from "../shared/formatKidemMoneyFields";
import {
  calculatePeriodDays,
  computeEklentiResult,
  deriveMevsimlikResult,
  deriveWarnings,
  earliestPeriodStartISO,
  fmtCurrency,
  formatYilAyGun,
  latestPeriodEndISO,
  parseNum,
  sanitizeMoneyTyping,
} from "./engine";
import { describeSetsError, listExtraSets, removeExtraSet, upsertExtraSet } from "./extraSetsApi";
import {
  createEmptyMevsimlikForm,
  createEmptyPeriod,
  newLocalId,
  type ExtraItem,
  type MevsimlikFormSnapshot,
  type SavedExtraSet,
  type SavedMevsimlikCase,
  type WorkPeriod,
} from "./model";
import { clearCorruptCases, deleteCase, loadCasesSafe } from "./storage";
import { KIDEM_MEVSIMLIK_TOUR } from "./guidedTour";
import styles from "./MevsimlikKidemPage.module.css";
import tourStyles from "@/components/guided-tour/GuidedTour.module.css";

const PAGE_TITLE = "Mevsimlik İşçi Kıdem Tazminatı";
const NOTE_INFO =
  "Çalışma süresi toplam gün üzerinden yıl/ay/gün'e çevrilir; günlük kıdem payı 360 günlük yıla göre hesaplanır. Net kıdem, brüt tutardan yalnızca damga vergisi (binde 7,59) düşülerek bulunur.";
const EXTRA_HINT = "Ekstra Hesaplamalar (Prim, İkramiye, Yemek vb.)";
const FIXED_EXTRA_IDS = ["prim", "ikramiye", "yol", "yemek", "diger"] as const;
const FIXED_EXTRA_ROWS: Array<{ id: (typeof FIXED_EXTRA_IDS)[number]; label: string }> = [
  { id: "prim", label: "Prim" },
  { id: "ikramiye", label: "İkramiye" },
  { id: "yol", label: "Yol" },
  { id: "yemek", label: "Yemek" },
  { id: "diger", label: "Diğer" },
];

type FixedExtraId = (typeof FIXED_EXTRA_IDS)[number];
type EklentiTarget = { kind: "field"; field: FixedExtraId } | { kind: "extra"; id: string };
type PendingAction = { kind: "new" } | { kind: "open"; caseId: string } | null;

function eklentiKey(target: EklentiTarget): string {
  return target.kind === "field" ? `field:${target.field}` : `extra:${target.id}`;
}

function snapshotKey(s: MevsimlikFormSnapshot): string {
  return JSON.stringify({
    p: s.periods.map((p) => [p.start, p.end]),
    o: s.manualTotalDaysOverride,
    c: s.ciplakBrut,
    pr: s.prim,
    i: s.ikramiye,
    y: s.yol,
    m: s.yemek,
    d: s.diger,
    x: s.extras.map((it) => [it.name, it.value]),
    n: s.notes,
  });
}

function formatIsoTR(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(+d)) return iso;
  return d.toLocaleDateString("tr-TR");
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
  busy,
  onClose,
  onSave,
}: {
  open: boolean;
  title: string;
  description?: string;
  placeholder: string;
  confirmLabel: string;
  initialValue?: string;
  busy?: boolean;
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
            if (e.key === "Enter" && value.trim() && !busy) onSave(value.trim());
            if (e.key === "Escape") onClose();
          }}
        />
        <div className={styles.modalActions}>
          <Button variant="soft" onClick={onClose} disabled={busy}>
            İptal
          </Button>
          <Button variant="primary" disabled={!value.trim() || busy} onClick={() => onSave(value.trim())}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function MevsimlikKidemPage() {
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const caseIdParam = searchParams.get("caseId");
  const tour = useGuidedTourController();

  const [form, setForm] = useState<MevsimlikFormSnapshot>(createEmptyMevsimlikForm);
  const [currentRecordId, setCurrentRecordId] = useState<string | null>(null);
  const [currentRecordName, setCurrentRecordName] = useState<string | null>(null);
  const [savedCases, setSavedCases] = useState<SavedMevsimlikCase[]>([]);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [baseline, setBaseline] = useState<string>(snapshotKey(createEmptyMevsimlikForm()));
  const [caseLoading, setCaseLoading] = useState(false);
  const [caseSaving, setCaseSaving] = useState(false);
  const backendLoadedCaseIdRef = useRef<string | null>(null);

  const [showRecordsModal, setShowRecordsModal] = useState(false);
  const [showCaseSaveModal, setShowCaseSaveModal] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showExtraSaveModal, setShowExtraSaveModal] = useState(false);
  const [showExtraImportModal, setShowExtraImportModal] = useState(false);
  const [extraSetName, setExtraSetName] = useState("");
  const [savedExtraSets, setSavedExtraSets] = useState<SavedExtraSet[]>([]);
  const [setsBusy, setSetsBusy] = useState(false);
  const [deleteExtraTarget, setDeleteExtraTarget] = useState<SavedExtraSet | null>(null);
  const [deleteCaseTarget, setDeleteCaseTarget] = useState<SavedMevsimlikCase | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [saveFlash, setSaveFlash] = useState(false);
  const [formSwap, setFormSwap] = useState(false);
  const [removingExtraIds, setRemovingExtraIds] = useState<string[]>([]);
  const [removingPeriodIds, setRemovingPeriodIds] = useState<string[]>([]);
  const [eklentiFor, setEklentiFor] = useState<EklentiTarget | null>(null);
  const [eklentiMonths, setEklentiMonths] = useState<Record<string, string[]>>({});

  const modalReturnFocusRef = useRef<HTMLElement | null>(null);

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

  const reloadCases = useCallback(async () => {
    try {
      const items = await listKidemSavedCases(KIDEM_MEVSIMLIK_TYPE, mapMevsimlikRecordToSavedCase);
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

  useEffect(() => {
    void reloadCases();
  }, [reloadCases]);

  const isDirty = useMemo(() => snapshotKey(form) !== baseline, [form, baseline]);

  const result = useMemo(() => deriveMevsimlikResult(form), [form]);
  const formWarnings = useMemo(() => deriveWarnings(form), [form]);
  const durationLabel = useMemo(
    () => formatYilAyGun({ yil: result.yil, ay: result.ay, gun: result.gun }),
    [result.yil, result.ay, result.gun],
  );

  const startedRef = useRef(false);
  const completedFingerprintRef = useRef<string | null>(null);

  const markKidemStarted = useCallback(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    trackUsageEvent({
      eventType: "CALCULATION_STARTED",
      moduleKey: KIDEM_MEVSIMLIK_TYPE,
      route: "/kidem-tazminati/mevsimlik",
      dedupeKey: "started:kidem_mevsimlik",
    });
  }, []);

  useEffect(() => {
    const valid = result.brutKidem > 0 || result.netKidem > 0;
    if (!valid) return;
    const fingerprint = snapshotKey(form);
    if (completedFingerprintRef.current === fingerprint) return;
    completedFingerprintRef.current = fingerprint;
    trackUsageEvent({
      eventType: "CALCULATION_COMPLETED",
      moduleKey: KIDEM_MEVSIMLIK_TYPE,
      route: "/kidem-tazminati/mevsimlik",
    });
  }, [result.brutKidem, result.netKidem, form]);

  const iseGiris = useMemo(() => earliestPeriodStartISO(form.periods), [form.periods]);
  const istenCikis = useMemo(() => latestPeriodEndISO(form.periods), [form.periods]);

  const asgariUcretError = useMemo(() => {
    if (!istenCikis || !form.ciplakBrut.trim()) return null;
    const minimum = getAsgariUcretByDate(istenCikis);
    const wage = parseNum(form.ciplakBrut);
    if (!minimum || !wage || wage >= minimum) return null;
    const year = new Date(istenCikis).getFullYear();
    return `Girilen ücret, ${year} yılı asgari brüt ücretinden düşük olamaz (${fmtCurrency(minimum)}₺).`;
  }, [istenCikis, form.ciplakBrut]);

  const kidemTazminatiHakkiYok = result.toplamGun > 0 && result.toplamGun < 360;

  const tavanUyariMetni =
    result.tavanUygulandi && result.tavan != null
      ? `Aylık brüt ücret, dönem tavanı olan ${fmtCurrency(result.tavan)}₺'yi aştığı için tavan seviyesine çekilmiştir. Hesaplamalar tavan değeri üzerinden yapılmıştır.`
      : null;

  const hasExtraSetData = useMemo(
    () =>
      [form.prim, form.ikramiye, form.yol, form.yemek, form.diger].some((v) => v.trim()) ||
      form.extras.some((it) => it.name.trim() || it.value.trim()),
    [form.prim, form.ikramiye, form.yol, form.yemek, form.diger, form.extras],
  );

  useEffect(() => {
    const modalOpen =
      !!eklentiFor ||
      showRecordsModal ||
      showCaseSaveModal ||
      showPreview ||
      showExtraSaveModal ||
      showExtraImportModal ||
      deleteCaseTarget !== null ||
      deleteExtraTarget !== null ||
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
      if (deleteExtraTarget) setDeleteExtraTarget(null);
      else if (deleteCaseTarget) setDeleteCaseTarget(null);
      else if (discardOpen) {
        setDiscardOpen(false);
        setPendingAction(null);
      } else if (showExtraSaveModal) setShowExtraSaveModal(false);
      else if (showExtraImportModal) setShowExtraImportModal(false);
      else if (showPreview) setShowPreview(false);
      else if (showCaseSaveModal) setShowCaseSaveModal(false);
      else if (showRecordsModal) setShowRecordsModal(false);
      else if (eklentiFor) setEklentiFor(null);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("keydown", onKeyDown);
      modalReturnFocusRef.current?.focus();
    };
  }, [
    eklentiFor,
    showRecordsModal,
    showCaseSaveModal,
    showPreview,
    showExtraSaveModal,
    showExtraImportModal,
    deleteCaseTarget,
    deleteExtraTarget,
    discardOpen,
  ]);

  const triggerFormSwap = () => {
    setFormSwap(true);
    window.setTimeout(() => setFormSwap(false), 480);
  };

  const resetFormFields = useCallback(() => {
    const fresh = createEmptyMevsimlikForm();
    setForm(fresh);
    setCurrentRecordId(null);
    setCurrentRecordName(null);
    setEklentiMonths({});
    setBaseline(snapshotKey(fresh));
  }, []);

  const applyNewForm = useCallback(() => {
    backendLoadedCaseIdRef.current = null;
    clearCaseIdParam();
    resetFormFields();
    triggerFormSwap();
  }, [clearCaseIdParam, resetFormFields]);

  const applyOpenCase = useCallback(
    (c: SavedMevsimlikCase) => {
      backendLoadedCaseIdRef.current = /^\d+$/.test(c.id) ? c.id : null;
      if (/^\d+$/.test(c.id)) {
        setCaseIdParam(c.id);
      } else {
        clearCaseIdParam();
      }
      const periods: WorkPeriod[] = (c.form.periods ?? []).map((p) => {
        const start = String(p.start ?? "");
        const end = String(p.end ?? "");
        const daysRaw = Number(p.days);
        const days =
          Number.isFinite(daysRaw) && daysRaw > 0 ? daysRaw : calculatePeriodDays(start, end);
        return { id: p.id || newLocalId(), start, end, days };
      });
      const nextForm: MevsimlikFormSnapshot = formatKidemMoneyFields({
        ...createEmptyMevsimlikForm(),
        ...c.form,
        periods: periods.length > 0 ? periods : [createEmptyPeriod()],
        extras: (c.form.extras ?? []).map((it) => ({
          id: it.id || newLocalId(),
          name: String(it.name ?? ""),
          value: String(it.value ?? ""),
        })),
      });
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

  const applyBackendForm = useCallback((nextForm: MevsimlikFormSnapshot, recordId: string, recordName: string) => {
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
        const mapped = mapMevsimlikFormFromBackend(record.data);
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

  const patch = (partial: Partial<MevsimlikFormSnapshot>) => setForm((prev) => ({ ...prev, ...partial }));

  const updatePeriod = (id: string, field: "start" | "end" | "days", value: string) => {
    setForm((prev) => ({
      ...prev,
      periods: prev.periods.map((p) => {
        if (p.id !== id) return p;
        if (field === "days") {
          const n = parseInt(value, 10);
          return { ...p, days: Number.isFinite(n) && n >= 0 ? n : 0 };
        }
        const next: WorkPeriod = { ...p, [field]: value };
        next.days = next.start && next.end ? calculatePeriodDays(next.start, next.end) : 0;
        return next;
      }),
    }));
  };

  const addPeriod = () => {
    setForm((prev) => ({ ...prev, periods: [...prev.periods, createEmptyPeriod()] }));
  };

  const removePeriod = (id: string) => {
    if (form.periods.length <= 1) {
      toast.error("En az bir çalışma dönemi kalmalı");
      return;
    }
    setRemovingPeriodIds((prev) => [...prev, id]);
    window.setTimeout(() => {
      setForm((prev) => ({ ...prev, periods: prev.periods.filter((p) => p.id !== id) }));
      setRemovingPeriodIds((prev) => prev.filter((x) => x !== id));
    }, 220);
  };

  const updateFixedExtra = (field: FixedExtraId, value: string) => {
    patch({ [field]: value });
  };

  const updateExtra = (id: string, patchItem: Partial<ExtraItem>) => {
    setForm((prev) => ({
      ...prev,
      extras: prev.extras.map((it) => (it.id === id ? { ...it, ...patchItem } : it)),
    }));
  };

  const removeExtra = (id: string) => {
    setRemovingExtraIds((prev) => [...prev, id]);
    window.setTimeout(() => {
      setForm((prev) => ({ ...prev, extras: prev.extras.filter((it) => it.id !== id) }));
      setRemovingExtraIds((prev) => prev.filter((x) => x !== id));
    }, 220);
  };

  const addExtra = () => {
    setForm((prev) => ({ ...prev, extras: [...prev.extras, { id: newLocalId(), name: "", value: "" }] }));
  };

  const openEklenti = (target: EklentiTarget) => {
    const key = eklentiKey(target);
    setEklentiMonths((prev) => (prev[key] ? prev : { ...prev, [key]: Array<string>(12).fill("") }));
    setEklentiFor(target);
  };

  const applyEklenti = () => {
    if (!eklentiFor) return;
    const key = eklentiKey(eklentiFor);
    const months = eklentiMonths[key] ?? Array<string>(12).fill("");
    const value = computeEklentiResult(months) || 0;
    const formatted = value.toFixed(2).replace(".", ",");
    if (eklentiFor.kind === "field") {
      updateFixedExtra(eklentiFor.field, formatted);
    } else {
      updateExtra(eklentiFor.id, { value: formatted });
    }
    setEklentiFor(null);
  };

  const collectExtraSetItems = (): ExtraItem[] => {
    const items: ExtraItem[] = [];
    if (form.prim.trim()) items.push({ id: "prim", name: "Prim", value: form.prim.trim() });
    if (form.ikramiye.trim()) items.push({ id: "ikramiye", name: "İkramiye", value: form.ikramiye.trim() });
    if (form.yol.trim()) items.push({ id: "yol", name: "Yol", value: form.yol.trim() });
    if (form.yemek.trim()) items.push({ id: "yemek", name: "Yemek", value: form.yemek.trim() });
    if (form.diger.trim()) items.push({ id: "diger", name: "Diğer", value: form.diger.trim() });
    form.extras.forEach((item) => {
      if (item.name.trim() || item.value.trim()) {
        items.push({ id: item.id, name: item.name.trim(), value: item.value.trim() });
      }
    });
    return items;
  };

  const loadExtraSets = async () => {
    setSetsBusy(true);
    try {
      setSavedExtraSets(await listExtraSets());
      setShowExtraImportModal(true);
    } catch (error) {
      toast.error(describeSetsError(error));
    } finally {
      setSetsBusy(false);
    }
  };

  const persistExtraSet = async (name: string) => {
    const items = collectExtraSetItems();
    if (!items.length) {
      toast.error("Kaydedilecek ekstra hesaplama bulunamadı");
      return;
    }
    setSetsBusy(true);
    try {
      await upsertExtraSet(name, items);
      setShowExtraSaveModal(false);
      setExtraSetName("");
      toast.success("Ekstra hesaplamalar kaydedildi");
    } catch (error) {
      toast.error(describeSetsError(error));
    } finally {
      setSetsBusy(false);
    }
  };

  const findSetValue = (data: ExtraItem[], id: FixedExtraId, label: string): string | undefined => {
    const byId = data.find((x) => x.id === id);
    if (byId?.value) return byId.value;
    const byName = data.find((x) => x.name.trim().toLocaleLowerCase("tr-TR") === label.toLocaleLowerCase("tr-TR"));
    return byName?.value || undefined;
  };

  const importExtraSet = (set: SavedExtraSet) => {
    const prim = findSetValue(set.data, "prim", "Prim");
    const ikramiye = findSetValue(set.data, "ikramiye", "İkramiye");
    const yol = findSetValue(set.data, "yol", "Yol");
    const yemek = findSetValue(set.data, "yemek", "Yemek");
    const diger = findSetValue(set.data, "diger", "Diğer");
    const extrasData = set.data.filter((x) => !(FIXED_EXTRA_IDS as readonly string[]).includes(x.id));
    setForm((prev) => ({
      ...prev,
      ...(prim !== undefined ? { prim } : {}),
      ...(ikramiye !== undefined ? { ikramiye } : {}),
      ...(yol !== undefined ? { yol } : {}),
      ...(yemek !== undefined ? { yemek } : {}),
      ...(diger !== undefined ? { diger } : {}),
      extras: extrasData.map((item) => ({
        id: item.id || newLocalId(),
        name: item.name,
        value: item.value,
      })),
    }));
    setShowExtraImportModal(false);
    toast.success("Ekstra hesaplamalar yüklendi");
  };

  const confirmDeleteExtraSet = async () => {
    if (!deleteExtraTarget) return;
    setSetsBusy(true);
    try {
      await removeExtraSet(deleteExtraTarget.id);
      setSavedExtraSets(await listExtraSets());
      setDeleteExtraTarget(null);
      toast.success("Set silindi");
    } catch (error) {
      toast.error(describeSetsError(error));
    } finally {
      setSetsBusy(false);
    }
  };

  const persistCase = async (name: string) => {
    if (result.brutKidem <= 0 && result.netKidem <= 0) {
      toast.error("Önce geçerli bir hesaplama yapın");
      return;
    }
    setCaseSaving(true);
    const wasUpdate = !!(currentRecordId && /^\d+$/.test(currentRecordId));
    try {
      const record = await mevsimlikCaseCrud.saveCase(
        name,
        form,
        buildMevsimlikSaveResult(result.brutKidem, result.netKidem),
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
        await mevsimlikCaseCrud.removeCase(targetId);
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

  const previewSections = useMemo((): PreviewSection[] => {
    const money = (v: number) => `${fmtCurrency(v)} ₺`;
    const sections: PreviewSection[] = [];

    sections.push({
      id: "tarih",
      title: "Tarih Bilgileri",
      headers: ["İşe Giriş", "İşten Çıkış", "Çalışma Süresi"],
      rows: [[formatIsoTR(iseGiris), formatIsoTR(istenCikis), durationLabel]],
    });

    const wageRows: string[][] = [
      ["Çıplak Brüt", money(parseNum(form.ciplakBrut))],
      ["Prim", money(parseNum(form.prim))],
      ["İkramiye", money(parseNum(form.ikramiye))],
      ["Yemek", money(parseNum(form.yemek))],
    ];
    if (parseNum(form.yol) > 0) wageRows.push(["Yol", money(parseNum(form.yol))]);
    if (parseNum(form.diger) > 0) wageRows.push(["Diğer", money(parseNum(form.diger))]);
    form.extras.forEach((it) => {
      wageRows.push([it.name || "Ekstra", money(parseNum(it.value))]);
    });
    wageRows.push(["Toplam Brüt", money(result.toplamAylikBrut)]);
    sections.push({
      id: "ekstra",
      title: "Ekstra Hesaplamalar",
      headers: ["Kalem", "Tutar"],
      rows: wageRows,
      lastRowTone: "blue",
    });

    if (tavanUyariMetni) {
      sections.push({
        id: "tavan",
        title: "Tavan Uyarısı",
        headers: ["Uyarı"],
        rows: [[tavanUyariMetni]],
      });
    }

    const kidemRows: string[][] = [];
    if (result.yil > 0) {
      kidemRows.push([`${fmtCurrency(result.kullanilacakBrut)} × ${result.yil} yıl`, money(result.yilTutar)]);
    }
    if (result.ay > 0) {
      kidemRows.push([`${fmtCurrency(result.kullanilacakBrut)} / 12 × ${result.ay} ay`, money(result.ayTutar)]);
    }
    if (result.gun > 0) {
      kidemRows.push([`${fmtCurrency(result.kullanilacakBrut)} / 360 × ${result.gun} gün`, money(result.gunTutar)]);
    }
    kidemRows.push(["Toplam Brüt Kıdem Tazminatı", money(result.brutKidem)]);
    sections.push({
      id: "kidem",
      title: "Kıdem Tazminatı Hesaplaması",
      headers: ["Kalem", "Tutar"],
      rows: kidemRows,
      lastRowTone: "blue",
    });

    sections.push({
      id: "brutnet",
      title: "Brüt'ten Net'e",
      headers: ["Kalem", "Tutar"],
      rows: [
        ["Brüt Kıdem Tazminatı", money(result.brutKidem)],
        ["Damga Vergisi (Binde 7,59)", `-${money(result.damgaVergisi)}`],
        ["Toplam Net Kıdem Tazminatı", money(result.netKidem)],
      ],
      lastRowTone: "green",
    });

    return sections;
  }, [iseGiris, istenCikis, durationLabel, form, result, tavanUyariMetni]);

  const eklentiResult = eklentiFor
    ? computeEklentiResult(eklentiMonths[eklentiKey(eklentiFor)] ?? Array<string>(12).fill(""))
    : 0;

  const getFixedValue = (id: FixedExtraId): string => form[id];

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
              Birden fazla mevsimlik çalışma dönemini ekleyin; toplam gün 360 gün payıyla Yıl/Ay/Gün'e
              çevrilir, tavan ve damga vergisi ile net kıdem tazminatı hesaplanır.
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
        <div className={styles.formCol}>
          {/* Çalışma dönemleri */}
          <section className={styles.card} style={{ animationDelay: "60ms" }} data-tour="mevsimlik-donemler">
            <div className={styles.cardHead}>
              <h2 className={styles.cardTitle}>Çalışma dönemleri</h2>
              <Button variant="soft" size="sm" onClick={addPeriod}>
                <Plus size={13} />
                Dönem ekle
              </Button>
            </div>
            <p className={styles.cardHint}>
              Her dönem için başlangıç ve bitiş tarihlerini girin; gün sayısı otomatik hesaplanır, istenirse elle düzenlenebilir.
            </p>

            <div className={styles.periodList}>
              {form.periods.map((period, index) => (
                <div
                  key={period.id}
                  className={`${styles.periodRow} ${removingPeriodIds.includes(period.id) ? styles.periodRowLeaving : ""}`}
                >
                  <span className={styles.periodIndex}>{index + 1}</span>
                  <label className={styles.periodField}>
                    <span className={styles.fieldLabel}>Başlangıç</span>
                    <input
                      type="date"
                      className={styles.dateInput}
                      value={period.start}
                      onChange={(e) => {
                        markKidemStarted();
                        updatePeriod(period.id, "start", e.target.value);
                      }}
                    />
                  </label>
                  <label className={styles.periodField}>
                    <span className={styles.fieldLabel}>Bitiş</span>
                    <input
                      type="date"
                      className={styles.dateInput}
                      value={period.end}
                      onChange={(e) => {
                        markKidemStarted();
                        updatePeriod(period.id, "end", e.target.value);
                      }}
                    />
                  </label>
                  <label className={styles.periodDays}>
                    <span className={styles.fieldLabel}>Gün</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      className={styles.periodDaysValue}
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
                    aria-label={`${index + 1}. dönemi sil`}
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>

            <label className={`${styles.field} ${styles.overrideField}`}>
              <span className={styles.fieldLabel}>Toplam çalışma günü (isteğe bağlı)</span>
              <input
                className={styles.overrideInput}
                inputMode="numeric"
                value={form.manualTotalDaysOverride}
                onChange={(e) => patch({ manualTotalDaysOverride: e.target.value.replace(/[^\d]/g, "") })}
                placeholder={
                  form.periods.reduce((s, p) => s + p.days, 0) > 0
                    ? String(form.periods.reduce((s, p) => s + p.days, 0))
                    : undefined
                }
              />
              <span className={styles.fieldHint}>Boş bırakılırsa dönemlerden hesaplanan toplam kullanılır.</span>
            </label>

            <div className={styles.durationSummary}>
              <span>Kullanılan toplam süre</span>
              <strong>
                {result.toplamGun} gün · {durationLabel}
              </strong>
            </div>

            {formWarnings.length > 0 ? (
              <div className={styles.warningBox} role="alert">
                {formWarnings.map((w, i) => (
                  <p key={i}>{w}</p>
                ))}
              </div>
            ) : null}
          </section>

          {/* Ücret bilgileri */}
          <section className={styles.card} style={{ animationDelay: "120ms" }}>
            <h2 className={styles.cardTitle}>Ücret bilgileri</h2>
            <p className={styles.cardHint}>
              Aylık giydirilmiş brüt ve ek ödemeler; çalışma süresi yukarıdaki dönemlerden hesaplanır.
            </p>

            <label className={styles.field} data-tour="mevsimlik-ciplak-brut">
              <span className={styles.fieldLabel}>Çıplak Brüt Ücret</span>
              <div className={`${styles.inputWrap} ${asgariUcretError ? styles.inputWrapError : ""}`}>
                <input
                  className={styles.input}
                  inputMode="decimal"
                  value={form.ciplakBrut}
                  onChange={(e) => {
                    markKidemStarted();
                    patch({ ciplakBrut: sanitizeMoneyTyping(e.target.value) });
                  }}
                  placeholder="20.000,00"
                  aria-invalid={asgariUcretError ? true : undefined}
                />
                <span className={styles.currency} aria-hidden>
                  ₺
                </span>
              </div>
              {asgariUcretError ? <span className={styles.errorText}>{asgariUcretError}</span> : null}
            </label>

            {/* Ekstra Hesaplamalar */}
            <div className={styles.extraBlock} data-tour="mevsimlik-ekstra">
              <div className={styles.cardTitleRow}>
                <h3 className={styles.subCardTitle}>Ekstra Hesaplamalar</h3>
                <div className={styles.inlineActions}>
                  <Button variant="soft" size="sm" onClick={loadExtraSets} disabled={setsBusy}>
                    <Download size={13} />
                    İçe Aktar
                  </Button>
                  <Button
                    variant="soft"
                    size="sm"
                    onClick={() => setShowExtraSaveModal(true)}
                    disabled={!hasExtraSetData || setsBusy}
                  >
                    <Save size={13} />
                    Kaydet
                  </Button>
                </div>
              </div>
              <p className={styles.cardHint}>{EXTRA_HINT}</p>

              <div className={styles.fixedExtraList}>
                {FIXED_EXTRA_ROWS.map(({ id, label }) => (
                  <div key={id} className={styles.fixedExtraRow}>
                    <input className={styles.fixedExtraLabel} value={label} readOnly aria-label={`${label} kalemi`} />
                    <div className={styles.inputWrap}>
                      <input
                        className={styles.input}
                        inputMode="decimal"
                        value={getFixedValue(id)}
                        onChange={(e) => updateFixedExtra(id, sanitizeMoneyTyping(e.target.value))}
                        placeholder="0,00"
                        aria-label={`${label} tutarı`}
                      />
                      <span className={styles.currency} aria-hidden>
                        ₺
                      </span>
                    </div>
                    <button
                      type="button"
                      className={styles.eklentiBtn}
                      onClick={() => openEklenti({ kind: "field", field: id })}
                      title={`${label} için eklenti hesapla`}
                    >
                      <Calculator size={13} />
                      Eklenti Hesapla
                    </button>
                    <button
                      type="button"
                      className={styles.removeBtn}
                      onClick={() => updateFixedExtra(id, "")}
                      aria-label={`${label} tutarını temizle`}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}

                {form.extras.map((item) => (
                  <div
                    key={item.id}
                    className={`${styles.extraRow} ${removingExtraIds.includes(item.id) ? styles.extraRowLeaving : ""}`}
                  >
                    <input
                      className={styles.extraName}
                      value={item.name}
                      onChange={(e) => updateExtra(item.id, { name: e.target.value })}
                      placeholder="Kalem"
                      aria-label="Ek kalem adı"
                    />
                    <div className={styles.inputWrap}>
                      <input
                        className={styles.input}
                        inputMode="decimal"
                        value={item.value}
                        onChange={(e) => updateExtra(item.id, { value: sanitizeMoneyTyping(e.target.value) })}
                        placeholder="0,00"
                        aria-label={`${item.name || "Ek kalem"} tutarı`}
                      />
                      <span className={styles.currency} aria-hidden>
                        ₺
                      </span>
                    </div>
                    <button
                      type="button"
                      className={styles.eklentiBtn}
                      onClick={() => openEklenti({ kind: "extra", id: item.id })}
                      title="Eklenti Hesapla"
                    >
                      <Calculator size={13} />
                      Eklenti Hesapla
                    </button>
                    <button
                      type="button"
                      className={styles.removeBtn}
                      onClick={() => removeExtra(item.id)}
                      aria-label={`${item.name || "Ek kalem"} sil`}
                    >
                      <Trash2 size={14} />
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

          <div className={styles.grossSummary} style={{ animationDelay: "160ms" }}>
            <span>Toplam Brüt</span>
            <FlashValue value={`${fmtCurrency(result.toplamAylikBrut)} ₺`} />
          </div>
        </div>

        {/* Sonuçlar */}
        <div className={styles.resultCol}>
          <div className={`${styles.totalCard} ${saveFlash ? styles.totalCardSaved : ""}`} style={{ animationDelay: "100ms" }}>
            <span className={styles.totalLabel}>Brüt Kıdem Tazminatı</span>
            <FlashValue className={styles.totalValue} value={`${fmtCurrency(result.brutKidem)} ₺`} />
            <span className={styles.totalMeta}>
              {result.toplamGun} gün · {durationLabel}
            </span>
          </div>

          {tavanUyariMetni || kidemTazminatiHakkiYok ? (
            <article className={styles.panel} style={{ animationDelay: "140ms" }}>
              <header className={styles.panelHead}>
                <h3>Kıdem Tazminatı Uyarıları</h3>
              </header>
              <div className={styles.warningList} role="status">
                {tavanUyariMetni ? (
                  <div className={styles.warningBanner}>
                    <AlertTriangle size={15} />
                    <span>{tavanUyariMetni}</span>
                  </div>
                ) : null}
                {kidemTazminatiHakkiYok ? (
                  <div className={`${styles.warningBanner} ${styles.warningBannerOrange}`}>
                    <AlertTriangle size={15} />
                    <span>
                      Mevsimlik işçilerde toplam çalışma süresi 360 günden az ise kıdem tazminatı hakkı doğmaz
                      (yönlendirme amaçlı uyarı).
                    </span>
                  </div>
                ) : null}
              </div>
            </article>
          ) : null}

          <article className={styles.panel} style={{ animationDelay: "160ms" }}>
            <header className={styles.panelHead}>
              <h3>Kıdem Tazminatı Hesaplaması</h3>
            </header>
            <div className={styles.panelBody}>
              {result.yil > 0 ? (
                <div className={styles.line}>
                  <span>
                    {fmtCurrency(result.kullanilacakBrut)} × {result.yil} yıl
                  </span>
                  <span>{fmtCurrency(result.yilTutar)} ₺</span>
                </div>
              ) : null}
              {result.ay > 0 ? (
                <div className={styles.line}>
                  <span>
                    {fmtCurrency(result.kullanilacakBrut)} / 12 × {result.ay} ay
                  </span>
                  <span>{fmtCurrency(result.ayTutar)} ₺</span>
                </div>
              ) : null}
              {result.gun > 0 ? (
                <div className={styles.line}>
                  <span>
                    {fmtCurrency(result.kullanilacakBrut)} / 360 × {result.gun} gün
                  </span>
                  <span>{fmtCurrency(result.gunTutar)} ₺</span>
                </div>
              ) : null}
              <div className={`${styles.line} ${styles.netLine}`}>
                <span>Toplam Brüt Kıdem Tazminatı</span>
                <FlashValue value={`${fmtCurrency(result.brutKidem)} ₺`} />
              </div>
            </div>
          </article>

          <article className={styles.panel} style={{ animationDelay: "220ms" }}>
            <header className={styles.panelHead}>
              <h3>Brütten Nete</h3>
            </header>
            <div className={styles.panelBody}>
              <div className={styles.line}>
                <span>Brüt Kıdem Tazminatı</span>
                <FlashValue value={`${fmtCurrency(result.brutKidem)} ₺`} />
              </div>
              <div className={styles.line}>
                <span>Damga Vergisi (Binde 7,59)</span>
                <span className={styles.deduction}>-{fmtCurrency(result.damgaVergisi)} ₺</span>
              </div>
              <div className={`${styles.line} ${styles.netLine}`}>
                <span>Toplam Net Kıdem Tazminatı</span>
                <FlashValue value={`${fmtCurrency(result.netKidem)} ₺`} />
              </div>
            </div>
          </article>

          <section className={styles.card} style={{ animationDelay: "180ms" }}>
            <h2 className={styles.cardTitle}>Notlar</h2>
            <p className={styles.noteInfo}>{NOTE_INFO}</p>
          </section>
        </div>
      </div>

      <div
        className={`${styles.stickyBar} ${isDirty ? styles.stickyBarDirty : ""} ${saveFlash ? styles.stickyBarSaved : ""}`}
        data-tour="mevsimlik-kaydet-actions"
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

      {/* Eklenti modalı */}
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
              {(eklentiMonths[eklentiKey(eklentiFor)] ?? Array<string>(12).fill("")).map((value, index) => (
                <label key={index} className={styles.monthField}>
                  <span>{index + 1}. ay</span>
                  <input
                    inputMode="decimal"
                    value={value}
                    onChange={(e) => {
                      const v = sanitizeMoneyTyping(e.target.value);
                      const key = eklentiKey(eklentiFor);
                      setEklentiMonths((prev) => ({
                        ...prev,
                        [key]: (prev[key] ?? Array<string>(12).fill("")).map((m, i) => (i === index ? v : m)),
                      }));
                    }}
                    placeholder="1.250,00"
                  />
                </label>
              ))}
            </div>
            <p className={styles.formulaText}>Formül: (12 aylık toplam / 360) × 30</p>
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

      {/* Kayıtlar */}
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
                        {fmtCurrency(c.results.brutKidem)} ₺ brüt · {new Date(c.updatedAt).toLocaleDateString("tr-TR")}
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

      {/* İçe aktar */}
      {showExtraImportModal ? (
        <div className={styles.modalOverlay} role="presentation" onClick={() => setShowExtraImportModal(false)}>
          <div className={styles.modalCard} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>Kaydedilmiş Setleri İçe Aktar</h2>
            {savedExtraSets.length === 0 ? (
              <p className={styles.emptyText}>Henüz kaydedilmiş set bulunmuyor</p>
            ) : (
              <ul className={styles.setList}>
                {savedExtraSets.map((set) => (
                  <li key={set.id} className={styles.setRow}>
                    <div className={styles.setInfo}>
                      <strong>{set.name}</strong>
                      <span>
                        {set.data.length} kalem
                        {set.createdAt || set.updatedAt
                          ? ` · ${new Date(set.updatedAt || set.createdAt || "").toLocaleDateString("tr-TR")}`
                          : ""}
                      </span>
                    </div>
                    <div className={styles.inlineActions}>
                      <Button variant="soft" size="sm" onClick={() => importExtraSet(set)} disabled={setsBusy}>
                        <Download size={13} />
                        İçe Aktar
                      </Button>
                      <Button variant="danger" size="sm" onClick={() => setDeleteExtraTarget(set)} disabled={setsBusy}>
                        <Trash2 size={13} />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <div className={styles.modalActions}>
              <Button variant="soft" onClick={() => setShowExtraImportModal(false)}>
                Kapat
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <GuidedTourHost
        definition={KIDEM_MEVSIMLIK_TOUR}
        active={tour.active}
        onActiveChange={tour.setActive}
        welcomeOpen={tour.welcomeOpen}
        onWelcomeOpenChange={tour.setWelcomeOpen}
        welcomeTitle="İlk Mevsimlik İşçi kıdem hesabınızı birlikte yapalım mı?"
        welcomeBody="Birkaç kısa adımda hesaplamayı tamamlayın."
        welcomeStartLabel="Başlat"
        welcomeLaterLabel="Kendim devam edeceğim"
        welcomeNeverLabel="Bir daha gösterme"
        initialStepIndex={tour.resumeStepIndex}
        onCollectingComplete={() => {
          tour.completeTour();
          trackUsageEvent({
            eventType: "GUIDE_COMPLETED",
            moduleKey: KIDEM_MEVSIMLIK_TYPE,
            route: "/kidem-tazminati/mevsimlik",
            guideVersion: KIDEM_MEVSIMLIK_TOUR.version,
          });
          toast.info("Kılavuz tamamlandı. Hesaplamanızı önizleyebilir veya kaydedebilirsiniz.");
        }}
        onTourStarted={() => {
          trackUsageEvent({
            eventType: "GUIDE_STARTED",
            moduleKey: KIDEM_MEVSIMLIK_TYPE,
            route: "/kidem-tazminati/mevsimlik",
            guideVersion: KIDEM_MEVSIMLIK_TOUR.version,
            dedupeKey: "guide-started:kidem_mevsimlik",
          });
        }}
        paused={showPreview}
      />

      <CalculationPreviewModal
        open={showPreview}
        title={PAGE_TITLE}
        sections={previewSections}
        contentId="mevsimlik-word-copy"
        moduleKey={KIDEM_MEVSIMLIK_TYPE}
        onClose={() => setShowPreview(false)}
      />

      <NameModal
        open={showCaseSaveModal}
        title="Hesaplamayı Kaydet"
        description="Kaydedilen hesaplamalarınızda görünecek bir isim girin."
        placeholder="Örn: Mevsimlik işçi — dosya adı"
        confirmLabel={caseSaving ? "Kaydediliyor…" : "Kaydet"}
        initialValue={currentRecordName ?? ""}
        busy={caseSaving}
        onClose={() => {
          if (!caseSaving) setShowCaseSaveModal(false);
        }}
        onSave={(name) => {
          void persistCase(name);
        }}
      />

      <NameModal
        open={showExtraSaveModal}
        title="Ekstra Hesaplamaları Kaydet"
        description="Bu set tüm hesaplama sayfalarında ortak kullanılır."
        placeholder="Set adı girin"
        confirmLabel="Kaydet"
        initialValue={extraSetName}
        busy={setsBusy}
        onClose={() => {
          setShowExtraSaveModal(false);
          setExtraSetName("");
        }}
        onSave={persistExtraSet}
      />

      <ConfirmDialog
        open={deleteCaseTarget !== null}
        title="Kaydı sil"
        description={`“${deleteCaseTarget?.name ?? ""}” kaydı silinecek. Bu işlem geri alınamaz.`}
        confirmLabel="Sil"
        danger
        onConfirm={confirmDeleteCase}
        onCancel={() => setDeleteCaseTarget(null)}
      />
      <ConfirmDialog
        open={deleteExtraTarget !== null}
        title="Seti sil"
        description={`“${deleteExtraTarget?.name ?? ""}” ekstra hesaplama seti silinecek. Bu işlem geri alınamaz.`}
        confirmLabel="Sil"
        danger
        onConfirm={() => {
          void confirmDeleteExtraSet();
        }}
        onCancel={() => setDeleteExtraTarget(null)}
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
