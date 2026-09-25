/**
 * Gemi Adamı 7/24 Fazla Mesai — V3.5 sayfa (V3 işlev paritesi, lokal motor).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Anchor,
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
  Users,
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
  FM_GEMI_724_TOUR,
  FM_GEMI_724_TOUR_WELCOME_BODY,
  FM_GEMI_724_TOUR_WELCOME_TITLE,
} from "./guidedTour";
import {
  ManualBrutWageApplyControls,
  clearAllManualBrutFromRowOverrides,
  isManualBrutActiveInOverrides,
  mergeManualWageBrutsIntoRowOverrides,
} from "@/features/manual-brut-wage";
import {
  listGemi724FmCases,
  loadGemi724FmCase,
  removeGemi724FmCase,
  resolveSavedCaseDisplayName,
  saveGemi724FmCase,
} from "./backendCase";
import type { FmSavedCaseListItem } from "../shared/fmBackendCrud";
import {
  computeGemi724Result,
  createManualPeriodRow,
  FIXED_FM_HOURS,
  formatHours,
  formatMoney,
  parseKatsayi,
  sanitizeMoneyTyping,
  validateDateRange,
} from "./engine";
import {
  createEmptyForm,
  createEmptyWitness,
  type ExclusionItem,
  type Gemi724FormSnapshot,
  type RowOverride,
  type WitnessInput,
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
import { formatIsoDateRangeTR, formatIsoDateTR } from "@/utils/dateDisplay";
import { NotlarAccordion } from "../standart/NotlarAccordion";
import styles from "./Gemi724FmPage.module.css";

const PAGE_TITLE = "Fazla Mesai — Gemi Adamı (7/24 Tam Mürettebat)";

type PendingAction = { kind: "new" } | { kind: "open"; caseId: string } | null;

function snapshotKey(s: Gemi724FormSnapshot): string {
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

export default function Gemi724FmPage() {
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const caseIdParam = searchParams.get("caseId");

  const [form, setForm] = useState<Gemi724FormSnapshot>(() => createEmptyForm());
  const [currentRecordId, setCurrentRecordId] = useState<string | null>(null);
  const [currentRecordName, setCurrentRecordName] = useState<string | null>(null);
  const [savedCases, setSavedCases] = useState<FmSavedCaseListItem[]>([]);
  const [casesError, setCasesError] = useState<string | null>(null);
  const [isSavingCase, setIsSavingCase] = useState(false);
  const [caseLoading, setCaseLoading] = useState(false);
  const backendLoadedCaseIdRef = useRef<string | null>(null);
  const [baseline, setBaseline] = useState("");

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

  const clearCaseIdParam = useCallback(() => {
    if (!searchParams.has("caseId")) return;
    const next = new URLSearchParams(searchParams);
    next.delete("caseId");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const reloadCases = useCallback(async () => {
    try {
      const items = await listGemi724FmCases();
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
  const result = useDeferredFormMemo(form, computeGemi724Result);
  const katSayiNum = parseKatsayi(form.katSayi);
  const hasCustomKatsayi = katSayiNum !== 1;

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
      const year = Number(row.startISO.slice(0, 4));
      if (Number.isFinite(year) && year > 1900) years.add(year);
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
      start = form.iseGiris;
      end = form.istenCikis;
    }
    return { start, end };
  }, [result.rows, form.iseGiris, form.istenCikis]);

  const setField = <K extends keyof Gemi724FormSnapshot>(key: K, value: Gemi724FormSnapshot[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const resetFormFields = useCallback(() => {
    const empty = createEmptyForm();
    setForm(empty);
    setCurrentRecordId(null);
    setCurrentRecordName(null);
    setBaseline(snapshotKey(empty));
  }, []);

  const applyBackendForm = useCallback((mapped: Gemi724FormSnapshot, id: string, name: string) => {
    setForm(mapped);
    setCurrentRecordId(id);
    setCurrentRecordName(name);
    setBaseline(snapshotKey(mapped));
  }, []);

  const applyOpenCase = useCallback(
    async (c: FmSavedCaseListItem) => {
      try {
        const { record, form: loaded } = await loadGemi724FmCase(Number(c.id));
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

  const applyNewForm = useCallback(() => {
    resetFormFields();
    backendLoadedCaseIdRef.current = null;
    clearCaseIdParam();
  }, [clearCaseIdParam, resetFormFields]);

  useEffect(() => {
    if (!caseIdParam) {
      if (backendLoadedCaseIdRef.current !== null) {
        backendLoadedCaseIdRef.current = null;
        resetFormFields();
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

    void loadGemi724FmCase(numericId)
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

  /* ── Tanıklar ── */
  const addWitness = () => {
    setField("witnesses", [...form.witnesses, createEmptyWitness()]);
  };
  const updateWitness = (id: string, part: Partial<WitnessInput>) => {
    setField(
      "witnesses",
      form.witnesses.map((w) => (w.id === id ? { ...w, ...part } : w)),
    );
  };
  const removeWitness = (id: string) => {
    setField(
      "witnesses",
      form.witnesses.filter((w) => w.id !== id),
    );
  };

  /* ── Cetvel ── */
  const handleRowOverrideChange = (id: string, patch: RowOverride | null) => {
    setForm((prev) => {
      const next = { ...prev.rowOverrides };
      if (patch === null) delete next[id];
      else next[id] = patch;
      return { ...prev, rowOverrides: next };
    });
  };

  const handleAddRow = (afterId: string) => {
    const fmHours = result.rows.find((r) => r.id === afterId)?.fmHours ?? FIXED_FM_HOURS;
    const row = createManualPeriodRow(afterId, katSayiNum, fmHours);
    setForm((prev) => ({ ...prev, manualRows: [...prev.manualRows, row] }));
  };

  const handleRemoveRow = (id: string) => {
    setForm((prev) => {
      const isManual = prev.manualRows.some((r) => r.id === id);
      if (isManual) {
        const nextOverrides = { ...prev.rowOverrides };
        delete nextOverrides[id];
        return {
          ...prev,
          manualRows: prev.manualRows.filter((r) => r.id !== id),
          rowOverrides: nextOverrides,
        };
      }
      return {
        ...prev,
        rowOverrides: { ...prev.rowOverrides, [id]: { ...prev.rowOverrides[id], hidden: true } },
      };
    });
  };

  const hiddenRowCount = useMemo(
    () => Object.values(form.rowOverrides).filter((o) => o.hidden).length,
    [form.rowOverrides],
  );

  const showHiddenRows = () => {
    setForm((prev) => {
      const next = { ...prev.rowOverrides };
      for (const [id, ov] of Object.entries(next)) {
        if (ov.hidden) {
          const { hidden: _h, ...rest } = ov;
          next[id] = rest;
        }
      }
      return { ...prev, rowOverrides: next };
    });
  };

  /* ── Kayıt ── */
  const persistCase = async (name: string) => {
    if (isSavingCase) return;
    setIsSavingCase(true);
    const wasUpdate = !!currentRecordId;
    try {
      const saved = await saveGemi724FmCase(
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
        await removeGemi724FmCase(deleteCaseTarget.id);
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

  /* ── Önizleme ── */
  const previewSections = useMemo((): PreviewSection[] => {
    const money = (v: number) => `${formatMoney(v)} ₺`;
    const sections: PreviewSection[] = [];

    sections.push({
      id: "genel",
      title: "Genel Bilgiler",
      headers: ["İşe Giriş", "İşten Çıkış", "Mod", "Haftalık FM saat"],
      rows: [[formatIsoDateTR(form.iseGiris), formatIsoDateTR(form.istenCikis), "7×24", `${formatHours(FIXED_FM_HOURS)}`]],
    });

    sections.push({
      id: "cetvel",
      title: "Fazla Mesai Cetveli (Gemi)",
      headers: ["Dönem", "Hafta", "Ücret", "Kat", "FM Saat", "240", "1,25", "FM"],
      rows: result.rows.map((r) => {
        const note = r.yillikIzinAciklama ? ` ${r.yillikIzinAciklama}` : "";
        return [
          `${formatIsoDateRangeTR(r.startISO, r.endISO)}${note}`,
          String(r.weeks),
          money(r.brut),
          String(r.katsayi),
          formatHours(r.fmHours),
          "240",
          "1,25",
          money(r.fm),
        ];
      }),
    });

    sections.push({
      id: "brutnet",
      title: "Brüt'ten Net'e",
      headers: ["Kalem", "Tutar"],
      rows: [
        ["Brüt Fazla Mesai", money(result.totalFm)],
        ["SGK (%14)", `-${money(result.sgk)}`],
        ["İşsizlik (%1)", `-${money(result.issizlik)}`],
        [`Gelir Vergisi ${result.gelirVergisiDilimleri}`, `-${money(result.gelirVergisi)}`],
        ["Damga Vergisi", `-${money(result.damgaVergisi)}`],
        ["Net Fazla Mesai", money(result.netYillik)],
      ],
      lastRowTone: "green",
    });

    sections.push({
      id: "mahsup",
      title: "Mahsuplaşma",
      headers: ["Kalem", "Tutar"],
      rows: [
        ["Toplam Fazla Mesai (Brüt)", money(result.totalFm)],
        ["1/3 Hakkaniyet İndirimi", `-${money(result.hakkaniyetIndirimi)}`],
        ...(result.mahsupTutari > 0
          ? ([["Mahsuplaşma Miktarı", `-${money(result.mahsupTutari)}`]] as string[][])
          : []),
        ["Son Net Alacak", money(result.sonNet)],
      ],
      lastRowTone: "green",
    });

    return insertExclusionsPreviewSection(sections, form.exclusions);
  }, [form, result]);

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div className={styles.heroMain}>
          <div className={styles.heroIcon} aria-hidden>
            <Anchor size={22} />
          </div>
          <div>
            <h1 className={styles.title}>{PAGE_TITLE}</h1>
            <p className={styles.desc}>
              7×24 tam gemi adamı: haftalık fazla mesai saati sabit 35 saattir (bölücü 240, çarpan 1,25). Tanık zorunlu
              değildir; tanık tarihi yoksa hesaplama davacı işe giriş–işten çıkış dönemiyle yapılır.
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
              value={`${formatMoney(result.totalFm)} ₺`}
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

      <div className={styles.layout}>
        <section className={styles.card} style={{ animationDelay: "40ms" }} data-tour="fm-gemi-724-donem">
          <div className={styles.cardTitleRow}>
            <h2 className={styles.cardTitle}>Davacı Bilgileri</h2>
          </div>
          <div className={styles.basicGrid}>
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
                />
              </div>
            </label>
            {dateError ? <p className={styles.errorText}>{dateError}</p> : null}
          </div>
          <p className={styles.panelHint}>
            7×24 modda yalnızca işe giriş ve işten çıkış tarihleri zorunludur. Haftalık fazla mesai saati sabit 35
            saattir.
          </p>
        </section>

        <MetinHesaplamasi />

        <section className={styles.card} style={{ animationDelay: "80ms" }} data-tour="fm-gemi-724-taniklar">
          <div className={styles.cardTitleRow}>
            <h2 className={styles.cardTitle}>
              <Users size={15} style={{ marginRight: 6, verticalAlign: -2 }} />
              Tanık beyanları (isteğe bağlı)
            </h2>
            <Button variant="soft" size="sm" onClick={addWitness}>
              <Plus size={14} />
              Tanık ekle
            </Button>
          </div>
          <p className={styles.panelHint}>
            Tanık için yalnızca isim ve çalıştığı dönem (başlangıç–bitiş tarihleri) girilir; saat alanı yoktur. Hiç
            tanık yoksa veya hiçbir tanıkta tarih yoksa hesaplama yalnızca davacı dönemiyle yapılır.
          </p>
          {form.witnesses.length === 0 ? null : (
            <div className={styles.rowList}>
              {form.witnesses.map((w, idx) => (
                <div key={w.id} className={styles.witnessRow} style={{ gridTemplateColumns: "minmax(0,1.4fr) minmax(0,1fr) minmax(0,1fr) auto" }}>
                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>İsim</span>
                    <input
                      className={styles.input}
                      value={w.name}
                      onChange={(e) => updateWitness(w.id, { name: e.target.value })}
                      placeholder={`Tanık ${idx + 1}`}
                    />
                  </label>
                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>Başlangıç</span>
                    <input
                      type="date"
                      className={styles.input}
                      value={w.dateIn}
                      onChange={(e) => updateWitness(w.id, { dateIn: e.target.value })}
                    />
                  </label>
                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>Bitiş</span>
                    <input
                      type="date"
                      className={styles.input}
                      value={w.dateOut}
                      onChange={(e) => updateWitness(w.id, { dateOut: e.target.value })}
                    />
                  </label>
                  <button type="button" className={styles.removeBtn} onClick={() => removeWitness(w.id)}>
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        <div data-tour="fm-gemi-724-ayarlar" style={{ display: "grid", gap: "1rem", minWidth: 0 }}>
          <ExclusionsPanel
            exclusions={form.exclusions}
            onChange={(next: ExclusionItem[]) => setField("exclusions", next)}
            onOpenUbgtPicker={() => setShowUbgtPicker(true)}
            visibleAfterIso={form.zamanasimi?.nihaiBaslangic ?? null}
            onOverlayOpenChange={setExclusionOverlayOpen}
          />

          <p className={styles.noteInfo}>
            Son haftaya isabet eden izin/UBGT düşümlerinde, tabloda görülen tarih aralığı 7 günden kısa olsa dahi
            hesaplama bu süre üzerinden yapılmaz. İlgili düşüm, üst satırdaki toplam haftadan 1 hafta eksiltilerek ayrı
            bir satırda 1 hafta olarak dikkate alınmıştır.
          </p>

          <section className={styles.card} style={{ animationDelay: "140ms" }}>
            <h2 className={styles.cardTitle}>Diğer Ayarlar</h2>
            <div className={styles.basicGrid}>
              <div className={styles.field}>
                <span className={styles.fieldLabel}>Kat Sayı</span>
                <button
                  type="button"
                  className={`${styles.zamanasimiBadge} ${hasCustomKatsayi ? styles.zamanasimiBadgeActive : ""}`}
                  onClick={() => (hasCustomKatsayi ? setField("katSayi", "1") : setShowKatsayiModal(true))}
                  title={hasCustomKatsayi ? "Katsayıyı kaldır" : "Katsayı hesapla"}
                >
                  <Calculator size={13} />
                  {hasCustomKatsayi ? `Katsayı ${katSayiNum.toFixed(2)}` : "Kat Sayı"}
                </button>
              </div>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>270 Saat</span>
                <select
                  className={styles.selectInput}
                  value={form.mode270}
                  onChange={(e) => setField("mode270", e.target.value as Gemi724FormSnapshot["mode270"])}
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
                  onClick={() =>
                    form.zamanasimi ? setField("zamanasimi", null) : setShowZamanasimiModal(true)
                  }
                  title={form.zamanasimi ? "Zamanaşımını kaldır" : "Zamanaşımı hesapla"}
                >
                  <History size={13} />
                  {form.zamanasimi ? "Zamanaşımı" : "Zamanaşımı İtirazı"}
                </button>
              </div>
            </div>
            <p className={styles.panelHint}>
              270 ve zamanaşımı sunucuda uygulanır: Yargıtay seçeneğinde hafta değişmez, FM saatinden 5 saat 12 dakika
              düşülür; Şirket seçeneğinde hafta düşümü uygulanır.
            </p>
          </section>
        </div>

        <ZamanasimiCetvelBanner nihaiBaslangic={form.zamanasimi?.nihaiBaslangic} />

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
          toplamFm={result.totalFm}
        />

        <article className={styles.panel} style={{ animationDelay: "180ms" }}>
          <header className={styles.panelHead}>
            <h3>Brütten Nete Çevir</h3>
          </header>
          <div className={styles.totalsGrid}>
            <div>
              <span>Brüt Fazla Mesai</span>
              <FlashValue value={`${formatMoney(result.totalFm)} ₺`} />
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
              <span>Gelir Vergisi {result.gelirVergisiDilimleri}</span>
              <span>−{formatMoney(result.gelirVergisi)} ₺</span>
            </div>
            <div>
              <span>Damga Vergisi (Binde 7,59)</span>
              <span>−{formatMoney(result.damgaVergisi)} ₺</span>
            </div>
            <div className={styles.totalsHighlight}>
              <span>Net Fazla Mesai</span>
              <FlashValue value={`${formatMoney(result.netYillik)} ₺`} />
            </div>
          </div>
        </article>

        <article className={styles.panel} style={{ animationDelay: "200ms" }}>
          <header className={styles.panelHead}>
            <h3>Hakkaniyet İndirimi / Mahsuplaşma</h3>
          </header>
          <div className={styles.totalsGrid}>
            <div>
              <span>Toplam Fazla Mesai (Brüt)</span>
              <span>{formatMoney(result.totalFm)} ₺</span>
            </div>
            <div>
              <span>1/3 Hakkaniyet İndirimi</span>
              <span>−{formatMoney(result.hakkaniyetIndirimi)} ₺</span>
            </div>
            <div>
              <span>Mahsuplaşma</span>
              <div className={styles.mahsupRow}>
                <input
                  className={styles.input}
                  value={form.mahsup}
                  onChange={(e) => setField("mahsup", sanitizeMoneyTyping(e.target.value))}
                  placeholder="0"
                  inputMode="decimal"
                />
                <Button variant="soft" type="button" onClick={() => setShowMahsupModal(true)}>
                  Mahsuplaşma ekle
                </Button>
              </div>
            </div>
            <div className={styles.totalsHighlight}>
              <span>Son Net Alacak</span>
              <FlashValue value={`${formatMoney(result.sonNet)} ₺`} className={styles.sonNet} />
            </div>
          </div>
        </article>

        <section className={styles.card}>
          <NotlarAccordion />
        </section>
      </div>

      <div
        className={`${styles.stickyBar} ${isDirty ? styles.stickyBarDirty : ""} ${saveFlash ? styles.stickyBarSaved : ""}`}
        data-tour="fm-gemi-724-kaydet-actions"
      >
        <div className={styles.stickyInner}>
          <p className={styles.stickyStatus}>
            {caseLoading
              ? "Kayıt yükleniyor…"
              : isDirty
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
            <Button variant="primary" size="sm" onClick={handleSaveCase} disabled={isSavingCase || caseLoading}>
              <Save size={14} />
              {isSavingCase ? "Kaydediliyor…" : currentRecordId ? "Güncelle" : "Kaydet"}
            </Button>
          </div>
        </div>
      </div>

      {showRecordsModal ? (
        <div className={styles.modalOverlay} role="presentation" onClick={() => setShowRecordsModal(false)}>
          <div className={styles.modalCard} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>Kayıtlar</h2>
            {savedCases.length === 0 ? (
              <p className={styles.emptyText}>Henüz kayıt yok.</p>
            ) : (
              <ul className={styles.setList}>
                {savedCases.map((c) => (
                  <li key={c.id} className={styles.setRow}>
                    <div className={styles.setInfo}>
                      <strong>{c.name}</strong>
                      <span>{new Date(c.updatedAt).toLocaleString("tr-TR")}</span>
                    </div>
                    <div className={styles.inlineActions}>
                      <Button
                        variant="soft"
                        size="sm"
                        type="button"
                        onClick={() => requestAction({ kind: "open", caseId: c.id })}
                      >
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
            <div className={styles.modalActions}>
              <Button variant="soft" onClick={() => setShowRecordsModal(false)}>
                Kapat
              </Button>
            </div>
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
        iseGiris={form.iseGiris}
        initial={form.zamanasimi}
        onApply={(z) => {
          setField("zamanasimi", z);
          setShowZamanasimiModal(false);
        }}
        onClear={() => setField("zamanasimi", null)}
        onClose={() => setShowZamanasimiModal(false)}
      />

      <MahsuplasamaModal
        open={showMahsupModal}
        years={mahsupYears}
        onSave={(total) => {
          setField("mahsup", total.toFixed(2));
          setShowMahsupModal(false);
        }}
        onClose={() => setShowMahsupModal(false)}
      />

      <UbgtPickerModal
        open={showUbgtPicker}
        rangeStart={ubgtRange.start}
        rangeEnd={ubgtRange.end}
        exclusions={form.exclusions}
        onApply={(next) => setField("exclusions", next)}
        onClose={() => setShowUbgtPicker(false)}
        visibleAfterIso={form.zamanasimi?.nihaiBaslangic ?? null}
      />

      <CalculationPreviewModal
        open={showPreview}
        title={PAGE_TITLE}
        sections={previewSections}
        contentId="fm-gemi-724-word-copy"
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
        description={
          deleteCaseTarget ? `"${deleteCaseTarget.name}" kaydı silinecek. Bu işlem geri alınamaz.` : ""
        }
        confirmLabel="Sil"
        danger
        onConfirm={confirmDeleteCase}
        onCancel={() => setDeleteCaseTarget(null)}
      />

      <GuidedTourHost
        definition={FM_GEMI_724_TOUR}
        active={tour.active}
        onActiveChange={tour.setActive}
        welcomeOpen={tour.welcomeOpen}
        onWelcomeOpenChange={tour.setWelcomeOpen}
        welcomeTitle={FM_GEMI_724_TOUR_WELCOME_TITLE}
        welcomeBody={FM_GEMI_724_TOUR_WELCOME_BODY}
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
