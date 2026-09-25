/**
 * Kıdem Tazminatı — Basın İş (5953 sayılı Kanun) — %100 izole sayfa.
 * Hesaplama motoru bu modüle özeldir; başka kıdem alt türüyle paylaşılmaz.
 * Ağ yalnızca ekstra hesaplama set CRUD için kullanılır.
 */

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
  Newspaper,
  Save,
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
import { mapBasinFormFromBackend, resolveSavedCaseDisplayName, basinCaseCrud, buildBasinSaveResult, mapBasinRecordToSavedCase, KIDEM_BASIN_TYPE } from "./backendCase";
import { listKidemSavedCases } from "../shared/listKidemCases";
import { formatKidemMoneyFields } from "../shared/formatKidemMoneyFields";
import { formatIsoDateTR } from "@/utils/dateDisplay";
import {
  adjustedTenure,
  calculateTotalBrut,
  clampDenemeSuresi,
  computeBrutKidem,
  computeCalismaSuresi,
  computeEklentiResult,
  computeKidemSuresi,
  deriveBrutNet,
  fmtCurrency,
  formatYilAyGun,
  kidemHakkiYok,
  parseNum,
  resolveExitYear,
  sanitizeIntTyping,
  sanitizeMoneyTyping,
} from "./engine";
import { emptyForm, newLocalId, type BasinFormSnapshot, type ExtraItem, type SavedCase, type SavedExtraSet } from "./model";
import { getAsgariUcretByDate } from "./asgariUcret";
import { deleteExtraSet, describeSetsError, listExtraSets, saveExtraSet } from "./extraSetsApi";
import { clearCorruptCases, deleteCase, loadCasesSafe } from "./storage";
import { KIDEM_BASIN_TOUR } from "./guidedTour";
import styles from "./BasinKidemPage.module.css";
import tourStyles from "@/components/guided-tour/GuidedTour.module.css";

const PAGE_TITLE = "Kıdem Tazminatı — Basın İş";
const NOTE_INFO =
  "Basın iş kıdem tazminatında kıdem süresi mesleğe başlangıç veya işe giriş tarihine göre hesaplanır; deneme süresi düşümü uygulanır. Brüt gün payı 365 güne göre bulunur. Net tutar, brüt tazminattan damga vergisi (binde 7,59) ve GVK 25/7 kapsamında gelir vergisi düşülerek hesaplanır.";
const EXTRA_HINT = "Ekstra Hesaplamalar (Prim, İkramiye, Yemek vb.)";
const FIXED_EXTRA_IDS = ["prim", "ikramiye", "yol", "yemek", "diger"] as const;
type FixedExtraField = (typeof FIXED_EXTRA_IDS)[number];

type EklentiTarget =
  | { kind: "field"; field: FixedExtraField }
  | { kind: "extra"; id: string };


type PendingAction = { kind: "new" } | { kind: "open"; caseId: string } | null;

function eklentiKey(target: EklentiTarget): string {
  return target.kind === "field" ? `field:${target.field}` : `extra:${target.id}`;
}

function formatEklentiValue(n: number): string {
  return n.toFixed(2).replace(".", ",");
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

export default function BasinKidemPage() {
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const caseIdParam = searchParams.get("caseId");
  const tour = useGuidedTourController();

  const [form, setForm] = useState<BasinFormSnapshot>(emptyForm);
  const [currentRecordId, setCurrentRecordId] = useState<string | null>(null);
  const [currentRecordName, setCurrentRecordName] = useState<string | null>(null);
  const [savedCases, setSavedCases] = useState<SavedCase[]>([]);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [caseLoading, setCaseLoading] = useState(false);
  const [caseSaving, setCaseSaving] = useState(false);
  const backendLoadedCaseIdRef = useRef<string | null>(null);

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
  const [baseline, setBaseline] = useState<string>("");

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

  const snapshotKey = (s: BasinFormSnapshot) =>
    JSON.stringify({
      ...s,
      extras: s.extras.map((i) => [i.name, i.value]),
    });

  const reloadCases = useCallback(async () => {
    try {
      const items = await listKidemSavedCases(KIDEM_BASIN_TYPE, mapBasinRecordToSavedCase);
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
    reloadCases();
    setBaseline(snapshotKey(emptyForm()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isDirty = useMemo(() => snapshotKey(form) !== baseline, [form, baseline]);

  /* ── Türetilmiş hesap sonuçları (engine — değişmez) ── */
  const kidemSuresi = useMemo(
    () => computeKidemSuresi(form.meslegeBaslangic, form.iseGiris, form.istenCikis, form.denemeSuresiGun),
    [form.meslegeBaslangic, form.iseGiris, form.istenCikis, form.denemeSuresiGun],
  );

  const calismaSuresi = useMemo(
    () => computeCalismaSuresi(form.iseGiris, form.istenCikis),
    [form.iseGiris, form.istenCikis],
  );

  const toplamBrutUcret = useMemo(
    () => calculateTotalBrut(form.ciplakBrut, form.prim, form.ikramiye, form.yol, form.yemek, form.diger, form.extras),
    [form.ciplakBrut, form.prim, form.ikramiye, form.yol, form.yemek, form.diger, form.extras],
  );

  const hakYok = useMemo(() => kidemHakkiYok(form.meslegeBaslangic, kidemSuresi.yil), [form.meslegeBaslangic, kidemSuresi.yil]);

  const hesaplanacak = useMemo(() => adjustedTenure(kidemSuresi, hakYok), [kidemSuresi, hakYok]);

  const brutKidem = useMemo(
    () => (hakYok ? 0 : computeBrutKidem(toplamBrutUcret, hesaplanacak)),
    [hakYok, toplamBrutUcret, hesaplanacak],
  );

  const exitYear = useMemo(() => resolveExitYear(form.istenCikis), [form.istenCikis]);
  const ciplakBrutValue = useMemo(() => parseNum(form.ciplakBrut), [form.ciplakBrut]);

  const brutNet = useMemo(
    () => deriveBrutNet(brutKidem, ciplakBrutValue, exitYear),
    [brutKidem, ciplakBrutValue, exitYear],
  );

  const startedRef = useRef(false);
  const completedFingerprintRef = useRef<string | null>(null);

  const markKidemStarted = useCallback(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    trackUsageEvent({
      eventType: "CALCULATION_STARTED",
      moduleKey: KIDEM_BASIN_TYPE,
      route: "/kidem-tazminati/basin",
      dedupeKey: "started:kidem_basin",
    });
  }, []);

  useEffect(() => {
    const valid = brutKidem > 0 || brutNet.net > 0;
    if (!valid) return;
    const fingerprint = snapshotKey(form);
    if (completedFingerprintRef.current === fingerprint) return;
    completedFingerprintRef.current = fingerprint;
    trackUsageEvent({
      eventType: "CALCULATION_COMPLETED",
      moduleKey: KIDEM_BASIN_TYPE,
      route: "/kidem-tazminati/basin",
    });
  }, [brutKidem, brutNet.net, form]);

  const asgariUcretError = useMemo(() => {
    const minimum = getAsgariUcretByDate(form.istenCikis);
    const wage = parseNum(form.ciplakBrut);
    if (!minimum || !wage || wage >= minimum) return null;
    const year = form.istenCikis.slice(0, 4);
    return `Girilen ücret, ${year} yılı asgari brüt ücretinden düşük olamaz (${fmtCurrency(minimum)}₺).`;
  }, [form.istenCikis, form.ciplakBrut]);

  const hasExtraSetData = useMemo(
    () =>
      [form.prim, form.ikramiye, form.yol, form.yemek, form.diger].some((v) => v.trim()) ||
      form.extras.some((item) => item.name.trim() || item.value.trim()),
    [form.prim, form.ikramiye, form.yol, form.yemek, form.diger, form.extras],
  );

  /* ── Escape ile üst modal kapanışı ── */
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
      else if (showRecordsModal) setShowRecordsModal(false);
      else if (showCaseSaveModal) setShowCaseSaveModal(false);
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

  /* ── Form işlemleri ── */
  const triggerFormSwap = () => {
    setFormSwap(true);
    window.setTimeout(() => setFormSwap(false), 480);
  };

  const resetFormFields = useCallback(() => {
    setForm(emptyForm());
    setCurrentRecordId(null);
    setCurrentRecordName(null);
    setEklentiMonths({});
    setBaseline(snapshotKey(emptyForm()));
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
      const nextForm: BasinFormSnapshot = formatKidemMoneyFields({
        ...emptyForm(),
        ...c.form,
        extras: (c.form.extras ?? []).map((i) => ({ id: i.id || newLocalId(), name: i.name, value: i.value })),
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

  const applyBackendForm = useCallback((nextForm: BasinFormSnapshot, recordId: string, recordName: string) => {
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
        const mapped = mapBasinFormFromBackend(record.data, record);
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

  const updateFixedExtra = (field: FixedExtraField, value: string) => {
    setForm((p) => ({ ...p, [field]: value }));
  };

  const updateExtra = (id: string, patch: Partial<ExtraItem>) => {
    setForm((p) => ({ ...p, extras: p.extras.map((row) => (row.id === id ? { ...row, ...patch } : row)) }));
  };

  const removeExtra = (id: string) => {
    setRemovingIds((prev) => [...prev, id]);
    window.setTimeout(() => {
      setForm((p) => ({ ...p, extras: p.extras.filter((row) => row.id !== id) }));
      setRemovingIds((prev) => prev.filter((x) => x !== id));
    }, 220);
  };

  const addExtra = () => {
    setForm((p) => ({ ...p, extras: [...p.extras, { id: newLocalId(), name: "", value: "" }] }));
  };

  /* ── Ekstra set CRUD ── */
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
    const byId = new Map(set.data.map((item) => [item.id, item]));
    setForm((p) => ({
      ...p,
      prim: byId.get("prim")?.value ?? "",
      ikramiye: byId.get("ikramiye")?.value ?? "",
      yol: byId.get("yol")?.value ?? "",
      yemek: byId.get("yemek")?.value ?? "",
      diger: byId.get("diger")?.value ?? "",
      extras: set.data
        .filter((item) => !FIXED_EXTRA_IDS.includes(item.id as FixedExtraField))
        .map((item) => ({
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

  /* ── Eklenti (12 aylık) ── */
  const openEklenti = (target: EklentiTarget) => {
    const key = eklentiKey(target);
    setEklentiMonths((prev) => (prev[key] ? prev : { ...prev, [key]: Array<string>(12).fill("") }));
    setEklentiFor(target);
  };

  const applyEklenti = () => {
    if (!eklentiFor) return;
    const key = eklentiKey(eklentiFor);
    const months = eklentiMonths[key] ?? Array<string>(12).fill("");
    const formatted = formatEklentiValue(computeEklentiResult(months) || 0);
    if (eklentiFor.kind === "field") {
      updateFixedExtra(eklentiFor.field, formatted);
    } else {
      updateExtra(eklentiFor.id, { value: formatted });
    }
    setEklentiFor(null);
  };

  /* ── Kayıt işlemleri — backend saved-cases ── */
  const persistCase = async (name: string) => {
    if (brutKidem <= 0 && brutNet.net <= 0) {
      toast.error("Önce geçerli bir hesaplama yapın");
      return;
    }
    setCaseSaving(true);
    const wasUpdate = !!(currentRecordId && /^\d+$/.test(currentRecordId));
    try {
      const record = await basinCaseCrud.saveCase(
        name,
        form,
        buildBasinSaveResult(brutKidem, brutNet.net),
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
        await basinCaseCrud.removeCase(targetId);
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

  /* ── Önizleme bölümleri (V3 başlıkları) ── */
  const previewSections = useMemo((): PreviewSection[] => {
    const money = (v: number) => `${fmtCurrency(v)} ₺`;
    const sections: PreviewSection[] = [];

    sections.push({
      id: "tarih",
      title: "Tarih Bilgileri",
      headers: ["Alan", "Değer"],
      rows: [
        ["Mesleğe başlangıç", formatIsoDateTR(form.meslegeBaslangic)],
        ["İşe giriş", formatIsoDateTR(form.iseGiris)],
        ["İşten çıkış", formatIsoDateTR(form.istenCikis)],
        ["Kıdem süresi (hesap)", formatYilAyGun(kidemSuresi)],
        ["Çalışma süresi", formatYilAyGun(calismaSuresi)],
      ],
    });

    const compRows: string[][] = [["Çıplak Brüt Ücret", money(parseNum(form.ciplakBrut))]];
    if (parseNum(form.prim) > 0) compRows.push(["Prim", money(parseNum(form.prim))]);
    if (parseNum(form.ikramiye) > 0) compRows.push(["İkramiye", money(parseNum(form.ikramiye))]);
    if (parseNum(form.yol) > 0) compRows.push(["Yol", money(parseNum(form.yol))]);
    if (parseNum(form.yemek) > 0) compRows.push(["Yemek", money(parseNum(form.yemek))]);
    if (parseNum(form.diger) > 0) compRows.push(["Diğer", money(parseNum(form.diger))]);
    form.extras
      .filter((i) => parseNum(i.value) > 0)
      .forEach((i, idx) => compRows.push([i.name || `Ek Kalem ${idx + 1}`, money(parseNum(i.value))]));
    if (compRows.length > 1) {
      sections.push({ id: "ekstra", title: "Ekstra Hesaplamalar", headers: ["Kalem", "Tutar"], rows: compRows });
    }

    if (hakYok) {
      sections.push({
        id: "hak",
        title: "Kıdem Tazminatı Hakkı",
        headers: ["Durum"],
        rows: [
          [
            "Mesleğe başlangıç girildiğinde, ilk kez kıdem alacaklar için 5 yıldan az kıdemde kıdem tazminatı hakkı doğmaz.",
          ],
        ],
      });
    } else {
      const hesapRows: string[][] = [["Aylık toplam brüt (bileşenler)", money(toplamBrutUcret)]];
      if (hesaplanacak.yil > 0) {
        hesapRows.push([
          `${fmtCurrency(toplamBrutUcret)} × ${hesaplanacak.yil} yıl`,
          money(toplamBrutUcret * hesaplanacak.yil),
        ]);
      }
      if (hesaplanacak.ay > 0) {
        hesapRows.push([
          `${fmtCurrency(toplamBrutUcret)} / 12 × ${hesaplanacak.ay} ay`,
          money((toplamBrutUcret / 12) * hesaplanacak.ay),
        ]);
      }
      if (hesaplanacak.gun > 0) {
        hesapRows.push([
          `${fmtCurrency(toplamBrutUcret)} / 365 × ${hesaplanacak.gun} gün`,
          money((toplamBrutUcret / 365) * hesaplanacak.gun),
        ]);
      }
      hesapRows.push(["Toplam Brüt Kıdem Tazminatı", money(brutKidem)]);
      sections.push({ id: "hesap", title: "Kıdem Hesabı", headers: ["Hesap", "Tutar"], rows: hesapRows, lastRowTone: "blue" });

      const netRows: string[][] = [["Brüt kıdem tazminatı", money(brutKidem)]];
      netRows.push(["Damga vergisi (binde 7,59)", `-${money(brutNet.damgaVergisi)}`]);
      if (brutNet.gelirVergisiUygulanacak) {
        netRows.push(["Gelir vergisi (matrah: brüt − 24 aylık istisna)", `-${money(brutNet.gelirVergisi)}`]);
      }
      netRows.push(["Toplam Net Kıdem Tazminatı", money(brutNet.net)]);
      sections.push({ id: "net", title: "Brütten Nete", headers: ["Kalem", "Tutar"], rows: netRows, lastRowTone: "green" });
    }

    return sections;
  }, [form, kidemSuresi, calismaSuresi, toplamBrutUcret, hakYok, hesaplanacak, brutKidem, brutNet]);

  const eklentiResult = eklentiFor
    ? computeEklentiResult(eklentiMonths[eklentiKey(eklentiFor)] ?? Array<string>(12).fill(""))
    : 0;

  const fixedRows: { field: FixedExtraField; label: string; value: string }[] = [
    { field: "prim", label: "Prim", value: form.prim },
    { field: "ikramiye", label: "İkramiye", value: form.ikramiye },
    { field: "yol", label: "Yol", value: form.yol },
    { field: "yemek", label: "Yemek", value: form.yemek },
    { field: "diger", label: "Diğer", value: form.diger },
  ];

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
            <Newspaper size={22} />
          </div>
          <div>
            <h1 className={styles.title}>Kıdem Tazminatı — Basın İş</h1>
            <p className={styles.desc}>
              5953 sayılı Basın İş Kanunu kapsamında kıdem tazminatı; 5 yıl / 6 ay kuralları, 365 günlük gün payı ve
              GVK 25/7 istisnasını aşan tutar için gelir vergisi ile birlikte hesaplanır.
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
          <section className={styles.card} style={{ animationDelay: "60ms" }} data-tour="basin-tarihler">
            <h2 className={styles.cardTitle}>Tarihler</h2>
            <p className={styles.cardHint}>
              Kıdem süresi, mesleğe başlangıç (veya işe giriş) ile işten çıkış arasında; deneme günü mesleğe başlangıca
              eklenir. Çalışma süresi işe giriş–çıkış arasıdır.
            </p>
            <div className={styles.grid3}>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Mesleğe başlangıç</span>
                <input
                  type="date"
                  max="9999-12-31"
                  value={form.meslegeBaslangic}
                  onChange={(e) => {
                    markKidemStarted();
                    setForm((p) => ({ ...p, meslegeBaslangic: e.target.value }));
                  }}
                  className={styles.dateInput}
                />
              </label>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>İşe giriş</span>
                <input
                  type="date"
                  max="9999-12-31"
                  value={form.iseGiris}
                  onChange={(e) => {
                    markKidemStarted();
                    setForm((p) => ({ ...p, iseGiris: e.target.value }));
                  }}
                  className={styles.dateInput}
                />
              </label>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>İşten çıkış</span>
                <input
                  type="date"
                  max="9999-12-31"
                  value={form.istenCikis}
                  onChange={(e) => {
                    markKidemStarted();
                    setForm((p) => ({ ...p, istenCikis: e.target.value }));
                  }}
                  className={styles.dateInput}
                />
              </label>
            </div>
            <div className={styles.grid2} style={{ marginTop: "0.7rem" }}>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Kıdem süresi (hesap)</span>
                <input type="text" readOnly value={formatYilAyGun(kidemSuresi)} className={`${styles.textInput} ${styles.readonlyInput}`} />
              </label>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Çalışma süresi</span>
                <input type="text" readOnly value={formatYilAyGun(calismaSuresi)} className={`${styles.textInput} ${styles.readonlyInput}`} />
              </label>
            </div>
          </section>

          <section className={styles.card} style={{ animationDelay: "120ms" }}>
            <h2 className={styles.cardTitle}>Ücret bilgileri</h2>
            <p className={styles.cardHint}>Aylık giydirilmiş brüt ve ek ödemeler (Basın İş).</p>

            <label className={styles.field} data-tour="basin-ciplak-brut">
              <span className={styles.fieldLabel}>Çıplak Brüt Ücret</span>
              <div className={styles.inputWrap}>
                <input
                  className={styles.input}
                  inputMode="decimal"
                  value={form.ciplakBrut}
                  onChange={(e) => {
                    markKidemStarted();
                    setForm((p) => ({ ...p, ciplakBrut: sanitizeMoneyTyping(e.target.value) }));
                  }}
                  placeholder="25.000,00"
                  aria-invalid={asgariUcretError ? true : undefined}
                />
                <span className={styles.currency} aria-hidden>
                  ₺
                </span>
              </div>
              {asgariUcretError ? <span className={styles.errorText}>{asgariUcretError}</span> : null}
            </label>

            <div className={styles.extraBlock} data-tour="basin-ekstra">
              <div className={styles.cardTitleRow}>
                <h3 className={styles.subCardTitle}>Ekstra Hesaplamalar</h3>
                <div className={styles.inlineActions}>
                  <Button variant="soft" size="sm" onClick={() => void loadExtraSets()} disabled={setsBusy}>
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
              <p className={styles.cardHint}>{EXTRA_HINT}</p>

              <div className={styles.wageGrid}>
                {fixedRows.map(({ field, label, value }) => (
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
                      Eklenti Hesapla
                    </button>
                    <button
                      type="button"
                      className={styles.removeBtn}
                      onClick={() => updateFixedExtra(field, "")}
                      aria-label={`${label} tutarını temizle`}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>

              <div className={styles.extraList}>
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
                      title="12 aylık eklenti hesabı"
                    >
                      <Calculator size={13} />
                      Eklenti Hesapla
                    </button>
                    <button
                      type="button"
                      className={styles.removeBtn}
                      onClick={() => removeExtra(item.id)}
                      aria-label="Sil"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
                <button type="button" className={styles.addRowBtn} onClick={addExtra}>
                  + Kalem ekle
                </button>
              </div>
            </div>
          </section>

          <section className={styles.card} style={{ animationDelay: "160ms" }} data-tour="basin-deneme">
            <h2 className={styles.cardTitle}>Deneme süresi düşümü (gün)</h2>
            <p className={styles.cardHint}>İsteğe bağlı; mesleğe başlangıç tarihine eklenir (en fazla 90 gün).</p>
            <label className={styles.field} style={{ maxWidth: "8rem" }}>
              <input
                type="text"
                inputMode="numeric"
                value={form.denemeSuresiGun}
                onChange={(e) => {
                  markKidemStarted();
                  setForm((p) => ({ ...p, denemeSuresiGun: sanitizeIntTyping(e.target.value) }));
                }}
                onBlur={() =>
                  setForm((p) => ({
                    ...p,
                    denemeSuresiGun: p.denemeSuresiGun ? String(clampDenemeSuresi(p.denemeSuresiGun)) : "",
                  }))
                }
                placeholder="0–90"
                className={styles.textInput}
                aria-label="Deneme süresi düşümü (gün)"
              />
            </label>
          </section>

        </div>

        {/* ── Sağ: sonuçlar ── */}
        <div className={styles.resultCol}>
          <div className={`${styles.totalCard} ${saveFlash ? styles.totalCardSaved : ""}`} style={{ animationDelay: "100ms" }}>
            <span className={styles.totalLabel}>Brüt Kıdem Tazminatı</span>
            <FlashValue className={styles.totalValue} value={`${fmtCurrency(brutKidem)} ₺`} />
            <span className={styles.totalMeta}>{formatYilAyGun(kidemSuresi)}</span>
          </div>

          {hakYok ? (
            <div className={styles.warningBanner} style={{ animationDelay: "140ms" }}>
              <AlertTriangle size={16} />
              <span>
                Mesleğe başlangıç girildiğinde, ilk kez kıdem alacaklar için 5 yıldan az kıdemde kıdem tazminatı hakkı
                doğmaz.
              </span>
            </div>
          ) : null}

          <article className={styles.panel} style={{ animationDelay: "180ms" }}>
            <header className={styles.panelHead}>
              <h3>Kıdem tazminatı hesaplaması</h3>
            </header>
            <div className={styles.panelBody}>
              {hakYok ? (
                <p className={styles.panelHint}>Hak koşulları sağlanmadığından brüt tazminat 0 olarak hesaplanır.</p>
              ) : (
                <>
                  {hesaplanacak.yil > 0 ? (
                    <div className={styles.line}>
                      <span>
                        {fmtCurrency(toplamBrutUcret)} × {hesaplanacak.yil} yıl
                      </span>
                      <span>{fmtCurrency(toplamBrutUcret * hesaplanacak.yil)} ₺</span>
                    </div>
                  ) : null}
                  {hesaplanacak.ay > 0 ? (
                    <div className={styles.line}>
                      <span>
                        {fmtCurrency(toplamBrutUcret)} / 12 × {hesaplanacak.ay} ay
                      </span>
                      <span>{fmtCurrency((toplamBrutUcret / 12) * hesaplanacak.ay)} ₺</span>
                    </div>
                  ) : null}
                  {hesaplanacak.gun > 0 ? (
                    <div className={styles.line}>
                      <span>
                        {fmtCurrency(toplamBrutUcret)} / 365 × {hesaplanacak.gun} gün
                      </span>
                      <span>{fmtCurrency((toplamBrutUcret / 365) * hesaplanacak.gun)} ₺</span>
                    </div>
                  ) : null}
                  <div className={`${styles.line} ${styles.netLine}`}>
                    <span>Toplam Brüt Kıdem Tazminatı</span>
                    <FlashValue value={`${fmtCurrency(brutKidem)} ₺`} />
                  </div>
                </>
              )}
            </div>
          </article>

          {!hakYok ? (
            <article className={styles.panel} style={{ animationDelay: "220ms" }}>
              <header className={styles.panelHead}>
                <h3>Brütten nete</h3>
              </header>
              <div className={styles.panelBody}>
                <p className={styles.panelHint}>
                  {brutNet.gelirVergisiUygulanacak
                    ? `Brüt kıdem, çıplak brütün 24 katını (${fmtCurrency(brutNet.esikDeger)}₺) aştığı için gelir vergisi uygulanır.`
                    : `Brüt kıdem, 24 aylık istisnayı aşmadığı için gelir vergisi uygulanmaz.`}{" "}
                  Damga vergisi binde 7,59 kesilir.
                </p>
                <div className={styles.line}>
                  <span>Brüt kıdem</span>
                  <span>{fmtCurrency(brutKidem)} ₺</span>
                </div>
                {brutNet.gelirVergisiUygulanacak ? (
                  <div className={styles.line}>
                    <span>Gelir vergisi</span>
                    <span className={styles.deduction}>-{fmtCurrency(brutNet.gelirVergisi)} ₺</span>
                  </div>
                ) : null}
                <div className={styles.line}>
                  <span>Damga vergisi</span>
                  <span className={styles.deduction}>-{fmtCurrency(brutNet.damgaVergisi)} ₺</span>
                </div>
                <div className={`${styles.line} ${styles.netLine}`}>
                  <span>Toplam Net Kıdem Tazminatı</span>
                  <FlashValue value={`${fmtCurrency(brutNet.net)} ₺`} />
                </div>
              </div>
            </article>
          ) : null}

          {!hakYok && brutKidem > 0 ? (
            <article className={styles.panel} style={{ animationDelay: "260ms" }}>
              <header className={styles.panelHead}>
                <h3>Taksitlendirme (bilgi)</h3>
              </header>
              <div className={styles.panelBody}>
                <p className={styles.panelHint}>
                  5953 sayılı Kanun m. 6: İşveren tazminatı tek seferde ödeyemezse en çok dört taksit, toplam süre bir
                  yılı geçemez.
                </p>
                {[1, 2, 3, 4].map((n) => (
                  <div key={n} className={styles.taksitRow}>
                    <span>{n}. taksit</span>
                    <span>{fmtCurrency(brutKidem / 4)} ₺</span>
                  </div>
                ))}
              </div>
            </article>
          ) : null}

          <section className={styles.card} style={{ animationDelay: "200ms" }}>
            <h2 className={styles.cardTitle}>Notlar</h2>
            <p className={styles.noteInfo}>{NOTE_INFO}</p>
          </section>
        </div>
      </div>

      {/* ── Sticky işlem çubuğu ── */}
      <div
        className={`${styles.stickyBar} ${isDirty ? styles.stickyBarDirty : ""} ${saveFlash ? styles.stickyBarSaved : ""}`}
        data-tour="basin-kaydet-actions"
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

      {/* ── Ekstra set kaydet ── */}
      <NameModal
        open={showExtraSaveModal}
        title="Ekstra Hesaplamaları Kaydet"
        description="Prim, ikramiye, yemek, diğer ve ek kalemleri ortak set olarak kaydedin."
        placeholder="Set adı"
        confirmLabel={setsBusy ? "Kaydediliyor…" : "Kaydet"}
        onClose={() => setShowExtraSaveModal(false)}
        onSave={(name) => void persistExtraSet(name)}
      />

      {/* ── Ekstra set içe aktar ── */}
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
            <h2 className={styles.modalTitle}>Eklenti Hesaplama</h2>
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

      {/* ── Kayıtlar modalı ── */}
      {showRecordsModal ? (
        <div className={styles.modalOverlay} role="presentation" onClick={() => setShowRecordsModal(false)}>
          <div className={styles.modalCard} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>Kayıtlı hesaplamalar</h2>
            {savedCases.length === 0 ? (
              <p className={styles.emptyText}>Henüz kayıt yok. &quot;Kaydet&quot; ile mevcut hesaplamayı saklayabilirsiniz.</p>
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
        definition={KIDEM_BASIN_TOUR}
        active={tour.active}
        onActiveChange={tour.setActive}
        welcomeOpen={tour.welcomeOpen}
        onWelcomeOpenChange={tour.setWelcomeOpen}
        welcomeTitle="İlk Basın İş kıdem hesabınızı birlikte yapalım mı?"
        welcomeBody="Birkaç kısa adımda hesaplamayı tamamlayın."
        welcomeStartLabel="Başlat"
        welcomeLaterLabel="Kendim devam edeceğim"
        welcomeNeverLabel="Bir daha gösterme"
        initialStepIndex={tour.resumeStepIndex}
        onCollectingComplete={() => {
          tour.completeTour();
          trackUsageEvent({
            eventType: "GUIDE_COMPLETED",
            moduleKey: KIDEM_BASIN_TYPE,
            route: "/kidem-tazminati/basin",
            guideVersion: KIDEM_BASIN_TOUR.version,
          });
          toast.info("Kılavuz tamamlandı. Hesaplamanızı önizleyebilir veya kaydedebilirsiniz.");
        }}
        onTourStarted={() => {
          trackUsageEvent({
            eventType: "GUIDE_STARTED",
            moduleKey: KIDEM_BASIN_TYPE,
            route: "/kidem-tazminati/basin",
            guideVersion: KIDEM_BASIN_TOUR.version,
            dedupeKey: "guide-started:kidem_basin",
          });
        }}
        paused={showPreview}
      />

      <CalculationPreviewModal
        open={showPreview}
        title={PAGE_TITLE}
        sections={previewSections}
        contentId="basin-word-copy"
        moduleKey={KIDEM_BASIN_TYPE}
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
        onClose={() => {
          if (!caseSaving) setShowCaseSaveModal(false);
        }}
        onSave={(name) => {
          void persistCase(name);
        }}
      />

      {/* ── Onay modalları ── */}
      <ConfirmDialog
        open={deleteExtraTarget !== null}
        title="Seti sil"
        description={`"${deleteExtraTarget?.name ?? ""}" seti silinecek. Bu işlem geri alınamaz.`}
        confirmLabel={setsBusy ? "Siliniyor…" : "Sil"}
        danger
        onConfirm={() => void confirmDeleteExtraSet()}
        onCancel={() => setDeleteExtraTarget(null)}
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
