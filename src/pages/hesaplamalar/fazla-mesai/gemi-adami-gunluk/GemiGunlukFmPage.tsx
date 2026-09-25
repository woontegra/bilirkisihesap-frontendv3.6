/**
 * Gemi Adamı — Günlük Çalışan Fazla Mesai (V3.5; V3 işlev/metin paritesi, lokal motor).
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
  FM_GEMI_GUNLUK_TOUR,
  FM_GEMI_GUNLUK_TOUR_WELCOME_BODY,
  FM_GEMI_GUNLUK_TOUR_WELCOME_TITLE,
} from "./guidedTour";
import {
  ManualBrutWageApplyControls,
  clearAllManualBrutFromRowOverrides,
  isManualBrutActiveInOverrides,
  mergeManualWageBrutsIntoRowOverrides,
} from "@/features/manual-brut-wage";
import {
  listGemiGunlukFmCases,
  loadGemiGunlukFmCase,
  removeGemiGunlukFmCase,
  resolveSavedCaseDisplayName,
  saveGemiGunlukFmCase,
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
  computeGemiGunlukResult,
  createManualPeriodRow,
  formatMoney,
  parseKatsayi,
  sanitizeMoneyTyping,
  validateDateRange,
} from "./engine";
import {
  createEmptyForm,
  createEmptyWitness,
  type ExclusionItem,
  type GemiGunlukFormSnapshot,
  type RowOverride,
  type SevenDayMode,
  type Witness,
} from "./model";
import styles from "./GemiGunlukFmPage.module.css";

const PAGE_TITLE = "Gemi Adamı — Günlük Çalışan Fazla Mesai";
const MODE_BLURB =
  "Günlük çalışan gemi adamı: haftalık yasal çalışma 48 saat; ara dinlenme ve haftalık gün sayısına göre FM saati hesaplanır (bölücü 240, çarpan 1,25). Tanık satırı doldurulmamışsa hesaplama davacı dönemi ve davacı saatleriyle yapılır.";

type PendingAction = { kind: "new" } | { kind: "open"; caseId: string } | null;

function snapshotKey(s: GemiGunlukFormSnapshot): string {
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

export default function GemiGunlukFmPage() {
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const caseIdParam = searchParams.get("caseId");

  const [form, setForm] = useState<GemiGunlukFormSnapshot>(() => createEmptyForm());
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

  const setField = <K extends keyof GemiGunlukFormSnapshot>(key: K, value: GemiGunlukFormSnapshot[K]) => {
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
      const items = await listGemiGunlukFmCases();
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
  const dateError = useMemo(() => validateDateRange(form.iseGiris, form.istenCikis), [form.iseGiris, form.istenCikis]);
  const result = useDeferredFormMemo(form, computeGemiGunlukResult);
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
    return Array.from(years).sort((a, b) => a - b);
  }, [result.rows]);

  const ubgtRange = useMemo(() => {
    let start = "";
    let end = "";
    for (const r of result.rows) {
      if (!r.startISO || !r.endISO) continue;
      if (!start || r.startISO < start) start = r.startISO;
      if (!end || r.endISO > end) end = r.endISO;
    }
    if (!start || !end) {
      return { start: form.iseGiris, end: form.istenCikis };
    }
    return { start, end };
  }, [result.rows, form.iseGiris, form.istenCikis]);

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

  const applyBackendForm = useCallback((loaded: GemiGunlukFormSnapshot, recordId: string, recordName: string) => {
    setForm(loaded);
    setCurrentRecordId(recordId);
    setCurrentRecordName(recordName);
    setBaseline(snapshotKey(loaded));
    triggerFormSwap();
  }, []);

  const applyOpenCase = useCallback(
    async (c: FmSavedCaseListItem) => {
      try {
        const { record, form: loaded } = await loadGemiGunlukFmCase(Number(c.id));
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

    void loadGemiGunlukFmCase(numericId)
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

  const setExclusions = (next: ExclusionItem[]) => setField("exclusions", next);

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
    const manual = createManualPeriodRow(kats, afterId);
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
          const { hidden: _h, ...rest } = ov;
          if (Object.keys(rest).length > 0) next[id] = rest;
        } else {
          next[id] = ov;
        }
      }
      return { ...prev, rowOverrides: next };
    });
  };

  const addWitness = () => {
    setForm((prev) => ({ ...prev, witnesses: [...prev.witnesses, createEmptyWitness(prev.witnesses.length + 1)] }));
  };

  const updateWitness = (id: string, patch: Partial<Witness>) => {
    setForm((prev) => ({
      ...prev,
      witnesses: prev.witnesses.map((w) => (w.id === id ? { ...w, ...patch } : w)),
    }));
  };

  const removeWitness = (id: string) => {
    setForm((prev) => {
      if (prev.witnesses.length <= 1) return prev;
      return { ...prev, witnesses: prev.witnesses.filter((w) => w.id !== id) };
    });
  };

  const persistCase = async (name: string) => {
    if (isSavingCase) return;
    setIsSavingCase(true);
    const wasUpdate = !!currentRecordId;
    try {
      const saved = await saveGemiGunlukFmCase(
        name,
        form,
        { toplamFm: result.toplamFm, sonNet: result.sonNet, rowCount: result.rows.length },
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
        await removeGemiGunlukFmCase(deleteCaseTarget.id);
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

  const previewSections = useMemo((): PreviewSection[] => {
    const money = (v: number) => `${formatMoney(v)} ₺`;
    return insertExclusionsPreviewSection(
      [
      {
        id: "ust",
        title: "Genel Bilgiler",
        headers: ["İşe Giriş", "İşten Çıkış", "Mod", "Haftalık FM saat"],
        rows: [
          [
            formatIsoDateTR(form.iseGiris),
            formatIsoDateTR(form.istenCikis),
            "Günlük",
            result.baselineWeeklyFmHours.toFixed(2),
          ],
        ],
      },
      {
        id: "cetvel",
        title: "Fazla Mesai Cetveli (Gemi)",
        headers: ["Dönem", "Hafta", "Ücret", "Kat", "FM Saat", "240", "1,25", "FM"],
        rows: result.rows.map((r) => [
          `${formatIsoDateRangeTR(r.startISO, r.endISO)}${r.yillikIzinAciklama || r.note ? ` ${r.yillikIzinAciklama || r.note}` : ""}`,
          String(r.weeks),
          money(r.brut),
          String(r.katsayi),
          r.fmHours.toFixed(2),
          "240",
          "1,25",
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
          [`Gelir Vergisi ${result.gelirVergisiDilimleri}`, `-${money(result.gelirVergisi)}`],
          ["Damga Vergisi", `-${money(result.damgaVergisi)}`],
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
          ["1/3 Hakkaniyet İndirimi", `-${money(result.hakkaniyetIndirimi)}`],
          ...(result.mahsupTutari > 0
            ? [["Mahsuplaşma Miktarı", `-${money(result.mahsupTutari)}`] as [string, string]]
            : []),
          ["Son Net Alacak", money(result.sonNet)],
        ],
        lastRowTone: "green",
      },
      ],
      form.exclusions,
    );
  }, [form, result]);

  return (
    <div className={styles.page} data-page="fazla-mesai-gemi-adami-gunluk">
      <header className={styles.hero}>
        <div className={styles.heroMain}>
          <div className={styles.heroIcon} aria-hidden>
            <Calculator size={22} />
          </div>
          <div>
            <h1 className={styles.title}>{PAGE_TITLE}</h1>
            <p className={styles.desc}>
              Günlük çalışma düzeninde gemi adamı fazla mesai hesabı; tanık beyanları ve düşümler cetvel ile uyumludur.
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
            <FlashValue className={styles.quickTotalValue} value={`${formatMoney(result.toplamFm)} ₺`} />
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

      {caseLoading ? <p className={styles.emptyText}>Kayıt yükleniyor…</p> : null}

      <div className={`${styles.singleColumn} ${formSwap ? styles.formSwap : ""}`}>
        <p className={styles.modeBlurb}>{MODE_BLURB}</p>

        <section className={styles.card} style={{ animationDelay: "60ms" }}>
          <div className={styles.cardTitleRow}>
            <h2 className={styles.cardTitle}>Dava dönemi</h2>
          </div>
          <div className={styles.basicGrid}>
            <div data-tour="fm-gemi-gunluk-donem" className={styles.basicGrid} style={{ gridColumn: "1 / -1" }}>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>İşe giriş</span>
                <DraftDateInput
                  className={styles.dateInput}
                  value={form.iseGiris}
                  onCommit={(v) => setField("iseGiris", v)}
                />
              </label>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>İşten çıkış</span>
                <div className={`${styles.dateWrap} ${dateError ? styles.inputWrapError : ""}`}>
                  <DraftDateInput
                    className={styles.dateInput}
                    value={form.istenCikis}
                    onCommit={(v) => setField("istenCikis", v)}
                    aria-invalid={dateError ? true : undefined}
                  />
                </div>
              </label>
            </div>
            {dateError ? <p className={`${styles.errorText} ${styles.gridSpanAll}`}>{dateError}</p> : null}
            <div className={styles.timePairRow} data-tour="fm-gemi-gunluk-saatler">
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Giriş saati</span>
                <DraftTimeInput
                  className={styles.dateInput}
                  value={form.davaciIn}
                  onCommit={(v) => setField("davaciIn", v)}
                />
              </label>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Çıkış saati</span>
                <DraftTimeInput
                  className={styles.dateInput}
                  value={form.davaciOut}
                  onCommit={(v) => setField("davaciOut", v)}
                />
              </label>
            </div>
            <label className={`${styles.field} ${styles.gridSpanAll}`}>
              <span className={styles.fieldLabel}>Haftada çalışılan gün</span>
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
          </div>
          <p className={styles.errorText} style={{ marginTop: "0.65rem" }}>
            Günlük modda giriş ve çıkış saatleri zorunludur. Tanık tarih/saatleri boş bırakılırsa hesaplama davacı dönemi ve bu saatlerle yapılır.
          </p>
        </section>

        <section className={styles.card} style={{ animationDelay: "90ms" }} data-tour="fm-gemi-gunluk-taniklar">
          <div className={styles.cardTitleRow}>
            <h2 className={styles.cardTitle}>Tanık beyanları</h2>
            <Button variant="soft" size="sm" onClick={addWitness}>
              <Plus size={14} />
              Tanık ekle
            </Button>
          </div>
          <p className={styles.panelHint}>
            Tanık tarihleri davacı dönemine göre sunucuda kırpılır. Tüm tanık satırlarında tarih ve saat eksikse, tek tanık gibi davacı beyanı kullanılır.
          </p>
          <div className={styles.witnessList}>
            {form.witnesses.map((t, idx) => (
              <div key={t.id} className={styles.witnessRow}>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>İsim</span>
                  <input
                    className={styles.input}
                    value={t.name}
                    onChange={(e) => updateWitness(t.id, { name: e.target.value })}
                    placeholder={`Tanık ${idx + 1}`}
                  />
                </label>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Başlangıç</span>
                  <input
                    type="date"
                    className={styles.input}
                    value={t.dateIn}
                    onChange={(e) => updateWitness(t.id, { dateIn: e.target.value })}
                  />
                </label>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Bitiş</span>
                  <input
                    type="date"
                    className={styles.input}
                    value={t.dateOut}
                    onChange={(e) => updateWitness(t.id, { dateOut: e.target.value })}
                  />
                </label>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Giriş</span>
                  <input
                    type="time"
                    className={styles.input}
                    value={t.in}
                    onChange={(e) => updateWitness(t.id, { in: e.target.value })}
                  />
                </label>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Çıkış</span>
                  <input
                    type="time"
                    className={styles.input}
                    value={t.out}
                    onChange={(e) => updateWitness(t.id, { out: e.target.value })}
                  />
                </label>
                <button
                  type="button"
                  className={styles.removeBtn}
                  onClick={() => removeWitness(t.id)}
                  disabled={form.witnesses.length <= 1}
                  aria-label="Tanığı sil"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </section>

        {form.weeklyDays === 7 ? (
          <div className={styles.sevenDayTabs}>
            <button
              type="button"
              className={`${styles.sevenDayTab} ${form.sevenDayMode === "tatilsiz" ? styles.sevenDayTabActive : ""}`}
              onClick={() => setField("sevenDayMode", "tatilsiz" as SevenDayMode)}
            >
              Hafta tatilsiz
            </button>
            <button
              type="button"
              className={`${styles.sevenDayTab} ${form.sevenDayMode === "tatilli" ? styles.sevenDayTabActive : ""}`}
              onClick={() => setField("sevenDayMode", "tatilli" as SevenDayMode)}
            >
              Hafta tatilli
            </button>
          </div>
        ) : null}

        <MetinHesaplamasi
          davaciIn={form.davaciIn}
          davaciOut={form.davaciOut}
          weeklyDays={form.weeklyDays}
          sevenDayMode={form.sevenDayMode}
          witnesses={form.witnesses}
        />

        <div data-tour="fm-gemi-gunluk-ayarlar" style={{ display: "grid", gap: "1rem", minWidth: 0 }}>
          <ExclusionsPanel
            exclusions={form.exclusions}
            onChange={setExclusions}
            onOpenUbgtPicker={() => setShowUbgtPicker(true)}
            visibleAfterIso={form.zamanasimi?.nihaiBaslangic ?? null}
            onOverlayOpenChange={setExclusionOverlayOpen}
          />

          <p className={styles.deductionNotice}>
            Son haftaya isabet eden izin/UBGT düşümlerinde, tabloda görülen tarih aralığı 7 günden kısa olsa dahi hesaplama bu süre üzerinden yapılmaz. İlgili düşüm, üst satırdaki toplam haftadan 1 hafta eksiltilerek ayrı bir satırda 1 hafta olarak dikkate alınmıştır.
          </p>

          <section className={styles.card} style={{ animationDelay: "150ms" }}>
            <div className={styles.basicGrid}>
              <div className={styles.field}>
                <span className={styles.fieldLabel}>Kat Sayı</span>
                <button
                  type="button"
                  className={`${styles.zamanasimiBadge} ${hasCustomKatsayi ? styles.zamanasimiBadgeActive : ""}`}
                  onClick={() => setShowKatsayiModal(true)}
                >
                  <Calculator size={13} />
                  {hasCustomKatsayi ? `Katsayı ${form.katSayi}` : "Kat Sayı"}
                </button>
              </div>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>270 Saat</span>
                <select
                  className={styles.selectInput}
                  value={form.mode270}
                  onChange={(e) => setField("mode270", e.target.value as GemiGunlukFormSnapshot["mode270"])}
                >
                  <option value="none">Kapalı</option>
                  <option value="simple">Yargıtay Uygulaması</option>
                  <option value="detailed">Şirket Uygulaması</option>
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
                >
                  <History size={13} />
                  {form.zamanasimi ? "Zamanaşımı" : "Zamanaşımı İtirazı"}
                </button>
              </div>
            </div>
            <p className={styles.toolbarHint}>
              270 ve zamanaşımı sunucuda uygulanır: Yargıtay seçeneğinde hafta değişmez, FM saatinden 5 saat 12 dakika düşülür; Şirket seçeneğinde hafta düşümü uygulanır.
            </p>
          </section>
        </div>

        {result.warnings.length > 0 ? (
          <article className={styles.panel} style={{ animationDelay: "155ms" }}>
            <header className={styles.panelHead}>
              <h3>Uyarılar</h3>
            </header>
            <div className={styles.warningList} role="status">
              {result.warnings.map((w) => (
                <div className={styles.warningBanner} key={w}>
                  <AlertTriangle size={15} />
                  <span>{w}</span>
                </div>
              ))}
            </div>
          </article>
        ) : null}

        <ZamanasimiCetvelBanner nihaiBaslangic={form.zamanasimi?.nihaiBaslangic} />
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

        {hiddenRowCount > 0 ? (
          <button type="button" className={styles.addRowBtn} onClick={showHiddenRows}>
            <XCircle size={14} />
            Silinen {hiddenRowCount} otomatik satırı geri getir
          </button>
        ) : null}

        <article className={styles.panel} style={{ animationDelay: "180ms" }}>
          <header className={styles.panelHead}>
            <h3>Brütten nete</h3>
          </header>
          <div className={styles.panelBody}>
            <div className={styles.line}>
              <span>Brüt</span>
              <span>{formatMoney(result.toplamFm)} ₺</span>
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
              <span>Gelir vergisi {result.gelirVergisiDilimleri}</span>
              <span className={styles.deduction}>-{formatMoney(result.gelirVergisi)} ₺</span>
            </div>
            <div className={styles.line}>
              <span>Damga</span>
              <span className={styles.deduction}>-{formatMoney(result.damgaVergisi)} ₺</span>
            </div>
            <div className={`${styles.line} ${styles.netLine}`}>
              <span>Net</span>
              <span>{formatMoney(result.netYillik)} ₺</span>
            </div>
          </div>
        </article>

        <article className={`${styles.panel} ${saveFlash ? styles.totalCardSaved : ""}`} style={{ animationDelay: "200ms" }}>
          <header className={styles.panelHead}>
            <h3>Hakkaniyet / mahsuplaşma</h3>
          </header>
          <div className={styles.panelBody}>
            <div className={`${styles.line} ${styles.mahsupLine}`}>
              <span>Mahsuplaşma</span>
              <div className={styles.mahsupRow}>
                <div className={styles.inputWrap}>
                  <input
                    className={styles.input}
                    inputMode="decimal"
                    value={form.mahsup}
                    onChange={(e) => setField("mahsup", sanitizeMoneyTyping(e.target.value))}
                    placeholder="0,00"
                  />
                  <span className={styles.currency} aria-hidden>
                    ₺
                  </span>
                </div>
                <button type="button" className={styles.zamanasimiBadge} onClick={() => setShowMahsupModal(true)}>
                  Mahsuplaşma ekle
                </button>
              </div>
            </div>
            <div className={styles.line}>
              <span>Toplam fazla mesai (brüt)</span>
              <span>{formatMoney(result.toplamFm)} ₺</span>
            </div>
            <div className={styles.line}>
              <span>1/3 hakkaniyet indirimi</span>
              <span className={styles.deduction}>-{formatMoney(result.hakkaniyetIndirimi)} ₺</span>
            </div>
            <div className={styles.line}>
              <span>Mahsuplaşma miktarı</span>
              <span className={styles.deduction}>-{formatMoney(result.mahsupTutari)} ₺</span>
            </div>
            <div className={`${styles.line} ${styles.netLine}`}>
              <span>Son net</span>
              <span>{formatMoney(result.sonNet)} ₺</span>
            </div>
          </div>
        </article>

        <section className={styles.card} style={{ animationDelay: "220ms" }}>
          <NotlarAccordion />
        </section>
      </div>

      <div className={`${styles.stickyBar} ${isDirty ? styles.stickyBarDirty : ""}`} data-tour="fm-gemi-gunluk-kaydet-actions">
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
            <Button variant="primary" size="sm" onClick={handleSaveCase} disabled={isSavingCase}>
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
              <p className={styles.emptyText}>Henüz kayıt yok.</p>
            ) : (
              <ul className={styles.setList}>
                {savedCases.map((c) => (
                  <li key={c.id} className={styles.setRow}>
                    <div className={styles.setInfo}>
                      <strong>{c.name}</strong>
                      <span>
                        {formatMoney(c.result.toplamFm)} ₺ brüt · {new Date(c.updatedAt).toLocaleDateString("tr-TR")}
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
        contentId="gemi-gunluk-fm-word-copy"
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
        rangeStart={ubgtRange.start}
        rangeEnd={ubgtRange.end}
        exclusions={form.exclusions}
        onApply={setExclusions}
        onClose={() => setShowUbgtPicker(false)}
        visibleAfterIso={form.zamanasimi?.nihaiBaslangic ?? null}
      />

      <ZamanasimiPickerModal
        open={showZamanasimiModal}
        initial={form.zamanasimi}
        iseGiris={form.iseGiris}
        onApply={(info) => setField("zamanasimi", info)}
        onClear={() => setField("zamanasimi", null)}
        onClose={() => setShowZamanasimiModal(false)}
      />

      <KatsayiModal
        open={showKatsayiModal}
        currentKatsayi={katSayiNum}
        onApply={(value) => setField("katSayi", value.toFixed(4).replace(".", ","))}
        onReset={() => setField("katSayi", "1")}
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
        definition={FM_GEMI_GUNLUK_TOUR}
        active={tour.active}
        onActiveChange={tour.setActive}
        welcomeOpen={tour.welcomeOpen}
        onWelcomeOpenChange={tour.setWelcomeOpen}
        welcomeTitle={FM_GEMI_GUNLUK_TOUR_WELCOME_TITLE}
        welcomeBody={FM_GEMI_GUNLUK_TOUR_WELCOME_BODY}
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
