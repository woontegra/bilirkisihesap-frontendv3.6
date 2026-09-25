import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  Briefcase,
  Calculator,
  CirclePlay,
  Download,
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
import { getSavedCase } from "@/api/savedCases";
import { CalculationPreviewModal, type PreviewSection } from "@/components/calculation-preview";
import { GuidedTourHost, useGuidedTourController } from "@/components/guided-tour";
import { trackUsageEvent } from "@/telemetry/trackUsageEvent";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { useToast } from "@/context/ToastContext";
import { mapIsKanunuFormFromBackend, resolveSavedCaseDisplayName, isKanunuCaseCrud, buildIsKanunuSaveResult, mapIsKanunuRecordToSavedCase, KIDEM_30ISCI_TYPE } from "./backendCase";
import { listKidemSavedCases } from "../shared/listKidemCases";
import { formatKidemMoneyFields } from "../shared/formatKidemMoneyFields";
import { formatIsoDateTR } from "@/utils/dateDisplay";
import {
  computeEklentiResult,
  computeIsKanunuResult,
  formatMoney,
  parseMoneyInput,
  sanitizeMoneyTyping,
  validateDateRange,
} from "./engine";
import {
  createEmptyForm,
  newLocalId,
  type ExtraItem,
  type IsKanunuFormSnapshot,
  type SavedCase,
  type SavedExtraSet,
} from "./model";
import { getAsgariUcretByDate } from "./asgariUcret";
import { deleteExtraSet, describeSetsError, listExtraSets, saveExtraSet } from "./extraSetsApi";
import { clearCorruptCases, deleteCase, loadCasesSafe } from "./storage";
import { KIDEM_IS_KANUNU_TOUR } from "./guidedTour";
import styles from "./IsKanunuKidemPage.module.css";
import tourStyles from "@/components/guided-tour/GuidedTour.module.css";

const PAGE_TITLE = "Kıdem Tazminatı — İş Kanununa Göre";
const NOTE_INFO =
  "Prim, İkramiye, Yol ve Yemek gibi ekli kalemlerin hesaplanmasında son 12 aylık bordroda yer alan tüm tutarlar toplanır, toplam 360'a bölünür ve 30 ile çarpılır. Bu değeri her kalemin yanındaki “Eklenti” düğmesiyle otomatik hesaplayabilirsiniz.";

type EklentiTarget = { kind: "field"; field: "prim" | "ikramiye" | "yol" | "yemek" } | { kind: "extra"; id: string };

type PendingAction = { kind: "new" } | { kind: "open"; caseId: string } | null;

function eklentiKey(target: EklentiTarget): string {
  return target.kind === "field" ? `field:${target.field}` : `extra:${target.id}`;
}

function snapshotKey(s: IsKanunuFormSnapshot): string {
  return JSON.stringify({
    a: s.iseGirisTarihi,
    b: s.istenCikisTarihi,
    c: s.ciplakBrut,
    p: s.prim,
    i: s.ikramiye,
    y: s.yol,
    m: s.yemek,
    e: s.extras.map((x) => [x.name, x.value]),
  });
}

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
  return <span className={`${className ?? ""} ${flash ? styles.valueFlash : ""}`.trim()}>{value}</span>;
}

/* ── İsimle kaydetme modalı ── */
function NameModal({
  open,
  title,
  description,
  placeholder,
  confirmLabel,
  initialValue,
  disabled,
  onClose,
  onSave,
}: {
  open: boolean;
  title: string;
  description?: string;
  placeholder: string;
  confirmLabel: string;
  initialValue?: string;
  disabled?: boolean;
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
            if (e.key === "Enter" && value.trim() && !disabled) onSave(value.trim());
            if (e.key === "Escape") onClose();
          }}
          disabled={disabled}
        />
        <div className={styles.modalActions}>
          <Button variant="soft" onClick={onClose}>
            İptal
          </Button>
          <Button variant="primary" disabled={!value.trim() || disabled} onClick={() => onSave(value.trim())}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function IsKanunuKidemPage() {
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const caseIdParam = searchParams.get("caseId");
  const tour = useGuidedTourController();

  /* form state */
  const [iseGirisTarihi, setIseGirisTarihi] = useState("");
  const [istenCikisTarihi, setIstenCikisTarihi] = useState("");
  const [ciplakBrut, setCiplakBrut] = useState("");
  const [prim, setPrim] = useState("");
  const [ikramiye, setIkramiye] = useState("");
  const [yol, setYol] = useState("");
  const [yemek, setYemek] = useState("");
  const [extras, setExtras] = useState<ExtraItem[]>([]);

  /* kayıt state */
  const [currentRecordId, setCurrentRecordId] = useState<string | null>(null);
  const [currentRecordName, setCurrentRecordName] = useState<string | null>(null);
  const [savedCases, setSavedCases] = useState<SavedCase[]>([]);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [caseLoading, setCaseLoading] = useState(false);
  const [caseSaving, setCaseSaving] = useState(false);
  const backendLoadedCaseIdRef = useRef<string | null>(null);

  /* ui state */
  const [removingIds, setRemovingIds] = useState<string[]>([]);
  const [eklentiFor, setEklentiFor] = useState<EklentiTarget | null>(null);
  const [eklentiMonths, setEklentiMonths] = useState<Record<string, string[]>>({});
  const [showRecordsModal, setShowRecordsModal] = useState(false);
  const [showCaseSaveModal, setShowCaseSaveModal] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showExtraSaveModal, setShowExtraSaveModal] = useState(false);
  const [showExtraImportModal, setShowExtraImportModal] = useState(false);
  const [savedExtraSets, setSavedExtraSets] = useState<SavedExtraSet[]>([]);
  const [setsBusy, setSetsBusy] = useState(false);
  const [deleteExtraTarget, setDeleteExtraTarget] = useState<SavedExtraSet | null>(null);
  const [deleteCaseTarget, setDeleteCaseTarget] = useState<SavedCase | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [saveFlash, setSaveFlash] = useState(false);
  const [formSwap, setFormSwap] = useState(false);
  const [baseline, setBaseline] = useState("");

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

  const snapshot = useCallback(
    (): IsKanunuFormSnapshot => ({
      iseGirisTarihi,
      istenCikisTarihi,
      ciplakBrut,
      prim,
      ikramiye,
      yol,
      yemek,
      extras: extras.map((i) => ({ id: i.id, name: i.name, value: i.value })),
      notes: "",
    }),
    [iseGirisTarihi, istenCikisTarihi, ciplakBrut, prim, ikramiye, yol, yemek, extras],
  );

  const reloadCases = useCallback(async () => {
    try {
      const items = await listKidemSavedCases(KIDEM_30ISCI_TYPE, mapIsKanunuRecordToSavedCase);
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
    setBaseline(snapshotKey(createEmptyForm()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isDirty = useMemo(() => snapshotKey(snapshot()) !== baseline, [snapshot, baseline]);

  const dateError = useMemo(
    () => validateDateRange(iseGirisTarihi, istenCikisTarihi),
    [iseGirisTarihi, istenCikisTarihi],
  );

  const result = useMemo(() => {
    if (dateError) {
      return computeIsKanunuResult({ ...snapshot(), istenCikisTarihi: "" });
    }
    return computeIsKanunuResult(snapshot());
  }, [snapshot, dateError]);

  const startedRef = useRef(false);
  const completedFingerprintRef = useRef<string | null>(null);

  const markKidemStarted = useCallback(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    trackUsageEvent({
      eventType: "CALCULATION_STARTED",
      moduleKey: KIDEM_30ISCI_TYPE,
      route: "/kidem-tazminati/30isci",
      dedupeKey: "started:kidem_30isci",
    });
  }, []);

  useEffect(() => {
    const valid = !dateError && (result.brutKidem > 0 || result.netKidem > 0);
    if (!valid) return;
    const fingerprint = snapshotKey(snapshot());
    if (completedFingerprintRef.current === fingerprint) return;
    completedFingerprintRef.current = fingerprint;
    trackUsageEvent({
      eventType: "CALCULATION_COMPLETED",
      moduleKey: KIDEM_30ISCI_TYPE,
      route: "/kidem-tazminati/30isci",
    });
  }, [dateError, result.brutKidem, result.netKidem, snapshot]);

  const asgariUcretError = useMemo(() => {
    const minimum = getAsgariUcretByDate(istenCikisTarihi);
    const wage = parseMoneyInput(ciplakBrut);
    if (!minimum || !wage || wage >= minimum) return null;
    const year = istenCikisTarihi.slice(0, 4);
    return `Girilen ücret, ${year} yılı asgari brüt ücretinden düşük olamaz (${formatMoney(minimum)} ₺).`;
  }, [istenCikisTarihi, ciplakBrut]);

  const hasExtraSetData = useMemo(
    () =>
      [prim, ikramiye, yol, yemek].some((value) => value.trim()) ||
      extras.some((item) => item.value.trim()),
    [prim, ikramiye, yol, yemek, extras],
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
      const dialogs = document.querySelectorAll<HTMLElement>('[role="dialog"]');
      const dialog = dialogs.item(dialogs.length - 1);
      if (event.key === "Tab" && dialog) {
        const focusable = Array.from(
          dialog.querySelectorAll<HTMLElement>(
            "button:not(:disabled), input:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex='-1'])",
          ),
        );
        if (focusable.length) {
          const first = focusable[0];
          const last = focusable[focusable.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
          }
        }
      }
      if (event.key !== "Escape") return;
      if (deleteExtraTarget) setDeleteExtraTarget(null);
      else if (deleteCaseTarget) setDeleteCaseTarget(null);
      else if (discardOpen) {
        setDiscardOpen(false);
        setPendingAction(null);
      }
      else if (showExtraSaveModal) setShowExtraSaveModal(false);
      else if (showExtraImportModal) setShowExtraImportModal(false);
      else if (showCaseSaveModal) setShowCaseSaveModal(false);
      else if (showPreview) setShowPreview(false);
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

  /* form işlemleri */
  const triggerFormSwap = () => {
    setFormSwap(true);
    window.setTimeout(() => setFormSwap(false), 480);
  };

  const resetFormFields = useCallback(() => {
    setIseGirisTarihi("");
    setIstenCikisTarihi("");
    setCiplakBrut("");
    setPrim("");
    setIkramiye("");
    setYol("");
    setYemek("");
    setExtras([]);
    setCurrentRecordId(null);
    setCurrentRecordName(null);
    setEklentiMonths({});
    setBaseline(snapshotKey(createEmptyForm()));
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
      const formatted = formatKidemMoneyFields({
        ...c.form,
        extras: (c.form.extras ?? []).map((i) => ({
          id: i.id || newLocalId(),
          name: String(i.name ?? ""),
          value: String(i.value ?? ""),
        })),
      });
      const items: ExtraItem[] = formatted.extras ?? [];
      setIseGirisTarihi(String(formatted.iseGirisTarihi ?? ""));
      setIstenCikisTarihi(String(formatted.istenCikisTarihi ?? ""));
      setCiplakBrut(String(formatted.ciplakBrut ?? ""));
      setPrim(String(formatted.prim ?? ""));
      setIkramiye(String(formatted.ikramiye ?? ""));
      setYol(String(formatted.yol ?? ""));
      setYemek(String(formatted.yemek ?? ""));
      setExtras(items);
      setCurrentRecordId(c.id);
      setCurrentRecordName(c.name);
      setBaseline(
        snapshotKey({
          iseGirisTarihi: String(formatted.iseGirisTarihi ?? ""),
          istenCikisTarihi: String(formatted.istenCikisTarihi ?? ""),
          ciplakBrut: String(formatted.ciplakBrut ?? ""),
          prim: String(formatted.prim ?? ""),
          ikramiye: String(formatted.ikramiye ?? ""),
          yol: String(formatted.yol ?? ""),
          yemek: String(formatted.yemek ?? ""),
          extras: items,
          notes: "",
        }),
      );
      setShowRecordsModal(false);
      triggerFormSwap();
      toast.success("Kayıt yüklendi");
    },
    [clearCaseIdParam, setCaseIdParam, toast],
  );

  const applyBackendForm = useCallback((form: IsKanunuFormSnapshot, recordId: string, recordName: string) => {
    const items: ExtraItem[] = (form.extras ?? []).map((i) => ({
      id: i.id || newLocalId(),
      name: String(i.name ?? ""),
      value: String(i.value ?? ""),
    }));
    setIseGirisTarihi(String(form.iseGirisTarihi ?? ""));
    setIstenCikisTarihi(String(form.istenCikisTarihi ?? ""));
    setCiplakBrut(String(form.ciplakBrut ?? ""));
    setPrim(String(form.prim ?? ""));
    setIkramiye(String(form.ikramiye ?? ""));
    setYol(String(form.yol ?? ""));
    setYemek(String(form.yemek ?? ""));
    setExtras(items);
    setCurrentRecordId(recordId);
    setCurrentRecordName(recordName);
    setEklentiMonths({});
    setBaseline(
      snapshotKey({
        iseGirisTarihi: String(form.iseGirisTarihi ?? ""),
        istenCikisTarihi: String(form.istenCikisTarihi ?? ""),
        ciplakBrut: String(form.ciplakBrut ?? ""),
        prim: String(form.prim ?? ""),
        ikramiye: String(form.ikramiye ?? ""),
        yol: String(form.yol ?? ""),
        yemek: String(form.yemek ?? ""),
        extras: items,
        notes: "",
      }),
    );
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
        const mapped = mapIsKanunuFormFromBackend(record.data, record);
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

  /* ek kalem işlemleri */
  const updateExtra = (id: string, patch: Partial<ExtraItem>) => {
    setExtras((items) => items.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  };

  const removeExtra = (id: string) => {
    setRemovingIds((prev) => [...prev, id]);
    window.setTimeout(() => {
      setExtras((items) => items.filter((row) => row.id !== id));
      setRemovingIds((prev) => prev.filter((x) => x !== id));
    }, 220);
  };

  const addExtra = () => {
    setExtras((items) => [...items, { id: newLocalId(), name: "", value: "" }]);
  };

  const updateFixedExtra = (field: "prim" | "ikramiye" | "yol" | "yemek", value: string) => {
    if (field === "prim") setPrim(value);
    else if (field === "ikramiye") setIkramiye(value);
    else if (field === "yol") setYol(value);
    else setYemek(value);
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

  const collectExtraSetItems = (): ExtraItem[] => {
    const items: ExtraItem[] = [];
    if (prim.trim()) items.push({ id: "prim", name: "Prim", value: prim.trim() });
    if (ikramiye.trim()) items.push({ id: "ikramiye", name: "İkramiye", value: ikramiye.trim() });
    if (yol.trim()) items.push({ id: "yol", name: "Yol", value: yol.trim() });
    if (yemek.trim()) items.push({ id: "yemek", name: "Yemek", value: yemek.trim() });
    extras.forEach((item) => {
      if (item.value.trim()) {
        items.push({ id: item.id, name: item.name.trim(), value: item.value.trim() });
      }
    });
    return items;
  };

  const persistExtraSet = async (name: string) => {
    const items = collectExtraSetItems();
    if (!items.length) {
      toast.error("Kaydedilecek veri yok");
      return;
    }
    if (!name.trim()) return;
    setSetsBusy(true);
    try {
      await saveExtraSet(name.trim(), items);
      setSavedExtraSets(await listExtraSets());
      setShowExtraSaveModal(false);
      toast.success("Ekstra hesaplamalar kaydedildi");
    } catch (error) {
      toast.error(describeSetsError(error));
    } finally {
      setSetsBusy(false);
    }
  };

  const importExtraSet = (set: SavedExtraSet) => {
    const fixed = new Map(set.data.map((item) => [item.id, item.value]));
    setPrim(fixed.get("prim") ?? "");
    setIkramiye(fixed.get("ikramiye") ?? "");
    setYol(fixed.get("yol") ?? "");
    setYemek(fixed.get("yemek") ?? "");
    setExtras(
      set.data
        .filter((item) => !["prim", "ikramiye", "yol", "yemek"].includes(item.id))
        .map((item) => ({ ...item, id: item.id || newLocalId() })),
    );
    setShowExtraImportModal(false);
    toast.success("Ekstra hesaplamalar yüklendi");
  };

  const confirmDeleteExtraSet = async () => {
    if (!deleteExtraTarget) return;
    setSetsBusy(true);
    try {
      await deleteExtraSet(deleteExtraTarget.id);
      setSavedExtraSets(await listExtraSets());
      setDeleteExtraTarget(null);
      toast.success("Set silindi");
    } catch (error) {
      toast.error(describeSetsError(error));
    } finally {
      setSetsBusy(false);
    }
  };

  /* eklenti (12 aylık ortalama) */
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
      if (eklentiFor.field === "prim") setPrim(formatted);
      else if (eklentiFor.field === "ikramiye") setIkramiye(formatted);
      else if (eklentiFor.field === "yol") setYol(formatted);
      else setYemek(formatted);
    } else {
      updateExtra(eklentiFor.id, { value: formatted });
    }
    setEklentiFor(null);
  };

  /* kayıt işlemleri — backend saved-cases */
  const persistCase = async (name: string) => {
    if (result.brutKidem <= 0 && result.netKidem <= 0) {
      toast.error("Önce geçerli bir hesaplama yapın");
      return;
    }
    setCaseSaving(true);
    const wasUpdate = !!(currentRecordId && /^\d+$/.test(currentRecordId));
    try {
      const record = await isKanunuCaseCrud.saveCase(
        name,
        snapshot(),
        buildIsKanunuSaveResult({
          brutKidem: result.brutKidem,
          netKidem: result.netKidem,
          durationLabel: result.durationLabel,
        }),
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
        await isKanunuCaseCrud.removeCase(targetId);
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

  /* önizleme bölümleri */
  const previewSections = useMemo((): PreviewSection[] => {
    const money = (v: number) => `${formatMoney(v)} ₺`;
    const sections: PreviewSection[] = [];

    sections.push({
      id: "sure",
      title: "Tarih Bilgileri",
      headers: ["İşe Giriş", "İşten Çıkış", "Çalışma Süresi"],
      rows: [[formatIsoDateTR(iseGirisTarihi), formatIsoDateTR(istenCikisTarihi), result.durationLabel]],
    });

    const wageRows: string[][] = [
      ["Çıplak Brüt", money(parseMoneyInput(ciplakBrut))],
      ["Prim", money(parseMoneyInput(prim))],
      ["İkramiye", money(parseMoneyInput(ikramiye))],
      ["Yemek", money(parseMoneyInput(yemek))],
    ];
    if (parseMoneyInput(yol) > 0) wageRows.push(["Yol", money(parseMoneyInput(yol))]);
    extras
      .forEach((i, idx) => wageRows.push([i.name || `Ek Kalem ${idx + 1}`, money(parseMoneyInput(i.value))]));
    wageRows.push(["Toplam Brüt", money(result.giydirilmisAylik)]);
    sections.push({
      id: "ucret",
      title: "Ekstra Hesaplamalar",
      headers: ["Kalem", "Tutar"],
      rows: wageRows,
      lastRowTone: "blue",
    });

    if (result.tavanApplied && result.tavan != null) {
      sections.push({
        id: "tavan",
        title: "Tavan Uyarısı",
        headers: ["Uyarı"],
        rows: [[`Aylık brüt ücret, dönem tavanı olan ${formatMoney(result.tavan)}₺'yi aştığı için tavan seviyesine çekilmiştir. Hesaplamalar tavan değeri üzerinden yapılmıştır.`]],
      });
    }

    const kidemRows: string[][] = [];
    if ((result.duration?.years ?? 0) > 0) {
      kidemRows.push([
        `${formatMoney(result.esasAylik)} × ${result.duration?.years} yıl`,
        money(result.esasAylik * (result.duration?.years ?? 0)),
      ]);
    }
    if ((result.duration?.months ?? 0) > 0) {
      kidemRows.push([
        `${formatMoney(result.esasAylik)} / 12 × ${result.duration?.months} ay`,
        money((result.esasAylik / 12) * (result.duration?.months ?? 0)),
      ]);
    }
    if ((result.duration?.days ?? 0) > 0) {
      kidemRows.push([
        `${formatMoney(result.esasAylik)} / 365 × ${result.duration?.days} gün`,
        money((result.esasAylik / 365) * (result.duration?.days ?? 0)),
      ]);
    }
    kidemRows.push(["Toplam Brüt Kıdem Tazminatı", money(result.brutKidem)]);
    sections.push({
      id: "kidem",
      title: "Kıdem Tazminatı Hesaplaması",
      headers: ["Kalem", "Tutar"],
      rows: kidemRows,
      lastRowTone: "blue",
    });

    const netRows: string[][] = [
      ["Brüt Kıdem Tazminatı", money(result.brutKidem)],
      ["Damga Vergisi (Binde 7,59)", `-${money(result.damgaVergisi)}`],
      ["Toplam Net Kıdem Tazminatı", money(result.netKidem)],
    ];
    sections.push({
      id: "net",
      title: "Brüt'ten Net'e",
      headers: ["Kalem", "Tutar"],
      rows: netRows,
      lastRowTone: "green",
    });

    return sections;
  }, [iseGirisTarihi, istenCikisTarihi, ciplakBrut, prim, ikramiye, yol, yemek, extras, result]);

  const eklentiResult = eklentiFor
    ? computeEklentiResult(eklentiMonths[eklentiKey(eklentiFor)] ?? Array<string>(12).fill(""))
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
            <Briefcase size={22} />
          </div>
          <div>
            <h1 className={styles.title}>{PAGE_TITLE}</h1>
            <p className={styles.desc}>
              4857 / 1475 sayılı İş Kanunu çerçevesinde giydirilmiş brüt ücret, tavan kontrolü ve damga
              vergisi kesintisiyle kıdem tazminatını anında hesaplayın.
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
          <section className={styles.card} style={{ animationDelay: "60ms" }} data-tour="kidem-tarihler">
            <h2 className={styles.cardTitle}>Tarih Bilgileri</h2>
            <div className={styles.basicGrid}>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>İşe Giriş</span>
                <input
                  type="date"
                  className={styles.dateInput}
                  value={iseGirisTarihi}
                  onChange={(e) => {
                    markKidemStarted();
                    setIseGirisTarihi(e.target.value);
                  }}
                />
              </label>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>İşten Çıkış</span>
                <div className={`${styles.dateWrap} ${dateError ? styles.inputWrapError : ""}`}>
                  <input
                    type="date"
                    className={styles.dateInput}
                    value={istenCikisTarihi}
                    onChange={(e) => {
                      markKidemStarted();
                      setIstenCikisTarihi(e.target.value);
                    }}
                    aria-invalid={dateError ? true : undefined}
                  />
                </div>
              </label>
              {dateError ? <p className={styles.errorText}>{dateError}</p> : null}
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Çalışma Süresi</span>
                <input className={styles.dateInput} value={result.durationLabel} readOnly />
              </label>
            </div>
          </section>

          <section className={styles.card} style={{ animationDelay: "100ms" }} data-tour="kidem-ciplak-brut">
            <h2 className={styles.cardTitle}>Çıplak Brüt (₺)</h2>
              <label className={styles.field}>
                <div className={styles.inputWrap}>
                  <input
                    className={styles.input}
                    inputMode="decimal"
                    value={ciplakBrut}
                    onChange={(e) => {
                      markKidemStarted();
                      setCiplakBrut(sanitizeMoneyTyping(e.target.value));
                    }}
                    placeholder="30.000,00"
                  />
                  <span className={styles.currency} aria-hidden>
                    ₺
                  </span>
                </div>
                {asgariUcretError ? <span className={styles.errorText}>{asgariUcretError}</span> : null}
              </label>
          </section>

          <section className={styles.card} style={{ animationDelay: "120ms" }} data-tour="kidem-ekstra">
            <div className={styles.cardTitleRow}>
              <h2 className={styles.cardTitle}>Ekstra Hesaplamalar</h2>
              <div className={styles.inlineActions}>
                <Button variant="soft" size="sm" onClick={loadExtraSets} disabled={setsBusy}>
                  <Download size={14} />
                  İçe Aktar
                </Button>
                <Button
                  variant="soft"
                  size="sm"
                  onClick={() => setShowExtraSaveModal(true)}
                  disabled={!hasExtraSetData || setsBusy}
                >
                  <Save size={14} />
                  Kaydet
                </Button>
              </div>
            </div>
            <div className={styles.wageGrid}>
              {[
                { label: "Prim", value: prim, field: "prim" as const, visible: true },
                { label: "İkramiye", value: ikramiye, field: "ikramiye" as const, visible: true },
                { label: "Yemek", value: yemek, field: "yemek" as const, visible: true },
                { label: "Yol", value: yol, field: "yol" as const, visible: true },
              ]
                .filter((item) => item.visible)
                .map(({ label, value, field }) => (
                <div key={field} className={styles.fixedExtraRow}>
                  <input className={styles.fixedExtraLabel} value={label} readOnly aria-label={`${label} kalemi`} />
                  <div className={styles.inputWrap}>
                    <input
                      className={styles.input}
                      inputMode="decimal"
                      value={value}
                      onChange={(e) => updateFixedExtra(field, sanitizeMoneyTyping(e.target.value))}
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
                    onClick={() => openEklenti({ kind: "field", field })}
                    title="12 aylık eklenti hesabı"
                  >
                    <Calculator size={13} />
                    Eklenti
                  </button>
                  <button
                    type="button"
                    className={styles.removeBtn}
                    onClick={() => updateFixedExtra(field, "")}
                    aria-label={`${label} tutarını temizle`}
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>

            <div className={styles.extraList}>
              {extras.map((item) => (
                <div
                  key={item.id}
                  className={`${styles.extraRow} ${removingIds.includes(item.id) ? styles.extraRowLeaving : ""}`}
                >
                  <input
                    className={styles.extraName}
                    value={item.name}
                    onChange={(e) => updateExtra(item.id, { name: e.target.value })}
                    placeholder="Kalem adı"
                    aria-label="Kalem adı"
                  />
                  <div className={styles.inputWrap}>
                    <input
                      className={styles.input}
                      inputMode="decimal"
                      value={item.value}
                      onChange={(e) => updateExtra(item.id, { value: sanitizeMoneyTyping(e.target.value) })}
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
                    onClick={() => openEklenti({ kind: "extra", id: item.id })}
                    title="12 aylık eklenti hesabı"
                  >
                    <Calculator size={13} />
                    Eklenti
                  </button>
                  <button
                    type="button"
                    className={styles.removeBtn}
                    onClick={() => removeExtra(item.id)}
                    aria-label={`${item.name || "Kalem"} sil`}
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
              <button type="button" className={styles.addRowBtn} onClick={addExtra}>
                <Plus size={14} />
                Kalem ekle
              </button>
            </div>
          </section>

          <div className={styles.grossSummary} style={{ animationDelay: "160ms" }}>
            <span>Toplam Brüt</span>
            <FlashValue value={`${formatMoney(result.giydirilmisAylik)} ₺`} />
          </div>

        </div>

        {/* ── Sağ: sonuçlar ── */}
        <div className={styles.resultCol} data-tour="kidem-sonuc">
          <div className={`${styles.totalCard} ${saveFlash ? styles.totalCardSaved : ""}`} style={{ animationDelay: "100ms" }}>
            <span className={styles.totalLabel}>Brüt Kıdem Tazminatı</span>
            <FlashValue className={styles.totalValue} value={`${formatMoney(result.brutKidem)} ₺`} />
            <span className={styles.totalMeta}>{result.durationLabel}</span>
          </div>

          {result.tavanApplied || result.shortTenureWarning ? (
            <article className={styles.panel} style={{ animationDelay: "140ms" }}>
              <header className={styles.panelHead}>
                <h3>Kıdem Tazminatı Uyarıları</h3>
              </header>
              <div className={styles.warningList} role="status">
                {result.tavanApplied && result.tavan != null ? (
                  <div className={styles.warningBanner}>
                    <AlertTriangle size={15} />
                    <span>
                      Aylık brüt ücret, dönem tavanı olan {formatMoney(result.tavan)}₺'yi aştığı için tavan
                      seviyesine çekilmiştir. Hesaplamalar tavan değeri üzerinden yapılmıştır.
                    </span>
                  </div>
                ) : null}
                {result.shortTenureWarning ? (
                  <div className={styles.warningBanner}>
                    <AlertTriangle size={15} />
                    <span>1 yılın altında çalışma süresine sahip olanlara kıdem tazminatı hakkı doğmaz.</span>
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
              {(result.duration?.years ?? 0) > 0 ? (
                <div className={styles.line}>
                  <span>{formatMoney(result.esasAylik)} × {result.duration?.years} yıl</span>
                  <span>{formatMoney(result.esasAylik * (result.duration?.years ?? 0))} ₺</span>
                </div>
              ) : null}
              {(result.duration?.months ?? 0) > 0 ? (
                <div className={styles.line}>
                  <span>{formatMoney(result.esasAylik)} / 12 × {result.duration?.months} ay</span>
                  <span>{formatMoney((result.esasAylik / 12) * (result.duration?.months ?? 0))} ₺</span>
                </div>
              ) : null}
              {(result.duration?.days ?? 0) > 0 ? (
                <div className={styles.line}>
                  <span>{formatMoney(result.esasAylik)} / 365 × {result.duration?.days} gün</span>
                  <span>{formatMoney((result.esasAylik / 365) * (result.duration?.days ?? 0))} ₺</span>
                </div>
              ) : null}
              <div className={`${styles.line} ${styles.netLine}`}>
                <span>Toplam Brüt Kıdem Tazminatı</span>
                <FlashValue value={`${formatMoney(result.brutKidem)} ₺`} />
              </div>
            </div>
          </article>

          <article className={styles.panel} style={{ animationDelay: "180ms" }}>
            <header className={styles.panelHead}>
              <h3>Brütten Nete</h3>
            </header>
            <div className={styles.panelBody}>
              <div className={styles.line}>
                <span>Brüt Kıdem Tazminatı</span>
                <FlashValue value={`${formatMoney(result.brutKidem)} ₺`} />
              </div>
              <div className={styles.line}>
                <span>Damga Vergisi (Binde 7,59)</span>
                <span className={styles.deduction}>-{formatMoney(result.damgaVergisi)} ₺</span>
              </div>
              <div className={`${styles.line} ${styles.netLine}`}>
                <span>Toplam Net Kıdem Tazminatı</span>
                <FlashValue value={`${formatMoney(result.netKidem)} ₺`} />
              </div>
            </div>
          </article>

          <section className={styles.card} style={{ animationDelay: "200ms" }}>
            <h2 className={styles.cardTitle}>Notlar</h2>
            <p className={styles.noteInfo}>{NOTE_INFO}</p>
          </section>
        </div>
      </div>

      {/* ── Sticky işlem çubuğu ── */}
      <div
        className={`${styles.stickyBar} ${isDirty ? styles.stickyBarDirty : ""} ${saveFlash ? styles.stickyBarSaved : ""}`}
        data-tour="kidem-kaydet-actions"
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

      <GuidedTourHost
        definition={KIDEM_IS_KANUNU_TOUR}
        active={tour.active}
        onActiveChange={tour.setActive}
        welcomeOpen={tour.welcomeOpen}
        onWelcomeOpenChange={tour.setWelcomeOpen}
        welcomeTitle="İlk kıdem hesabınızı birlikte yapalım mı?"
        welcomeBody="Kısa adımlarla hesaplamayı tamamlayın; ardından önizleyip kaydedebilirsiniz."
        welcomeStartLabel="Başlat"
        welcomeLaterLabel="Kendim devam edeceğim"
        welcomeNeverLabel="Bir daha gösterme"
        initialStepIndex={tour.resumeStepIndex}
        onCollectingComplete={() => {
          tour.completeTour();
          trackUsageEvent({
            eventType: "GUIDE_COMPLETED",
            moduleKey: KIDEM_30ISCI_TYPE,
            route: "/kidem-tazminati/30isci",
            guideVersion: KIDEM_IS_KANUNU_TOUR.version,
          });
          toast.info("Kılavuz tamamlandı. Hesaplamanızı önizleyebilir veya kaydedebilirsiniz.");
        }}
        onTourStarted={() => {
          trackUsageEvent({
            eventType: "GUIDE_STARTED",
            moduleKey: KIDEM_30ISCI_TYPE,
            route: "/kidem-tazminati/30isci",
            guideVersion: KIDEM_IS_KANUNU_TOUR.version,
            dedupeKey: "guide-started:kidem_30isci",
          });
        }}
        paused={showPreview}
      />

      <NameModal
        open={showExtraSaveModal}
        title="Ekstra Hesaplamaları Kaydet"
        description="Prim, ikramiye, yemek ve ek kalemleri ortak set olarak kaydedin."
        placeholder="Set adı"
        confirmLabel={setsBusy ? "Kaydediliyor…" : "Kaydet"}
        disabled={setsBusy}
        onClose={() => setShowExtraSaveModal(false)}
        onSave={persistExtraSet}
      />

      {showExtraImportModal ? (
        <div className={styles.modalOverlay} role="presentation" onClick={() => setShowExtraImportModal(false)}>
          <div className={styles.modalCard} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>Kaydedilmiş Setleri İçe Aktar</h2>
            {savedExtraSets.length === 0 ? (
              <p className={styles.emptyText}>Henüz kaydedilmiş set bulunmuyor.</p>
            ) : (
              <ul className={styles.setList}>
                {savedExtraSets.map((set) => (
                  <li key={set.id} className={styles.setRow}>
                    <div className={styles.setInfo}>
                      <strong>{set.name}</strong>
                      <span>{set.data.length} kalem</span>
                    </div>
                    <div className={styles.inlineActions}>
                      <Button variant="soft" size="sm" onClick={() => importExtraSet(set)} disabled={setsBusy}>
                        <Download size={13} />
                        İçe aktar
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
              Sonuç: <strong>{formatMoney(eklentiResult)} ₺</strong>
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
                        {formatMoney(c.result.brutKidem)} ₺ brüt · {c.result.durationLabel} ·{" "}
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
        contentId="is-kanunu-word-copy"
        moduleKey={KIDEM_30ISCI_TYPE}
        onClose={() => setShowPreview(false)}
      />

      {/* ── İsim modalı ── */}
      <NameModal
        open={showCaseSaveModal}
        title="Hesaplamayı Kaydet"
        description="Kaydedilen hesaplamalarınızda görünecek bir isim girin."
        placeholder="Örn: Hesaplama adı"
        confirmLabel={caseSaving ? "Kaydediliyor…" : "Kaydet"}
        initialValue={currentRecordName ?? ""}
        onClose={() => setShowCaseSaveModal(false)}
        onSave={(name) => {
          void persistCase(name);
        }}
      />

      {/* ── Onay modalları ── */}
      <ConfirmDialog
        open={deleteExtraTarget !== null}
        title="Seti sil"
        description={`“${deleteExtraTarget?.name ?? ""}” ekstra hesaplama seti silinecek. Bu işlem geri alınamaz.`}
        confirmLabel={setsBusy ? "Siliniyor…" : "Sil"}
        danger
        onConfirm={confirmDeleteExtraSet}
        onCancel={() => setDeleteExtraTarget(null)}
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
