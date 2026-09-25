/**
 * Yeraltı İşçisi Fazla Mesai — sayfa. Tasarım V3.5 (standart FM deseni); alanlar
 * ve metinler V3 "Yeraltı İşçileri Fazla Mesai" ile eşdeğerdir. Hesaplama %100
 * lokaldir (engine.ts); V3 backend `yeraltiIsci.service.js` ile aynı formül/
 * yuvarlama uygulanır ancak sunucuya çağrı yapılmaz. `?caseId=` ile kayıtlı V3
 * kaydı yalnızca form doldurmak için okunur; sonuç lokalde yeniden hesaplanır.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Calculator,
  CirclePlay,
  Clock3,
  Eye,
  FilePlus2,
  FolderOpen,
  History,
  Plus,
  Save,
  ShieldCheck,
  Trash2,
  XCircle,
} from "lucide-react";
import { ApiError } from "@/api/client";
import { CalculationPreviewModal, type PreviewSection } from "@/components/calculation-preview";
import { DraftDateInput, DraftTimeInput } from "@/components/form";
import { GuidedTourHost, useGuidedTourController } from "@/components/guided-tour";
import tourStyles from "@/components/guided-tour/GuidedTour.module.css";
import { Button } from "@/components/ui/Button";
import { useDeferredFormMemo } from "@/hooks/useDeferredFormMemo";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { useToast } from "@/context/ToastContext";
import {
  FM_YERALTI_TOUR,
  FM_YERALTI_TOUR_WELCOME_BODY,
  FM_YERALTI_TOUR_WELCOME_TITLE,
} from "./guidedTour";
import {
  listYeraltiFmCases,
  loadYeraltiFmCase,
  removeYeraltiFmCase,
  resolveSavedCaseDisplayName,
  saveYeraltiFmCase,
} from "./backendCase";
import type { FmSavedCaseListItem } from "../shared/fmBackendCrud";
import { CetvelTable } from "./CetvelTable";
import { ExclusionsPanel } from "./ExclusionsPanel";
import { KatsayiModal } from "./KatsayiModal";
import { MahsuplasamaModal } from "./MahsuplasamaModal";
import { MetinHesaplamasi } from "./MetinHesaplamasi";
import { UbgtPickerModal } from "./UbgtPickerModal";
import { ZamanasimiPickerModal } from "./ZamanasimiPickerModal";
import { ZamanasimiCetvelBanner } from "../shared/ZamanasimiCetvelBanner";
import { insertExclusionsPreviewSection } from "../shared/exclusionsPreview";
import { NotlarAccordion } from "../standart/NotlarAccordion";
import { formatIsoDateRangeTR, formatIsoDateTR } from "@/utils/dateDisplay";
import {
  createManualRow,
  formatMoney,
  isValidRange,
  parseKatsayi,
  sanitizeMoneyTyping,
} from "./engine";
import {
  computeYeraltiResultV3,
  logYeraltiFmV3EngineCheck,
} from "./v3-engine/adapter";
import {
  createEmptyForm,
  newLocalId,
  type ExclusionItem,
  type Mode270,
  type RowOverride,
  type SevenDayMode,
  type WitnessInput,
  type YeraltiFormSnapshot,
} from "./model";
import { isCetvelRowVisible } from "../cetvelDisplay";
import styles from "./YeraltiFmPage.module.css";

const PAGE_TITLE = "Yeraltı İşçileri Fazla Mesai Hesaplama";
const WEEKDAY_OPTIONS: { value: number; label: string }[] = [
  { value: 1, label: "Pazartesi" },
  { value: 2, label: "Salı" },
  { value: 3, label: "Çarşamba" },
  { value: 4, label: "Perşembe" },
  { value: 5, label: "Cuma" },
  { value: 6, label: "Cumartesi" },
  { value: 0, label: "Pazar" },
];

type PendingAction = { kind: "new" } | { kind: "open"; caseId: string } | null;

function snapshotKey(s: YeraltiFormSnapshot): string {
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

export default function YeraltiFmPage() {
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const caseIdParam = searchParams.get("caseId");

  const [form, setForm] = useState<YeraltiFormSnapshot>(() => createEmptyForm());

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

  const setField = <K extends keyof YeraltiFormSnapshot>(key: K, value: YeraltiFormSnapshot[K]) => {
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
      const items = await listYeraltiFmCases();
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

  const dateError = useMemo(() => {
    if (form.davaciDateIn && form.davaciDateOut && !isValidRange(form.davaciDateIn, form.davaciDateOut)) {
      return "İşten çıkış tarihi işe giriş tarihinden önce olamaz.";
    }
    return null;
  }, [form.davaciDateIn, form.davaciDateOut]);

  const result = useDeferredFormMemo(form, computeYeraltiResultV3);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    (window as unknown as { __yeraltiFmV3Check?: () => void }).__yeraltiFmV3Check = () =>
      logYeraltiFmV3EngineCheck(form);
    return () => {
      delete (window as unknown as { __yeraltiFmV3Check?: () => void }).__yeraltiFmV3Check;
    };
  }, [form]);

  const katSayiNum = parseKatsayi(form.katsayi);
  const hasCustomKatsayi = katSayiNum > 0 && katSayiNum !== 1;

  const mahsupYears = useMemo(() => {
    const years = new Set<number>();
    for (const row of result.rows) {
      const y = Number(row.startISO.slice(0, 4));
      if (Number.isFinite(y) && y > 1900) years.add(y);
    }
    return Array.from(years).sort((a, b) => a - b);
  }, [result.rows]);

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
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (deleteCaseTarget) setDeleteCaseTarget(null);
      else if (discardOpen) {
        setDiscardOpen(false);
        setPendingAction(null);
      } else if (showKatsayiModal) setShowKatsayiModal(false);
      else if (showMahsupModal) setShowMahsupModal(false);
      else if (showZamanasimiModal) setShowZamanasimiModal(false);
      else if (showUbgtPicker) setShowUbgtPicker(false);
      else if (showCaseSaveModal) setShowCaseSaveModal(false);
      else if (showPreview) setShowPreview(false);
      else if (showRecordsModal) setShowRecordsModal(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [showRecordsModal, showCaseSaveModal, showPreview, showUbgtPicker, showZamanasimiModal, showKatsayiModal, showMahsupModal, deleteCaseTarget, discardOpen]);

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

  const applyBackendForm = useCallback((loaded: YeraltiFormSnapshot, recordId: string, recordName: string) => {
    setForm(loaded);
    setCurrentRecordId(recordId);
    setCurrentRecordName(recordName);
    setBaseline(snapshotKey(loaded));
    triggerFormSwap();
  }, []);

  const applyOpenCase = useCallback(
    async (c: FmSavedCaseListItem) => {
      try {
        const { record, form: loaded } = await loadYeraltiFmCase(Number(c.id));
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

    void loadYeraltiFmCase(numericId)
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

  /* tanıklar */
  const addWitness = () => {
    const w: WitnessInput = { id: newLocalId("w"), name: "", dateIn: "", dateOut: "", in: "", out: "", weeklyDays: "" };
    setField("witnesses", [...form.witnesses, w]);
  };
  const updateWitness = (id: string, patch: Partial<WitnessInput>) => {
    setField(
      "witnesses",
      form.witnesses.map((w) => (w.id === id ? { ...w, ...patch } : w)),
    );
  };
  const removeWitness = (id: string) => {
    setField("witnesses", form.witnesses.filter((w) => w.id !== id));
  };

  /* istisnalar */
  const setExclusions = (next: ExclusionItem[]) => setField("exclusions", next);

  /* satır düzeltmeleri / + − (V3 paritesi) */
  const handleRowOverrideChange = (id: string, patch: RowOverride | null) => {
    setForm((prev) => {
      const next = { ...prev.rowOverrides };
      if (patch === null) delete next[id];
      else next[id] = patch;
      return { ...prev, rowOverrides: next };
    });
  };

  const handleAddRow = (afterId: string) => {
    const manual = createManualRow(afterId, parseKatsayi(form.katsayi), result.fmHoursWeekly || 0);
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

  const hiddenRowCount = Object.values(form.rowOverrides).filter((o) => o.hidden).length;
  const showHiddenRows = () => {
    setForm((prev) => {
      const next: Record<string, RowOverride> = {};
      for (const [id, ov] of Object.entries(prev.rowOverrides)) {
        if (ov.hidden) {
          const { hidden: _hidden, ...rest } = ov;
          if (Object.keys(rest).length > 0) next[id] = rest;
        } else {
          next[id] = ov;
        }
      }
      return { ...prev, rowOverrides: next };
    });
  };

  /* kayıt işlemleri */
  const persistCase = async (name: string) => {
    if (isSavingCase) return;
    setIsSavingCase(true);
    const wasUpdate = !!currentRecordId;
    try {
      const saved = await saveYeraltiFmCase(
        name,
        form,
        { toplamFm: result.totalFm, sonNet: result.sonNet, rowCount: result.rows.length },
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
        await removeYeraltiFmCase(deleteCaseTarget.id);
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

  /* önizleme bölümleri */
  const previewSections = useMemo((): PreviewSection[] => {
    const money = (v: number) => `${formatMoney(v)} ₺`;
    const sections: PreviewSection[] = [];
    const visibleRows = result.rows.filter(isCetvelRowVisible);

    sections.push({
      id: "temel",
      title: "Genel Bilgiler",
      headers: ["İşe Giriş", "İşten Çıkış", "Çalışma Süresi", "Haftalık FM Saat"],
      rows: [[
        formatIsoDateTR(form.davaciDateIn),
        formatIsoDateTR(form.davaciDateOut),
        `${form.weeklyDays} gün${form.weeklyDays === 7 ? ` (${form.sevenDayMode})` : ""}`,
        `${result.fmHoursWeekly.toFixed(2).replace(".", ",")} sa`,
      ]],
    });

    sections.push({
      id: "cetvel",
      title: "Fazla Mesai Hesaplama Cetveli (Yeraltı)",
      headers: ["Dönem", "Hafta", "Ücret (2×AU)", "Katsayı", "FM Saat", "187,5", "2", "Fazla Mesai"],
      rows: visibleRows.map((r) => [
        `${formatIsoDateRangeTR(r.startISO, r.endISO)}${r.note ? ` ${r.note}` : ""}`,
        String(r.weeks),
        money(r.brut),
        String(r.katsayi),
        r.fmHours.toFixed(2).replace(".", ","),
        "187,5",
        "2",
        money(r.fm),
      ]),
      lastRowTone: "blue",
    });

    sections.push({
      id: "brutten-nete",
      title: "Brüt'ten Net'e",
      headers: ["Kalem", "Tutar"],
      rows: [
        ["Brüt Fazla Mesai", money(result.totalFm)],
        ["SGK (%14)", `-${money(result.sgk)}`],
        ["İşsizlik (%1)", `-${money(result.issizlik)}`],
        [`Gelir Vergisi ${result.gelirVergisiDilimleri}`.trim(), `-${money(result.gelirVergisi)}`],
        ["Damga Vergisi (Binde 7,59)", `-${money(result.damgaVergisi)}`],
        ["Net Fazla Mesai", money(result.netYillik)],
      ],
      lastRowTone: "green",
    });

    sections.push({
      id: "hakkaniyet",
      title: "Mahsuplaşma",
      headers: ["Kalem", "Tutar"],
      rows: [
        ["Toplam Fazla Mesai (Brüt)", money(result.totalFm)],
        ["1/3 Hakkaniyet İndirimi", `-${money(result.hakkaniyetIndirimi)}`],
        ...(result.mahsupTutari > 0 ? ([["Mahsuplaşma Miktarı", `-${money(result.mahsupTutari)}`]] as string[][]) : []),
        ["Son Net Alacak", money(result.sonNet)],
      ],
      lastRowTone: "green",
    });

    return insertExclusionsPreviewSection(sections, form.exclusions);
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
            <Clock3 size={22} />
          </div>
          <div>
            <h1 className={styles.title}>{PAGE_TITLE}</h1>
            <p className={styles.desc}>
              Yeraltı işçileri için özel haftalık çalışma süresi ve fazla mesai hesabı; düşüm ve 270 kuralları cetvel
              ile uyumludur.
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
            <FlashValue className={styles.quickTotalValue} value={`${formatMoney(result.totalFm)} ₺`} />
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

      <div className={`${styles.singleColumn} ${formSwap ? styles.formSwap : ""}`}>
        <p className={styles.redNote}>
          Yeraltı işçileri: haftalık çalışma limiti 37:30; ücret tablosunda çift asgari ücret; bölücü 187,5 ve çarpan 2
          uygulanır.
        </p>

        <section className={styles.card} style={{ animationDelay: "60ms" }}>
          <div className={styles.cardTitleRow}>
            <h2 className={styles.cardTitle}>Davacı Tarih ve Saat Bilgileri</h2>
          </div>
          <div className={styles.basicGrid}>
            <div data-tour="fm-yeralti-donem" className={styles.basicGrid} style={{ gridColumn: "1 / -1" }}>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>İşe Giriş</span>
                <DraftDateInput
                  className={styles.dateInput}
                  value={form.davaciDateIn}
                  onCommit={(v) => setField("davaciDateIn", v)}
                />
              </label>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>İşten Çıkış</span>
                <div className={`${styles.dateWrap} ${dateError ? styles.inputWrapError : ""}`}>
                  <DraftDateInput
                    className={styles.dateInput}
                    value={form.davaciDateOut}
                    onCommit={(v) => setField("davaciDateOut", v)}
                    aria-invalid={dateError ? true : undefined}
                  />
                </div>
              </label>
            </div>
            {dateError ? <p className={styles.errorText}>{dateError}</p> : null}

            <label className={styles.field}>
              <span className={styles.fieldLabel}>Haftada Çalışılan Gün (1-7)</span>
              <select
                className={styles.selectInput}
                value={form.weeklyDays}
                onChange={(e) => setField("weeklyDays", Number(e.target.value))}
              >
                {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                  <option key={n} value={n}>
                    {n} gün
                  </option>
                ))}
              </select>
            </label>

            <div data-tour="fm-yeralti-saatler" className={styles.basicGrid} style={{ gridColumn: "1 / -1" }}>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Giriş Saati</span>
                <DraftTimeInput
                  className={styles.dateInput}
                  value={form.davaciIn}
                  onCommit={(v) => setField("davaciIn", v)}
                />
              </label>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Çıkış Saati</span>
                <DraftTimeInput
                  className={styles.dateInput}
                  value={form.davaciOut}
                  onCommit={(v) => setField("davaciOut", v)}
                />
              </label>
            </div>

            <label className={styles.field}>
              <span className={styles.fieldLabel}>Hafta Tatili Hangi Gün? (opsiyonel)</span>
              <select
                className={styles.selectInput}
                value={form.haftaTatiliGunu}
                onChange={(e) => setField("haftaTatiliGunu", e.target.value === "" ? "" : Number(e.target.value))}
              >
                <option value="">Seçilmedi</option>
                {WEEKDAY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>

        <section className={styles.card} style={{ animationDelay: "90ms" }} data-tour="fm-yeralti-taniklar">
          <div className={styles.cardTitleRow}>
            <h2 className={styles.cardTitle}>Tanık Beyanları</h2>
            <button type="button" className={styles.addRowBtn} onClick={addWitness}>
              <Plus size={14} />
              Tanık Ekle
            </button>
          </div>
          <p className={styles.panelHint}>
            Tanık beyanı girilirse, kesişen aralıklarda tanığın haftalık FM saati dikkate alınır; tanık yoksa yalnızca
            davacı beyanı kullanılır.
          </p>
          {form.witnesses.length === 0 ? (
            <p className={styles.emptyText}></p>
          ) : (
            <div className={styles.witnessList}>
              {form.witnesses.map((t, idx) => (
                <div key={t.id} className={styles.witnessRow}>
                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>İsim</span>
                    <input
                      type="text"
                      className={styles.extraName}
                      value={t.name}
                      placeholder={`Tanık ${idx + 1}`}
                      onChange={(e) => updateWitness(t.id, { name: e.target.value })}
                    />
                  </label>
                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>Başlangıç</span>
                    <input
                      type="date"
                      className={styles.extraName}
                      value={t.dateIn}
                      onChange={(e) => updateWitness(t.id, { dateIn: e.target.value })}
                    />
                  </label>
                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>Bitiş</span>
                    <input
                      type="date"
                      className={styles.extraName}
                      value={t.dateOut}
                      min={t.dateIn || undefined}
                      onChange={(e) => updateWitness(t.id, { dateOut: e.target.value })}
                    />
                  </label>
                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>Giriş</span>
                    <input
                      type="time"
                      className={styles.extraName}
                      value={t.in}
                      onChange={(e) => updateWitness(t.id, { in: e.target.value })}
                    />
                  </label>
                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>Çıkış</span>
                    <input
                      type="time"
                      className={styles.extraName}
                      value={t.out}
                      onChange={(e) => updateWitness(t.id, { out: e.target.value })}
                    />
                  </label>
                  <button
                    type="button"
                    className={styles.removeBtn}
                    onClick={() => removeWitness(t.id)}
                    title="Tanığı kaldır"
                    aria-label="Tanığı kaldır"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className={styles.card} style={{ animationDelay: "110ms" }}>
          <h2 className={styles.cardTitle}></h2>
          <div className={styles.grossSummary}>
            <span>Haftalık FM Saati</span>
            <FlashValue
              value={`${result.dailyHours.toFixed(2).replace(".", ",")} sa günlük · ${result.fmHoursWeekly
                .toFixed(2)
                .replace(".", ",")} sa haftalık fazla mesai`}
            />
          </div>
          <div style={{ marginTop: "0.75rem" }}>
            <MetinHesaplamasi
              davaciIn={form.davaciIn}
              davaciOut={form.davaciOut}
              weeklyDays={form.weeklyDays}
              sevenDayMode={form.sevenDayMode}
              onSevenDayModeChange={(mode: SevenDayMode) => setField("sevenDayMode", mode)}
              witnesses={form.witnesses}
            />
          </div>
        </section>

        <div data-tour="fm-yeralti-ayarlar" style={{ display: "grid", gap: "1rem", minWidth: 0 }}>
          <ExclusionsPanel
            exclusions={form.exclusions}
            onChange={setExclusions}
            onOpenUbgtPicker={() => setShowUbgtPicker(true)}
            visibleAfterIso={form.zamanasimi?.nihaiBaslangic ?? null}
            onOverlayOpenChange={setExclusionOverlayOpen}
          />

          <p className={styles.redNote}>
            Son haftaya isabet eden izin/UBGT düşümlerinde, tabloda görülen tarih aralığı 7 günden kısa olsa dahi hesaplama
            bu süre üzerinden yapılmaz. İlgili düşüm, üst satırdaki toplam haftadan 1 hafta eksiltilerek ayrı bir satırda 1
            hafta olarak dikkate alınmıştır.
          </p>

          <section className={styles.card} style={{ animationDelay: "150ms" }}>
            <h2 className={styles.cardTitle}></h2>
            <div className={styles.basicGrid}>
              <div className={styles.field}>
                <span className={styles.fieldLabel}>Kat Sayı</span>
                <button
                  type="button"
                  className={`${styles.zamanasimiBadge} ${hasCustomKatsayi ? styles.zamanasimiBadgeActive : ""}`}
                  onClick={() => setShowKatsayiModal(true)}
                  title={hasCustomKatsayi ? "Katsayıyı düzenle" : "Katsayı hesapla"}
                >
                  <Calculator size={13} />
                  {hasCustomKatsayi ? `Katsayı ${form.katsayi}` : "Kat Sayı"}
                </button>
              </div>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>270 Saat</span>
                <select
                  className={styles.selectInput}
                  value={form.mode270}
                  onChange={(e) => setField("mode270", e.target.value as Mode270)}
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
                  onClick={() => setShowZamanasimiModal(true)}
                >
                  <History size={13} />
                  {form.zamanasimi ? "Zamanaşımı" : "Zamanaşımı İtirazı"}
                </button>
              </div>
            </div>
          </section>
        </div>

        <ZamanasimiCetvelBanner nihaiBaslangic={form.zamanasimi?.nihaiBaslangic} />
        <CetvelTable
          rows={result.rows}
          rowOverrides={form.rowOverrides}
          onOverrideChange={handleRowOverrideChange}
          onAddRow={handleAddRow}
          onRemoveRow={handleRemoveRow}
          toplamFm={result.totalFm}
        />

        {hiddenRowCount > 0 ? (
          <button type="button" className={styles.addRowBtn} onClick={showHiddenRows}>
            <XCircle size={14} />
            Silinen {hiddenRowCount} otomatik satırı geri getir
          </button>
        ) : null}

        <article className={styles.panel} style={{ animationDelay: "180ms" }}>
          <header className={styles.panelHead}>
            <h3>Brütten Nete</h3>
          </header>
          <div className={styles.panelBody}>
            <div className={styles.line}>
              <span>Brüt Fazla Mesai</span>
              <FlashValue value={`${formatMoney(result.totalFm)} ₺`} />
            </div>
            <div className={styles.line}>
              <span>SGK (%14)</span>
              <span className={styles.deduction}>-{formatMoney(result.sgk)} ₺</span>
            </div>
            <div className={styles.line}>
              <span>İşsizlik (%1)</span>
              <span className={styles.deduction}>-{formatMoney(result.issizlik)} ₺</span>
            </div>
            <div className={styles.line}>
              <span>Gelir Vergisi {result.gelirVergisiDilimleri}</span>
              <span className={styles.deduction}>-{formatMoney(result.gelirVergisi)} ₺</span>
            </div>
            <div className={styles.line}>
              <span>Damga Vergisi (Binde 7,59)</span>
              <span className={styles.deduction}>-{formatMoney(result.damgaVergisi)} ₺</span>
            </div>
            <div className={`${styles.line} ${styles.netLine}`}>
              <span>Net Fazla Mesai</span>
              <FlashValue value={`${formatMoney(result.netYillik)} ₺`} />
            </div>
          </div>
        </article>

        <article className={styles.panel} style={{ animationDelay: "200ms" }}>
          <header className={styles.panelHead}>
            <h3>Hakkaniyet / Mahsuplaşma</h3>
          </header>
          <div className={styles.panelBody}>
            <div className={styles.line}>
              <span>Toplam (Brüt)</span>
              <span>{formatMoney(result.totalFm)} ₺</span>
            </div>
            <div className={styles.line}>
              <span>1/3 Hakkaniyet</span>
              <span className={styles.deduction}>-{formatMoney(result.hakkaniyetIndirimi)} ₺</span>
            </div>
            <div className={`${styles.line} ${styles.mahsupLine}`}>
              <span>Mahsuplaşma</span>
              <div className={styles.mahsupRow}>
                <div className={styles.inputWrap}>
                  <input
                    className={styles.input}
                    inputMode="decimal"
                    value={form.mahsup}
                    onChange={(e) => setField("mahsup", sanitizeMoneyTyping(e.target.value))}
                    placeholder="0"
                  />
                  <span className={styles.currency} aria-hidden>
                    ₺
                  </span>
                </div>
                <button
                  type="button"
                  className={styles.zamanasimiBadge}
                  onClick={() => setShowMahsupModal(true)}
                  title="Ay ve yıl bazında mahsuplaşma girin"
                >
                  Mahsuplaşma Ekle
                </button>
              </div>
            </div>
            <div className={`${styles.line} ${styles.netLine}`}>
              <span>Son Net</span>
              <FlashValue value={`${formatMoney(result.sonNet)} ₺`} />
            </div>
          </div>
        </article>

        <section className={styles.card} style={{ animationDelay: "220ms" }}>
          <NotlarAccordion />
        </section>
      </div>

      <div
        className={`${styles.stickyBar} ${isDirty ? styles.stickyBarDirty : ""} ${saveFlash ? styles.stickyBarSaved : ""}`}
        data-tour="fm-yeralti-kaydet-actions"
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
              Yeni Hesapla
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
                        {formatMoney(c.result.sonNet)} ₺ son net · {c.result.rowCount} satır ·{" "}
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
        contentId="fm-yeralti-word-copy"
        onClose={() => setShowPreview(false)}
      />

      <NameModal
        open={showCaseSaveModal}
        title="Hesaplamayı Kaydet"
        description="Kaydedilen hesaplamalarınızda görünecek bir isim girin. Kayıt yalnızca bu tarayıcıda saklanır."
        placeholder="Örn: Hesaplama adı"
        confirmLabel="Kaydet"
        initialValue={currentRecordName ?? ""}
        onClose={() => setShowCaseSaveModal(false)}
        onSave={persistCase}
      />

      <UbgtPickerModal
        open={showUbgtPicker}
        rangeStart={form.davaciDateIn}
        rangeEnd={form.davaciDateOut}
        exclusions={form.exclusions}
        onApply={setExclusions}
        onClose={() => setShowUbgtPicker(false)}
        visibleAfterIso={form.zamanasimi?.nihaiBaslangic ?? null}
      />

      <ZamanasimiPickerModal
        open={showZamanasimiModal}
        initial={form.zamanasimi}
        iseGiris={form.davaciDateIn}
        onApply={(info) => setField("zamanasimi", info)}
        onClear={() => setField("zamanasimi", null)}
        onClose={() => setShowZamanasimiModal(false)}
      />

      <KatsayiModal
        open={showKatsayiModal}
        currentKatsayi={katSayiNum}
        onApply={(k) => setField("katsayi", String(k).replace(".", ","))}
        onReset={() => setField("katsayi", "1")}
        onClose={() => setShowKatsayiModal(false)}
      />

      <MahsuplasamaModal
        open={showMahsupModal}
        years={mahsupYears}
        onSave={(total) => setField("mahsup", total > 0 ? formatMoney(total) : "")}
        onClose={() => setShowMahsupModal(false)}
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

      <GuidedTourHost
        definition={FM_YERALTI_TOUR}
        active={tour.active}
        onActiveChange={tour.setActive}
        welcomeOpen={tour.welcomeOpen}
        onWelcomeOpenChange={tour.setWelcomeOpen}
        welcomeTitle={FM_YERALTI_TOUR_WELCOME_TITLE}
        welcomeBody={FM_YERALTI_TOUR_WELCOME_BODY}
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
