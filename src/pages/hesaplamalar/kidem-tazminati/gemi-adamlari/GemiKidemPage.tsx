import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  CirclePlay,
  Download,
  Eye,
  FilePlus2,
  FolderOpen,
  Save,
  Ship,
  ShieldCheck,
  Trash2,
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
  mapGemiFormFromBackend,
  resolveSavedCaseDisplayName,
  gemiCaseCrud,
  buildGemiSaveResult,
  mapGemiRecordToSavedCase,
  KIDEM_GEMI_TYPE,
} from "./backendCase";
import { listKidemSavedCases } from "../shared/listKidemCases";
import { formatKidemMoneyFields } from "../shared/formatKidemMoneyFields";
import {
  computeEklentiResult,
  computeWorkDuration,
  deriveDateError,
  deriveGemiResult,
  deriveWarnings,
  fmtCurrency,
  isKidemHakkiYok,
  parseNum,
  sanitizeMoneyTyping,
} from "./engine";
import { deleteExtraSet, describeSetsError, listExtraSets, saveExtraSet } from "./extraSetsApi";
import {
  createEmptyGemiForm,
  newLocalId,
  type ExtraItem,
  type GemiFormSnapshot,
  type SavedExtraSet,
  type SavedGemiCase,
} from "./model";
import { clearCorruptCases, deleteCase, loadCasesSafe } from "./storage";
import { KIDEM_GEMI_TOUR } from "./guidedTour";
import styles from "./GemiKidemPage.module.css";
import tourStyles from "@/components/guided-tour/GuidedTour.module.css";

const PAGE_TITLE = "Gemi Adamları Kıdem Tazminatı";
const NOTE_INFO =
  "Gemi adamlarında kıdem tazminatı brütünden damga vergisi düşülür; gelir vergisi GVK 25/7 uyarınca çıplak brüt ücretin 24 katı muafiyet aşıldığında işten çıkış yılı tarifesine göre hesaplanır. Net = brüt − damga − gelir vergisi.";

type FixedField = "prim" | "ikramiye" | "yol" | "yemek" | "diger";
type EklentiTarget = { kind: "field"; field: FixedField } | { kind: "extra"; id: string };
type PendingAction = { kind: "new" } | { kind: "open"; caseId: string } | null;

const FIXED_FIELDS: Array<{ key: FixedField; label: string }> = [
  { key: "prim", label: "Prim" },
  { key: "ikramiye", label: "İkramiye" },
  { key: "yol", label: "Yol" },
  { key: "yemek", label: "Yemek" },
  { key: "diger", label: "Diğer" },
];

const FIXED_IDS = new Set<string>(["prim", "ikramiye", "yol", "yemek", "diger"]);

function eklentiKey(target: EklentiTarget): string {
  return target.kind === "field" ? `field:${target.field}` : `extra:${target.id}`;
}

function snapshotKey(s: GemiFormSnapshot): string {
  return JSON.stringify({
    s: s.startDate,
    e: s.endDate,
    c: s.ciplakBrut,
    p: s.prim,
    i: s.ikramiye,
    y: s.yol,
    m: s.yemek,
    d: s.diger,
    x: s.extras.map((it) => [it.name, it.value]),
    n: s.notes,
  });
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

export default function GemiKidemPage() {
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const caseIdParam = searchParams.get("caseId");
  const tour = useGuidedTourController();

  const [form, setForm] = useState<GemiFormSnapshot>(createEmptyGemiForm);
  const [currentRecordId, setCurrentRecordId] = useState<string | null>(null);
  const [currentRecordName, setCurrentRecordName] = useState<string | null>(null);
  const [savedCases, setSavedCases] = useState<SavedGemiCase[]>([]);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [baseline, setBaseline] = useState<string>(snapshotKey(createEmptyGemiForm()));
  const [caseLoading, setCaseLoading] = useState(false);
  const [caseSaving, setCaseSaving] = useState(false);
  const backendLoadedCaseIdRef = useRef<string | null>(null);

  const [showRecordsModal, setShowRecordsModal] = useState(false);
  const [showCaseSaveModal, setShowCaseSaveModal] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showExtraSaveModal, setShowExtraSaveModal] = useState(false);
  const [showExtraImportModal, setShowExtraImportModal] = useState(false);
  const [savedExtraSets, setSavedExtraSets] = useState<SavedExtraSet[]>([]);
  const [setsBusy, setSetsBusy] = useState(false);
  const [deleteExtraTarget, setDeleteExtraTarget] = useState<SavedExtraSet | null>(null);
  const [deleteCaseTarget, setDeleteCaseTarget] = useState<SavedGemiCase | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [saveFlash, setSaveFlash] = useState(false);
  const [formSwap, setFormSwap] = useState(false);
  const [removingIds, setRemovingIds] = useState<string[]>([]);
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
      const items = await listKidemSavedCases(KIDEM_GEMI_TYPE, mapGemiRecordToSavedCase);
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

  const duration = useMemo(() => computeWorkDuration(form.startDate, form.endDate), [form.startDate, form.endDate]);
  const dateError = useMemo(() => deriveDateError(form), [form]);
  const result = useMemo(() => deriveGemiResult(form), [form]);
  const tavanWarnings = useMemo(() => deriveWarnings(form), [form]);
  const kidemHakkiYok = useMemo(() => isKidemHakkiYok(duration), [duration]);
  const exitYear = form.endDate ? new Date(form.endDate).getFullYear() : new Date().getFullYear();

  const startedRef = useRef(false);
  const completedFingerprintRef = useRef<string | null>(null);

  const markKidemStarted = useCallback(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    trackUsageEvent({
      eventType: "CALCULATION_STARTED",
      moduleKey: KIDEM_GEMI_TYPE,
      route: "/kidem-tazminati/gemi",
      dedupeKey: "started:kidem_gemi",
    });
  }, []);

  useEffect(() => {
    const valid = !dateError && (result.brutKidem > 0 || result.netKidem > 0);
    if (!valid) return;
    const fingerprint = snapshotKey(form);
    if (completedFingerprintRef.current === fingerprint) return;
    completedFingerprintRef.current = fingerprint;
    trackUsageEvent({
      eventType: "CALCULATION_COMPLETED",
      moduleKey: KIDEM_GEMI_TYPE,
      route: "/kidem-tazminati/gemi",
    });
  }, [dateError, result.brutKidem, result.netKidem, form]);

  const asgariUcretError = useMemo(() => {
    const wage = parseNum(form.ciplakBrut);
    if (!form.ciplakBrut.trim() || !form.endDate || !wage) return null;
    const minimum = getAsgariUcretByDate(form.endDate);
    if (!minimum || wage >= minimum) return null;
    const year = new Date(form.endDate).getFullYear();
    return `Girilen ücret, ${year} yılı asgari brüt ücretinden düşük olamaz (${fmtCurrency(minimum)} ₺).`;
  }, [form.ciplakBrut, form.endDate]);

  const hasExtraSetData = useMemo(
    () =>
      [form.prim, form.ikramiye, form.yol, form.yemek, form.diger].some((v) => v.trim()) ||
      form.extras.length > 0,
    [form.prim, form.ikramiye, form.yol, form.yemek, form.diger, form.extras.length],
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
      else if (showExtraSaveModal) setShowExtraSaveModal(false);
      else if (showExtraImportModal) setShowExtraImportModal(false);
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

  const triggerFormSwap = () => {
    setFormSwap(true);
    window.setTimeout(() => setFormSwap(false), 480);
  };

  const resetFormFields = useCallback(() => {
    const fresh = createEmptyGemiForm();
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
    (c: SavedGemiCase) => {
      backendLoadedCaseIdRef.current = /^\d+$/.test(c.id) ? c.id : null;
      if (/^\d+$/.test(c.id)) {
        setCaseIdParam(c.id);
      } else {
        clearCaseIdParam();
      }
      const nextForm: GemiFormSnapshot = formatKidemMoneyFields({
        ...createEmptyGemiForm(),
        ...c.form,
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

  const applyBackendForm = useCallback((nextForm: GemiFormSnapshot, recordId: string, recordName: string) => {
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
        const mapped = mapGemiFormFromBackend(record.data, record);
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

  const patch = (partial: Partial<GemiFormSnapshot>) => setForm((prev) => ({ ...prev, ...partial }));

  const updateExtra = (id: string, patchItem: Partial<ExtraItem>) => {
    setForm((prev) => ({
      ...prev,
      extras: prev.extras.map((it) => (it.id === id ? { ...it, ...patchItem } : it)),
    }));
  };

  const removeExtra = (id: string) => {
    setRemovingIds((prev) => [...prev, id]);
    window.setTimeout(() => {
      setForm((prev) => ({ ...prev, extras: prev.extras.filter((it) => it.id !== id) }));
      setRemovingIds((prev) => prev.filter((x) => x !== id));
    }, 220);
  };

  const addExtra = () => {
    setForm((prev) => ({
      ...prev,
      extras: [...prev.extras, { id: newLocalId(), name: "Eklenti", value: "" }],
    }));
  };

  const collectExtraSetItems = (): ExtraItem[] => {
    const items: ExtraItem[] = [];
    if (form.prim.trim()) items.push({ id: "prim", name: "Prim", value: form.prim.trim() });
    if (form.ikramiye.trim()) items.push({ id: "ikramiye", name: "İkramiye", value: form.ikramiye.trim() });
    if (form.yol.trim()) items.push({ id: "yol", name: "Yol", value: form.yol.trim() });
    if (form.yemek.trim()) items.push({ id: "yemek", name: "Yemek", value: form.yemek.trim() });
    if (form.diger.trim()) items.push({ id: "diger", name: "Diğer", value: form.diger.trim() });
    form.extras.forEach((x) => items.push({ id: x.id, name: x.name, value: x.value }));
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
      toast.error("Kaydedilecek veri yok");
      return;
    }
    setSetsBusy(true);
    try {
      await saveExtraSet(name, items);
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
    const byId = new Map(set.data.map((item) => [item.id, item]));
    const findFixed = (id: FixedField, label: string) =>
      byId.get(id) ?? set.data.find((item) => item.name === label);

    setForm((prev) => ({
      ...prev,
      prim: findFixed("prim", "Prim")?.value ?? "",
      ikramiye: findFixed("ikramiye", "İkramiye")?.value ?? "",
      yol: findFixed("yol", "Yol")?.value ?? "",
      yemek: findFixed("yemek", "Yemek")?.value ?? "",
      diger: findFixed("diger", "Diğer")?.value ?? "",
      extras: set.data
        .filter((item) => !FIXED_IDS.has(item.id))
        .map((item) => ({
          id: item.id || newLocalId(),
          name: item.name || "",
          value: item.value || "",
        })),
    }));
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
      patch({ [eklentiFor.field]: formatted });
    } else {
      updateExtra(eklentiFor.id, { value: formatted });
    }
    setEklentiFor(null);
  };

  const persistCase = async (name: string) => {
    if (result.brutKidem <= 0 && result.netKidem <= 0) {
      toast.error("Önce geçerli bir hesaplama yapın");
      return;
    }
    setCaseSaving(true);
    const wasUpdate = !!(currentRecordId && /^\d+$/.test(currentRecordId));
    try {
      const record = await gemiCaseCrud.saveCase(
        name,
        form,
        buildGemiSaveResult(result.brutKidem, result.netKidem),
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
        await gemiCaseCrud.removeCase(targetId);
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

  const eklentiResult = eklentiFor
    ? computeEklentiResult(eklentiMonths[eklentiKey(eklentiFor)] ?? Array<string>(12).fill(""))
    : 0;

  const eklentiTitle = (() => {
    if (!eklentiFor) return "Eklenti Hesaplama";
    if (eklentiFor.kind === "extra") return "Eklenti Hesaplama";
    const map: Record<FixedField, string> = {
      prim: "Prim Hesaplama",
      ikramiye: "İkramiye Hesaplama",
      yol: "Yol Hesaplama",
      yemek: "Yemek Hesaplama",
      diger: "Diğer Hesaplama",
    };
    return map[eklentiFor.field];
  })();

  /* Önizleme — V3 başlıkları birebir */
  const previewSections = useMemo((): PreviewSection[] => {
    const money = (v: number) => `${fmtCurrency(v)} ₺`;
    const sections: PreviewSection[] = [];

    sections.push({
      id: "tarih",
      title: "Tarih Bilgileri",
      headers: ["İşe Giriş", "İşten Çıkış", "Çalışma Süresi"],
      rows: [
        [
          form.startDate ? new Date(form.startDate).toLocaleDateString("tr-TR") : "-",
          form.endDate ? new Date(form.endDate).toLocaleDateString("tr-TR") : "-",
          duration.label,
        ],
      ],
    });

    const extraRows: string[][] = [
      ["Çıplak Brüt", money(parseNum(form.ciplakBrut))],
      ["Prim", money(parseNum(form.prim))],
      ["İkramiye", money(parseNum(form.ikramiye))],
      ["Yemek", money(parseNum(form.yemek))],
    ];
    if (parseNum(form.yol) > 0) extraRows.push(["Yol", money(parseNum(form.yol))]);
    if (parseNum(form.diger) > 0) extraRows.push(["Diğer", money(parseNum(form.diger))]);
    form.extras.forEach((it) => {
      extraRows.push([it.name || "Ekstra", money(parseNum(it.value))]);
    });
    extraRows.push(["Toplam Brüt", money(result.toplamAylikBrut)]);
    sections.push({
      id: "ekstra",
      title: "Ekstra Hesaplamalar",
      headers: ["Kalem", "Tutar"],
      rows: extraRows,
      lastRowTone: "blue",
    });

    if (tavanWarnings.length > 0) {
      sections.push({
        id: "tavan",
        title: "Tavan Uyarısı",
        headers: ["Uyarı"],
        rows: tavanWarnings.map((w) => [w]),
      });
    }

    const kidemRows: string[][] = [];
    if (duration.years > 0) {
      kidemRows.push([
        `${fmtCurrency(result.kullanilacakBrut)} × ${duration.years} yıl`,
        money(result.kullanilacakBrut * duration.years),
      ]);
    }
    if (duration.months > 0) {
      kidemRows.push([
        `${fmtCurrency(result.kullanilacakBrut)} / 12 × ${duration.months} ay`,
        money((result.kullanilacakBrut / 12) * duration.months),
      ]);
    }
    if (duration.days > 0) {
      kidemRows.push([
        `${fmtCurrency(result.kullanilacakBrut)} / 365 × ${duration.days} gün`,
        money((result.kullanilacakBrut / 365) * duration.days),
      ]);
    }
    kidemRows.push(["Toplam Brüt Kıdem Tazminatı", money(result.brutKidem)]);
    sections.push({
      id: "kidem-hesaplama",
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
        ["Brüt kıdem tazminatı", money(result.brutKidem)],
        ["Damga vergisi (binde 7,59)", `-${money(result.damgaVergisi)}`],
        ["GVK 25/7 muafiyeti (24 × çıplak brüt)", money(result.muafiyetTutari)],
        [
          `Gelir vergisi (${exitYear})`,
          result.gelirVergisi > 0 ? `-${money(result.gelirVergisi)}` : money(0),
        ],
        ["Toplam Net Kıdem Tazminatı", money(result.netKidem)],
      ],
      lastRowTone: "green",
    });

    return sections;
  }, [form, duration, result, tavanWarnings, exitYear]);

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
            <Ship size={22} />
          </div>
          <div>
            <h1 className={styles.title}>{PAGE_TITLE}</h1>
            <p className={styles.desc}>
              Deniz iş ilişkisinde çalışma süresini takvimsel Yıl/Ay/Gün olarak hesaplayın; çıkış
              tarihindeki tavan, GVK 25/7 muafiyeti ve damga vergisi ile net kıdem tazminatını görün.
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
          <section className={styles.card} style={{ animationDelay: "60ms" }} data-tour="gemi-tarihler">
            <h2 className={styles.cardTitle}>Tarih Bilgileri</h2>
            <div className={styles.basicGrid}>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>İşe Giriş</span>
                <input
                  type="date"
                  className={styles.dateInput}
                  value={form.startDate}
                  onChange={(e) => {
                    markKidemStarted();
                    patch({ startDate: e.target.value });
                  }}
                />
              </label>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>İşten Çıkış</span>
                <input
                  type="date"
                  className={`${styles.dateInput} ${dateError ? styles.inputError : ""}`}
                  value={form.endDate}
                  onChange={(e) => {
                    markKidemStarted();
                    patch({ endDate: e.target.value });
                  }}
                  aria-invalid={dateError ? true : undefined}
                />
              </label>
              <label className={`${styles.field} ${styles.fieldWide}`}>
                <span className={styles.fieldLabel}>Çalışma Süresi</span>
                <input readOnly className={styles.readonlyInput} value={duration.label} />
              </label>
            </div>
            {dateError ? <p className={styles.errorText}>{dateError}</p> : null}
          </section>

          <section className={styles.card} style={{ animationDelay: "100ms" }} data-tour="gemi-ciplak-brut">
            <h2 className={styles.cardTitle}>Çıplak Brüt (₺)</h2>
            <label className={styles.field}>
              <div className={`${styles.inputWrap} ${asgariUcretError ? styles.inputWrapError : ""}`}>
                <input
                  className={styles.input}
                  inputMode="decimal"
                  value={form.ciplakBrut}
                  onChange={(e) => {
                    markKidemStarted();
                    patch({ ciplakBrut: sanitizeMoneyTyping(e.target.value) });
                  }}
                  placeholder="30.000,00"
                  aria-invalid={asgariUcretError ? true : undefined}
                />
                <span className={styles.currency} aria-hidden>
                  ₺
                </span>
              </div>
              {asgariUcretError ? <span className={styles.errorText}>{asgariUcretError}</span> : null}
            </label>
          </section>

          <section className={styles.card} style={{ animationDelay: "140ms" }} data-tour="gemi-ekstra">
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

            <div className={styles.extraList}>
              {FIXED_FIELDS.map(({ key, label }) => (
                <div key={key} className={styles.extraRow}>
                  <input value={label} readOnly className={`${styles.extraName} ${styles.extraNameReadonly}`} />
                  <div className={styles.inputWrap}>
                    <input
                      className={styles.input}
                      inputMode="decimal"
                      value={form[key]}
                      onChange={(e) => patch({ [key]: sanitizeMoneyTyping(e.target.value) })}
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
                    onClick={() => openEklenti({ kind: "field", field: key })}
                    title="Eklenti hesapla"
                  >
                    Eklenti
                  </button>
                  <button
                    type="button"
                    className={styles.removeBtn}
                    onClick={() => patch({ [key]: "" })}
                    aria-label={`${label} temizle`}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}

              {form.extras.map((item) => (
                <div
                  key={item.id}
                  className={`${styles.extraRow} ${removingIds.includes(item.id) ? styles.extraRowLeaving : ""}`}
                >
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
                    title="Eklenti hesapla"
                  >
                    Eklenti
                  </button>
                  <button
                    type="button"
                    className={styles.removeBtn}
                    onClick={() => removeExtra(item.id)}
                    aria-label={`${item.name || "Kalem"} sil`}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}

              <button type="button" className={styles.addRowBtn} onClick={addExtra}>
                + Kalem ekle
              </button>
            </div>
          </section>

          <div className={styles.toplamBrutBox} style={{ animationDelay: "180ms" }}>
            <span className={styles.toplamBrutLabel}>Toplam Brüt</span>
            <FlashValue className={styles.toplamBrutValue} value={`${fmtCurrency(result.toplamAylikBrut)} ₺`} />
          </div>

          {(tavanWarnings.length > 0 || kidemHakkiYok) && (
            <section className={styles.card} style={{ animationDelay: "200ms" }}>
              <h2 className={styles.cardTitle}>Kıdem Tazminatı Uyarıları</h2>
              <div className={styles.warningStack}>
                {tavanWarnings.map((w, i) => (
                  <div key={i} className={styles.warningBox} role="alert">
                    <p>{w}</p>
                  </div>
                ))}
                {kidemHakkiYok ? (
                  <div className={styles.warningBoxOrange} role="status">
                    <p>1 yılın altında çalışma süresine sahip olanlara kıdem tazminatı hakkı doğmaz.</p>
                  </div>
                ) : null}
              </div>
            </section>
          )}

        </div>

        <div className={styles.resultCol}>
          <div className={`${styles.totalCard} ${saveFlash ? styles.totalCardSaved : ""}`} style={{ animationDelay: "100ms" }}>
            <span className={styles.totalLabel}>Brüt Kıdem Tazminatı</span>
            <FlashValue className={styles.totalValue} value={`${fmtCurrency(result.brutKidem)} ₺`} />
            <span className={styles.totalMeta}>{duration.label}</span>
          </div>

          <article className={styles.panel} style={{ animationDelay: "160ms" }}>
            <header className={styles.panelHead}>
              <h3>Kıdem Tazminatı Hesaplaması</h3>
            </header>
            <div className={styles.panelBody}>
              {duration.years > 0 ? (
                <div className={styles.line}>
                  <span>
                    {fmtCurrency(result.kullanilacakBrut)} × {duration.years} yıl
                  </span>
                  <span>{fmtCurrency(result.kullanilacakBrut * duration.years)} ₺</span>
                </div>
              ) : null}
              {duration.months > 0 ? (
                <div className={styles.line}>
                  <span>
                    {fmtCurrency(result.kullanilacakBrut)} / 12 × {duration.months} ay
                  </span>
                  <span>{fmtCurrency((result.kullanilacakBrut / 12) * duration.months)} ₺</span>
                </div>
              ) : null}
              {duration.days > 0 ? (
                <div className={styles.line}>
                  <span>
                    {fmtCurrency(result.kullanilacakBrut)} / 365 × {duration.days} gün
                  </span>
                  <span>{fmtCurrency((result.kullanilacakBrut / 365) * duration.days)} ₺</span>
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
                <span>Brüt kıdem tazminatı</span>
                <FlashValue value={`${fmtCurrency(result.brutKidem)} ₺`} />
              </div>
              <div className={styles.line}>
                <span>Damga vergisi (binde 7,59)</span>
                <span className={styles.deduction}>-{fmtCurrency(result.damgaVergisi)} ₺</span>
              </div>
              <div className={styles.line}>
                <span>GVK 25/7 muafiyeti (24 × çıplak brüt)</span>
                <span>{fmtCurrency(result.muafiyetTutari)} ₺</span>
              </div>
              <div className={styles.line}>
                <span>Gelir vergisi ({exitYear})</span>
                <span className={result.gelirVergisi > 0 ? styles.deduction : undefined}>
                  {result.gelirVergisi > 0
                    ? `-${fmtCurrency(result.gelirVergisi)} ₺`
                    : `${fmtCurrency(0)} ₺`}
                </span>
              </div>
              <div className={`${styles.line} ${styles.netLine}`}>
                <span>Toplam Net Kıdem Tazminatı</span>
                <FlashValue value={`${fmtCurrency(result.netKidem)} ₺`} />
              </div>
            </div>
          </article>

          <section className={styles.card} style={{ animationDelay: "220ms" }}>
            <h2 className={styles.cardTitle}>Notlar</h2>
            <p className={styles.noteInfo}>{NOTE_INFO}</p>
          </section>
        </div>
      </div>

      <div
        className={`${styles.stickyBar} ${isDirty ? styles.stickyBarDirty : ""} ${saveFlash ? styles.stickyBarSaved : ""}`}
        data-tour="gemi-kaydet-actions"
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

      {eklentiFor ? (
        <div className={styles.modalOverlay} role="presentation" onClick={() => setEklentiFor(null)}>
          <div
            className={`${styles.modalCard} ${styles.modalWide}`}
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className={styles.modalTitle}>{eklentiTitle}</h2>
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

      {showExtraImportModal ? (
        <div className={styles.modalOverlay} role="presentation" onClick={() => setShowExtraImportModal(false)}>
          <div className={styles.modalCard} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>Kaydedilmiş Setler</h2>
            {savedExtraSets.length === 0 ? (
              <p className={styles.emptyText}>Kaydedilmiş set yok</p>
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
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => setDeleteExtraTarget(set)}
                        disabled={setsBusy}
                      >
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
        definition={KIDEM_GEMI_TOUR}
        active={tour.active}
        onActiveChange={tour.setActive}
        welcomeOpen={tour.welcomeOpen}
        onWelcomeOpenChange={tour.setWelcomeOpen}
        welcomeTitle="İlk Gemi Adamları kıdem hesabınızı birlikte yapalım mı?"
        welcomeBody="Birkaç kısa adımda hesaplamayı tamamlayın."
        welcomeStartLabel="Başlat"
        welcomeLaterLabel="Kendim devam edeceğim"
        welcomeNeverLabel="Bir daha gösterme"
        initialStepIndex={tour.resumeStepIndex}
        onCollectingComplete={() => {
          tour.completeTour();
          trackUsageEvent({
            eventType: "GUIDE_COMPLETED",
            moduleKey: KIDEM_GEMI_TYPE,
            route: "/kidem-tazminati/gemi",
            guideVersion: KIDEM_GEMI_TOUR.version,
          });
          toast.info("Kılavuz tamamlandı. Hesaplamanızı önizleyebilir veya kaydedebilirsiniz.");
        }}
        onTourStarted={() => {
          trackUsageEvent({
            eventType: "GUIDE_STARTED",
            moduleKey: KIDEM_GEMI_TYPE,
            route: "/kidem-tazminati/gemi",
            guideVersion: KIDEM_GEMI_TOUR.version,
            dedupeKey: "guide-started:kidem_gemi",
          });
        }}
        paused={showPreview}
      />

      <CalculationPreviewModal
        open={showPreview}
        title={PAGE_TITLE}
        sections={previewSections}
        contentId="gemi-word-copy"
        moduleKey={KIDEM_GEMI_TYPE}
        onClose={() => setShowPreview(false)}
      />

      <NameModal
        open={showExtraSaveModal}
        title="Ekstra Hesaplamaları Kaydet"
        placeholder="Set adı"
        confirmLabel={setsBusy ? "Kaydediliyor…" : "Kaydet"}
        onClose={() => setShowExtraSaveModal(false)}
        onSave={persistExtraSet}
      />

      <NameModal
        open={showCaseSaveModal}
        title="Hesaplamayı Kaydet"
        description="Kaydedilen hesaplamalarınızda görünecek bir isim girin."
        placeholder="Örn: Gemi adamı — dosya adı"
        confirmLabel={caseSaving ? "Kaydediliyor…" : "Kaydet"}
        initialValue={currentRecordName ?? ""}
        onClose={() => {
          if (!caseSaving) setShowCaseSaveModal(false);
        }}
        onSave={(name) => {
          void persistCase(name);
        }}
      />

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
