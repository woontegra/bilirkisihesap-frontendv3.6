/**
 * 48 Saat Çalışma Hesaplama — V3.5 sayfa (V3 işlev / alan / metin paritesi).
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
  X,
} from "lucide-react";
import { ApiError } from "@/api/client";
import { CalculationPreviewModal, type PreviewSection } from "@/components/calculation-preview";
import { DraftDateInput } from "@/components/form";
import { GuidedTourHost, useGuidedTourController } from "@/components/guided-tour";
import tourStyles from "@/components/guided-tour/GuidedTour.module.css";
import { Button } from "@/components/ui/Button";
import { useDeferredFormMemo } from "@/hooks/useDeferredFormMemo";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { useToast } from "@/context/ToastContext";
import {
  FM_VARDIYA_48_TOUR,
  FM_VARDIYA_48_TOUR_WELCOME_BODY,
  FM_VARDIYA_48_TOUR_WELCOME_TITLE,
} from "./guidedTour";
import {
  ManualBrutWageApplyControls,
  clearAllManualBrutFromRowOverrides,
  isManualBrutActiveInOverrides,
  mergeManualWageBrutsIntoRowOverrides,
} from "@/features/manual-brut-wage";
import {
  listVardiya48FmCases,
  loadVardiya48FmCase,
  removeVardiya48FmCase,
  resolveSavedCaseDisplayName,
  saveVardiya48FmCase,
} from "./backendCase";
import type { FmSavedCaseListItem } from "../shared/fmBackendCrud";
import {
  computeVardiya48Result,
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
  type RowOverride,
  type Vardiya48FormSnapshot,
  type Witness,
} from "./model";
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
import styles from "./Vardiya48FmPage.module.css";

const PAGE_TITLE = "48 Saat Çalışma Hesaplama";

type PendingAction = { kind: "new" } | { kind: "open"; caseId: string } | null;

function snapshotKey(s: Vardiya48FormSnapshot): string {
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
  placeholder,
  confirmLabel,
  initialValue,
  onClose,
  onSave,
}: {
  open: boolean;
  title: string;
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

export default function Vardiya48FmPage() {
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const caseIdParam = searchParams.get("caseId");

  const [form, setForm] = useState<Vardiya48FormSnapshot>(() => createEmptyForm());
  /** Zamanaşımı — V3'te form.zamanasimi; burada form içinde tutulur. */
  const zamanasimi = form.zamanasimi;

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

  const setField = <K extends keyof Vardiya48FormSnapshot>(key: K, value: Vardiya48FormSnapshot[K]) => {
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
      const items = await listVardiya48FmCases();
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
  }, [reloadCases]);

  const isDirty = useMemo(() => snapshotKey(form) !== baseline, [form, baseline]);
  const dateError = useMemo(() => validateDateRange(form.iseGiris, form.istenCikis), [form.iseGiris, form.istenCikis]);
  const result = useDeferredFormMemo(form, computeVardiya48Result);

  const displayRows = useMemo(
    () =>
      result.rows.filter(
        (r) =>
          r.isManual ||
          ((Number(r.fmHours) || 0) !== 0 && (Number(r.weeks) || 0) !== 0 && (Number(r.fm) || 0) !== 0),
      ),
    [result.rows],
  );

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
    if (form.iseGiris) years.add(Number(form.iseGiris.slice(0, 4)));
    if (form.istenCikis) years.add(Number(form.istenCikis.slice(0, 4)));
    return Array.from(years).sort((a, b) => a - b);
  }, [result.rows, form.iseGiris, form.istenCikis]);

  const ubgtRange = useMemo(
    () => ({ start: form.iseGiris || "", end: form.istenCikis || "" }),
    [form.iseGiris, form.istenCikis],
  );

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

  const applyBackendForm = useCallback((loaded: Vardiya48FormSnapshot, recordId: string, recordName: string) => {
    setForm(loaded);
    setCurrentRecordId(recordId);
    setCurrentRecordName(recordName);
    setBaseline(snapshotKey(loaded));
    triggerFormSwap();
  }, []);

  const applyOpenCase = useCallback(
    async (c: FmSavedCaseListItem) => {
      try {
        const { record, form: loaded } = await loadVardiya48FmCase(Number(c.id));
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

    void loadVardiya48FmCase(numericId)
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

  const commitAction = (action: PendingAction) => {
    if (!action) return;
    if (action.kind === "new") {
      applyNewForm();
      return;
    }
    const found = savedCases.find((c) => c.id === action.caseId);
    if (found) applyOpenCase(found);
  };

  const requestAction = (action: PendingAction) => {
    if (isDirty) {
      setPendingAction(action);
      setDiscardOpen(true);
      return;
    }
    commitAction(action);
  };

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
    const manual = createManualPeriodRow(afterId, kats);
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

  const hiddenRowCount = Object.values(form.rowOverrides ?? {}).filter((o) => o.hidden).length;
  const showHiddenRows = () => {
    setForm((prev) => {
      const next: Record<string, RowOverride> = {};
      for (const [id, ov] of Object.entries(prev.rowOverrides ?? {})) {
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

  const addWitness = () => setField("taniklar", [...form.taniklar, createEmptyWitness()]);
  const removeWitness = (id: string) => {
    if (form.taniklar.length <= 1) return;
    setField(
      "taniklar",
      form.taniklar.filter((t) => t.id !== id),
    );
  };
  const updateWitness = (id: string, patch: Partial<Witness>) => {
    setField(
      "taniklar",
      form.taniklar.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    );
  };

  const persistCase = async (name: string) => {
    if (isSavingCase) return;
    setIsSavingCase(true);
    const wasUpdate = !!currentRecordId;
    try {
      const saved = await saveVardiya48FmCase(
        name,
        { ...form, mode270: "none" },
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
      window.setTimeout(() => setSaveFlash(false), 900);
      toast.success(wasUpdate ? "Kayıt güncellendi" : "Kayıt kaydedildi");
    } catch (error: unknown) {
      const message =
        error instanceof ApiError ? error.message : error instanceof Error ? error.message : "Kayıt kaydedilemedi";
      toast.error(message);
    } finally {
      setIsSavingCase(false);
    }
  };

  const handleSaveCase = () => {
    if (currentRecordId && currentRecordName) {
      persistCase(currentRecordName);
      return;
    }
    setShowCaseSaveModal(true);
  };

  const confirmDeleteCase = () => {
    if (!deleteCaseTarget) return;
    void (async () => {
      try {
        await removeVardiya48FmCase(deleteCaseTarget.id);
        if (currentRecordId === deleteCaseTarget.id) {
          backendLoadedCaseIdRef.current = null;
          applyNewForm();
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
    return insertExclusionsPreviewSection(
      [
      {
        id: "ust",
        title: "Genel Bilgiler",
        headers: ["İşe Giriş", "İşten Çıkış", "Mod"],
        rows: [[formatIsoDateTR(form.iseGiris), formatIsoDateTR(form.istenCikis), "48 saat (24/48)"]],
      },
      {
        id: "cetvel",
        title: "Fazla Mesai Cetveli",
        headers: ["Dönem", "Hafta Tipi", "Toplam Hafta", "Ücret (BRÜT)", "Katsayı", "Fazla Mesai Saati", "225", "1,5", "Fazla Mesai"],
        rows: [
          ...displayRows.map((r) => {
            const period = formatIsoDateRangeTR(r.startISO, r.endISO, "–");
            const withNote = r.yillikIzinAciklama ? `${period} ${r.yillikIzinAciklama}` : period;
            return [
              withNote,
              r.weekTypeLabel || "-",
              String(r.weeks),
              formatMoney(r.brut),
              String(r.katsayi),
              Number(r.fmHours || 0).toFixed(2),
              "225",
              "1,5",
              formatMoney(r.fm),
            ];
          }),
          ["", "", "", "", "", "", "", "Toplam", formatMoney(result.toplamFm)],
        ],
      },
      {
        id: "brutnet",
        title: "Brüt'ten Net'e",
        headers: ["Kalem", "Tutar"],
        rows: [
          ["Brüt Fazla Mesai", formatMoney(result.toplamFm)],
          ["SGK (%14)", `-${formatMoney(result.sgk)}`],
          ["İşsizlik (%1)", `-${formatMoney(result.issizlik)}`],
          [`Gelir Vergisi ${result.gelirVergisiDilimleri}`, `-${formatMoney(result.gelirVergisi)}`],
          ["Damga Vergisi", `-${formatMoney(result.damgaVergisi)}`],
          ["Net Fazla Mesai", formatMoney(result.netYillik)],
        ],
      },
      {
        id: "mahsup",
        title: "Mahsuplaşma",
        headers: ["Kalem", "Tutar"],
        rows: [
          ["Toplam Fazla Mesai (Brüt)", formatMoney(result.toplamFm)],
          ["1/3 Hakkaniyet İndirimi", `-${formatMoney(result.hakkaniyetIndirimi)}`],
          ...(result.mahsupTutari > 0
            ? [["Mahsuplaşma Miktarı", `-${formatMoney(result.mahsupTutari)}`]]
            : []),
          ["Son Net Alacak", formatMoney(result.sonNet)],
        ],
      },
      ],
      form.exclusions,
    );
  }, [form.iseGiris, form.istenCikis, displayRows, result]);

  return (
    <div className={`${styles.page} ${formSwap ? styles.formSwap : ""}`} data-page="fazla-mesai-vardiya-48">
      <header className={styles.hero}>
        <div className={styles.heroMain}>
          <div className={styles.heroIcon} aria-hidden>
            <Calculator size={22} />
          </div>
          <div>
            <h1 className={styles.title}>{PAGE_TITLE}</h1>
            <p className={styles.desc}>
              48 saatlik vardiya düzeninde haftalık fazla mesai hesabı; düşüm ve 270 kuralları cetvel ile uyumludur.
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
            <Button variant="soft" size="sm" type="button" onClick={() => setShowRecordsModal(true)}>
              <FolderOpen size={14} />
              Kayıtlar ({savedCases.length})
            </Button>
            <Button variant="soft" size="sm" type="button" onClick={() => requestAction({ kind: "new" })}>
              <FilePlus2 size={14} />
              Yeni Hesaplama
            </Button>
          </div>
        </div>
      </header>

      {casesError ? (
        <div className={styles.warnBanner} role="alert">
          <AlertTriangle size={16} />
          <span>{casesError}</span>
          <Button variant="soft" type="button" onClick={() => void reloadCases()}>
            Yeniden dene
          </Button>
        </div>
      ) : null}

      {caseLoading ? <p className={styles.panelHint}>Kayıt yükleniyor…</p> : null}
      {dateError ? (
        <div className={styles.warnBanner} role="alert">
          <AlertTriangle size={16} />
          <span>{dateError}</span>
        </div>
      ) : null}

      <div className={styles.formStack}>
        <section className={styles.card} style={{ animationDelay: "40ms" }} data-tour="fm-vardiya-48-donem">
          <h2 className={styles.cardTitle}>Dava dönemi</h2>
          <div className={styles.basicGrid}>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>İşe giriş</span>
              <DraftDateInput
                className={styles.input}
                value={form.iseGiris}
                onCommit={(v) => setField("iseGiris", v)}
              />
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>İşten çıkış</span>
              <DraftDateInput
                className={styles.input}
                value={form.istenCikis}
                onCommit={(v) => setField("istenCikis", v)}
              />
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Başlangıç vardiya günü</span>
              <select
                className={styles.selectInput}
                value={form.anchorIsWorkDay ? "work" : "rest"}
                onChange={(e) => setField("anchorIsWorkDay", e.target.value === "work")}
              >
                <option value="work">İlk gün çalıştı</option>
                <option value="rest">İlk gün dinlendi</option>
              </select>
            </label>
          </div>
        </section>

        <section className={styles.card} style={{ animationDelay: "70ms" }} data-tour="fm-vardiya-48-taniklar">
          <div className={styles.cardTitleRow}>
            <h2 className={styles.cardTitle}>Tanık beyanları (tarih aralığı)</h2>
            <Button variant="soft" type="button" onClick={addWitness}>
              <Plus size={14} />
              Tanık ekle
            </Button>
          </div>
          <p className={styles.panelHint}>
            Tanık tarihleri davacı dönemine göre kırpılır. Geçerli tanık aralığı yoksa hesaplama yalnızca davacı işe
            giriş–çıkış tarihleri üzerinden yapılır.
          </p>
          <div className={styles.witnessList}>
            {form.taniklar.map((t, idx) => (
              <div key={t.id} className={styles.witnessRow}>
                <label className={styles.field}>
                  <span>İsim</span>
                  <input
                    type="text"
                    className={styles.input}
                    value={t.name}
                    placeholder={`Tanık ${idx + 1}`}
                    onChange={(e) => updateWitness(t.id, { name: e.target.value })}
                  />
                </label>
                <label className={styles.field}>
                  <span>Başlangıç</span>
                  <input
                    type="date"
                    className={styles.input}
                    value={t.dateIn}
                    onChange={(e) => updateWitness(t.id, { dateIn: e.target.value })}
                  />
                </label>
                <label className={styles.field}>
                  <span>Bitiş</span>
                  <input
                    type="date"
                    className={styles.input}
                    value={t.dateOut}
                    onChange={(e) => updateWitness(t.id, { dateOut: e.target.value })}
                  />
                </label>
                <button
                  type="button"
                  className={styles.iconBtn}
                  disabled={form.taniklar.length <= 1}
                  onClick={() => removeWitness(t.id)}
                  aria-label="Sil"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </section>

        <MetinHesaplamasi anchorIsWorkDay={form.anchorIsWorkDay} />

        <div data-tour="fm-vardiya-48-ayarlar" style={{ display: "grid", gap: "1rem", minWidth: 0 }}>
          <ExclusionsPanel
            exclusions={form.exclusions}
            onChange={(next) => setField("exclusions", next)}
            onOpenUbgtPicker={() => setShowUbgtPicker(true)}
            visibleAfterIso={form.zamanasimi?.nihaiBaslangic ?? null}
            onOverlayOpenChange={setExclusionOverlayOpen}
          />

          <section className={styles.card} style={{ animationDelay: "140ms" }}>
            <h2 className={styles.cardTitle}>Diğer Ayarlar</h2>
            <div className={styles.basicGrid}>
              <div className={styles.field}>
                <span className={styles.fieldLabel}>Kat Sayı</span>
                <button
                  type="button"
                  className={`${styles.zamanasimiBadge} ${hasCustomKatsayi ? styles.zamanasimiBadgeActive : ""}`}
                  onClick={() => (hasCustomKatsayi ? setField("katSayi", "1") : setShowKatsayiModal(true))}
                >
                  <Calculator size={13} />
                  {hasCustomKatsayi ? `Katsayı ${katSayiNum.toFixed(2)}` : "Kat sayı"}
                </button>
              </div>
              <div className={styles.field}>
                <span className={styles.fieldLabel}>Zamanaşımı</span>
                <button
                  type="button"
                  className={`${styles.zamanasimiBadge} ${zamanasimi ? styles.zamanasimiBadgeActive : ""}`}
                  onClick={() => (zamanasimi ? setField("zamanasimi", null) : setShowZamanasimiModal(true))}
                >
                  <History size={13} />
                  {zamanasimi ? "Zamanaşımı" : "Zamanaşımı itirazı"}
                </button>
              </div>
            </div>
          </section>
        </div>

        <ZamanasimiCetvelBanner nihaiBaslangic={zamanasimi?.nihaiBaslangic} />

        {hiddenRowCount > 0 ? (
          <div className={styles.infoBanner}>
            <span>{hiddenRowCount} satır gizlendi.</span>
            <Button variant="soft" type="button" onClick={showHiddenRows}>
              Gizlenenleri göster
            </Button>
          </div>
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
            <h3>Brütten nete</h3>
          </header>
          <div className={styles.totalsGrid}>
            <div>
              <span>Brüt</span>
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
              <span>Gelir vergisi {result.gelirVergisiDilimleri}</span>
              <span>−{formatMoney(result.gelirVergisi)} ₺</span>
            </div>
            <div>
              <span>Damga</span>
              <span>−{formatMoney(result.damgaVergisi)} ₺</span>
            </div>
            <div className={styles.totalsHighlight}>
              <span>Net</span>
              <FlashValue value={`${formatMoney(result.netYillik)} ₺`} />
            </div>
          </div>
        </article>

        <article className={styles.panel} style={{ animationDelay: "200ms" }}>
          <header className={styles.panelHead}>
            <h3>Hakkaniyet indirimi / mahsuplaşma</h3>
          </header>
          <p className={styles.panelHint}>
            Son net alacak, brüt fazla mesai üzerinden 1/3 hakkaniyet indirimi ve (varsa) mahsuplaşma düşülerek
            hesaplanır. Brütten nete bölümündeki vergi kesintileri ayrıdır.
          </p>
          <div className={styles.totalsGrid}>
            <div>
              <span>Toplam fazla mesai (brüt)</span>
              <span>{formatMoney(result.toplamFm)} ₺</span>
            </div>
            <div>
              <span>1/3 hakkaniyet indirimi</span>
              <span>−{formatMoney(result.hakkaniyetIndirimi)} ₺</span>
            </div>
            {result.mahsupTutari > 0 ? (
              <div>
                <span>Mahsuplaşma</span>
                <span>−{formatMoney(result.mahsupTutari)} ₺</span>
              </div>
            ) : null}
            <div>
              <span>Mahsuplaşma miktarı</span>
              <div className={styles.mahsupRow}>
                <input
                  className={styles.input}
                  value={form.mahsuplasmaMiktari}
                  onChange={(e) => setField("mahsuplasmaMiktari", sanitizeMoneyTyping(e.target.value))}
                  placeholder="0"
                  inputMode="decimal"
                />
                <Button variant="soft" type="button" onClick={() => setShowMahsupModal(true)}>
                  Mahsuplaşma ekle
                </Button>
              </div>
            </div>
            <div className={styles.totalsHighlight}>
              <span>Son net alacak</span>
              <FlashValue value={`${formatMoney(result.sonNet)} ₺`} className={styles.sonNet} />
            </div>
          </div>
        </article>

        <section className={styles.card} style={{ animationDelay: "220ms" }}>
          <NotlarAccordion />
        </section>
      </div>

      <div
        className={`${styles.stickyBar} ${isDirty ? styles.stickyBarDirty : ""} ${saveFlash ? styles.stickyBarSaved : ""}`}
        data-tour="fm-vardiya-48-kaydet-actions"
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
          <div className={styles.modalCardWide} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHead}>
              <h2 className={styles.modalTitle}>Kayıtlarım</h2>
              <button type="button" className={styles.iconBtn} onClick={() => setShowRecordsModal(false)}>
                <X size={16} />
              </button>
            </div>
            {savedCases.length === 0 ? (
              <p className={styles.emptyText}>Henüz kayıt yok.</p>
            ) : (
              <ul className={styles.recordsList}>
                {savedCases.map((c) => (
                  <li key={c.id} className={styles.recordItem}>
                    <div>
                      <strong>{c.name}</strong>
                      <span className={styles.recordMeta}>
                        {new Date(c.updatedAt).toLocaleString("tr-TR")} · {formatMoney(c.result.toplamFm)} ₺
                      </span>
                    </div>
                    <div className={styles.recordActions}>
                      <Button variant="soft" type="button" onClick={() => requestAction({ kind: "open", caseId: c.id })}>
                        Aç
                      </Button>
                      <Button variant="soft" type="button" onClick={() => setDeleteCaseTarget(c)}>
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}

      <NameModal
        open={showCaseSaveModal}
        title="Kaydı Adlandır"
        placeholder="Örn. Dosya 2024/123"
        confirmLabel="Kaydet"
        onClose={() => setShowCaseSaveModal(false)}
        onSave={persistCase}
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

      <ZamanasimiPickerModal
        open={showZamanasimiModal}
        initial={form.zamanasimi}
        iseGiris={form.iseGiris}
        onApply={(z) => setField("zamanasimi", z)}
        onClear={() => setField("zamanasimi", null)}
        onClose={() => setShowZamanasimiModal(false)}
      />

      <MahsuplasamaModal
        open={showMahsupModal}
        years={mahsupYears}
        onSave={(total) => {
          setField("mahsuplasmaMiktari", formatMoney(total));
          setShowMahsupModal(false);
        }}
        onClose={() => setShowMahsupModal(false)}
      />

      <UbgtPickerModal
        open={showUbgtPicker}
        rangeStart={ubgtRange.start}
        rangeEnd={ubgtRange.end}
        exclusions={form.exclusions}
        onApply={(next: ExclusionItem[]) => {
          setField("exclusions", next);
          setShowUbgtPicker(false);
        }}
        onClose={() => setShowUbgtPicker(false)}
        visibleAfterIso={form.zamanasimi?.nihaiBaslangic ?? null}
      />

      <CalculationPreviewModal
        open={showPreview}
        title={PAGE_TITLE}
        sections={previewSections}
        contentId="fm-vardiya-48-word-copy"
        onClose={() => setShowPreview(false)}
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

      <ConfirmDialog
        open={!!deleteCaseTarget}
        title="Kaydı sil"
        description={deleteCaseTarget ? `"${deleteCaseTarget.name}" kaydı silinecek. Bu işlem geri alınamaz.` : ""}
        confirmLabel="Sil"
        cancelLabel="İptal"
        danger
        onConfirm={confirmDeleteCase}
        onCancel={() => setDeleteCaseTarget(null)}
      />

      <GuidedTourHost
        definition={FM_VARDIYA_48_TOUR}
        active={tour.active}
        onActiveChange={tour.setActive}
        welcomeOpen={tour.welcomeOpen}
        onWelcomeOpenChange={tour.setWelcomeOpen}
        welcomeTitle={FM_VARDIYA_48_TOUR_WELCOME_TITLE}
        welcomeBody={FM_VARDIYA_48_TOUR_WELCOME_BODY}
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
