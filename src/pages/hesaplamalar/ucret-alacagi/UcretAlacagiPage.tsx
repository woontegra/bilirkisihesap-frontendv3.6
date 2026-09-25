import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Banknote, Calculator, CirclePlay, Eye, FilePlus2, FolderOpen, Save, ShieldCheck, Trash2, X } from "lucide-react";
import { ApiError } from "@/api/client";
import { getSavedCase } from "@/api/savedCases";
import { CalculationPreviewModal, type PreviewSection } from "@/components/calculation-preview";
import { DraftDateInput, DraftTextInput } from "@/components/form";
import { GuidedTourHost, useGuidedTourController } from "@/components/guided-tour";
import tourStyles from "@/components/guided-tour/GuidedTour.module.css";
import { Button } from "@/components/ui/Button";
import { useDeferredFormMemo } from "@/hooks/useDeferredFormMemo";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { useToast } from "@/context/ToastContext";
import { useCalculationCaseBinding } from "@/hooks/useCalculationCaseBinding";
import {
  UCRET_ALACAGI_TOUR,
  UCRET_ALACAGI_TOUR_WELCOME_BODY,
  UCRET_ALACAGI_TOUR_WELCOME_TITLE,
} from "./guidedTour";
import {
  buildUcretAlacagiSaveResult,
  listUcretAlacagiCasesFromBackend,
  mapUcretAlacagiFormFromBackend,
  resolveSavedCaseDisplayName,
  ucretAlacagiCaseCrud,
} from "./backendCase";
import {
  calcRowHakEdisDisplay,
  calcRowKalan,
  clampYear,
  computeUcretAlacagi,
  formatDateTR,
  formatMoney,
  generateMonthRows,
  isDateOrderInvalid,
  mergeCetvelWithApi,
  mergeNetCetvelWithApi,
  monthlyUcretFromHakEdis,
  parseNum,
} from "./engine";
import { getAsgariUcretForPeriod } from "./asgariUcret";
import { ManualBrutWageApplyControls } from "./ManualBrutWageApplyControls";
import { createEmptyForm, NOTE_TEXT, snapshotKey, type CetvelRow, type HesaplamaTab, type SavedCase, type UcretAlacagiForm } from "./model";
import { clearCorruptCases, deleteCase } from "./storage";
import styles from "./UcretAlacagiPage.module.css";

const PAGE_TITLE = "Ücret Alacağı";
const PREVIEW_TITLE = "Ücret Alacağı Rapor";

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

function rowsStructureKey(rows: CetvelRow[]): string {
  return rows.map((r) => `${r.startISO}\0${r.endISO}\0${r.gunSayisi}`).join("|");
}

function monthRowsStructureKey(monthRows: ReturnType<typeof generateMonthRows>): string {
  return monthRows.map((m) => `${m.start}\0${m.end}\0${m.days}`).join("|");
}

function mergeFormRowsForDateRange(prev: UcretAlacagiForm): UcretAlacagiForm {
  if (!prev.startDate || !prev.endDate || isDateOrderInvalid(prev.startDate, prev.endDate)) {
    return prev;
  }
  const monthRows = generateMonthRows(prev.startDate, prev.endDate);
  const nextKey = monthRowsStructureKey(monthRows);
  const prevKey = rowsStructureKey(prev.cetvelRows);
  if (nextKey === prevKey && prev.cetvelRows.length === monthRows.length) {
    return prev;
  }
  return {
    ...prev,
    cetvelRows: mergeCetvelWithApi(prev.cetvelRows, monthRows, prev.globalKatsayi),
    netCetvelRows: mergeNetCetvelWithApi(prev.netCetvelRows, monthRows, prev.netGlobalKatsayi),
  };
}

function NameModal({
  open,
  initial,
  onClose,
  onConfirm,
}: {
  open: boolean;
  initial: string;
  onClose: () => void;
  onConfirm: (name: string) => void;
}) {
  const [name, setName] = useState(initial);
  useEffect(() => {
    if (open) setName(initial);
  }, [open, initial]);
  if (!open) return null;
  return (
    <div className={styles.modalOverlay} role="dialog" aria-modal="true">
      <div className={styles.modalCard}>
        <h3 className={styles.modalTitle}>Kaydı adlandır</h3>
        <label className={styles.label} htmlFor="ua-save-name">
          Kayıt adı
        </label>
        <input
          id="ua-save-name"
          className={styles.input}
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter" && name.trim()) onConfirm(name.trim());
          }}
        />
        <div className={styles.modalActions}>
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Vazgeç
          </Button>
          <Button type="button" variant="primary" size="sm" disabled={!name.trim()} onClick={() => onConfirm(name.trim())}>
            Kaydet
          </Button>
        </div>
      </div>
    </div>
  );
}

function KatsayiModal({
  open,
  onClose,
  onApply,
}: {
  open: boolean;
  onClose: () => void;
  onApply: (katsayi: number) => void;
}) {
  const [bilinen, setBilinen] = useState("");
  const [asgari, setAsgari] = useState("");
  useEffect(() => {
    if (!open) {
      setBilinen("");
      setAsgari("");
    }
  }, [open]);
  const result = useMemo(() => {
    const known = parseNum(bilinen);
    const minimum = parseNum(asgari);
    if (!minimum) return 0;
    return Number((known / minimum).toFixed(4));
  }, [bilinen, asgari]);
  if (!open) return null;
  return (
    <div className={styles.modalOverlay} role="dialog" aria-modal="true">
      <div className={styles.modalCard}>
        <h3 className={styles.modalTitle}>Kat Sayı Hesapla</h3>
        <div className={styles.field}>
          <label className={styles.label}>Bilinen ücret</label>
          <input className={styles.input} value={bilinen} onChange={(e) => setBilinen(e.target.value)} />
        </div>
        <div className={styles.field} style={{ marginTop: "0.5rem" }}>
          <label className={styles.label}>Asgari ücret</label>
          <input className={styles.input} value={asgari} onChange={(e) => setAsgari(e.target.value)} />
        </div>
        <p className={styles.helper} style={{ marginTop: "0.5rem" }}>
          Katsayı: <strong>{result.toFixed(4)}</strong>
        </p>
        <div className={styles.modalActions}>
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            İptal
          </Button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={() => {
              onApply(result);
              onClose();
            }}
          >
            Uygula
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function UcretAlacagiPage() {
  const { success, error: showError, info: toastInfo } = useToast();
  const tour = useGuidedTourController();
  const [searchParams, setSearchParams] = useSearchParams();
  const caseIdParam = searchParams.get("caseId");
  const backendLoadedCaseIdRef = useRef<string | null>(null);
  const [form, setForm] = useState<UcretAlacagiForm>(createEmptyForm);
  const [dateError, setDateError] = useState<string | null>(null);
  const [cases, setCases] = useState<SavedCase[]>([]);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeName, setActiveName] = useState<string | null>(null);
  useCalculationCaseBinding(activeId);
  const [baseline, setBaseline] = useState(() => snapshotKey(createEmptyForm()));
  const [nameOpen, setNameOpen] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [confirmNew, setConfirmNew] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [katsayiOpen, setKatsayiOpen] = useState(false);
  const [katsayiTarget, setKatsayiTarget] = useState<HesaplamaTab>("brut");
  const [manualWageFromTemplateActive, setManualWageFromTemplateActive] = useState(false);
  const [caseSaving, setCaseSaving] = useState(false);

  const setCaseIdParam = useCallback(
    (id: string) => {
      const next = new URLSearchParams(searchParams);
      next.set("caseId", id);
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  const result = useDeferredFormMemo(form, computeUcretAlacagi);
  const formSnapshot = useMemo(() => snapshotKey(form), [form]);
  const dirty = formSnapshot !== baseline;

  const reloadCases = useCallback(async () => {
    try {
      const items = await listUcretAlacagiCasesFromBackend();
      setStorageError(null);
      setCases(items);
    } catch (error) {
      const message =
        error instanceof ApiError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Kayıtlar yüklenemedi";
      setStorageError(message);
      setCases([]);
    }
  }, []);

  useEffect(() => {
    document.title = PAGE_TITLE;
  }, []);

  useEffect(() => {
    reloadCases();
  }, [reloadCases]);

  useEffect(() => {
    if (!caseIdParam) {
      backendLoadedCaseIdRef.current = null;
      return;
    }
    if (backendLoadedCaseIdRef.current === caseIdParam) return;
    const numericId = Number(caseIdParam);
    if (!Number.isFinite(numericId) || numericId <= 0) {
      showError("Geçersiz kayıt kimliği");
      return;
    }
    let cancelled = false;
    void getSavedCase(numericId)
      .then((record) => {
        if (cancelled) return;
        const mapped = mapUcretAlacagiFormFromBackend(record.data);
        if (!mapped) {
          showError("Kayıt formu okunamadı");
          return;
        }
        setForm(mapped);
        setActiveId(String(numericId));
        setActiveName(resolveSavedCaseDisplayName(record));
        setBaseline(snapshotKey(mapped));
        setDateError(null);
        backendLoadedCaseIdRef.current = caseIdParam;
        success(`Kayıt yüklendi: ${resolveSavedCaseDisplayName(record)}`);
        const next = new URLSearchParams(searchParams);
        next.delete("caseId");
        setSearchParams(next, { replace: true });
      })
      .catch(() => {
        if (!cancelled) {
          backendLoadedCaseIdRef.current = null;
          showError("Kayıt yüklenemedi");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [caseIdParam, searchParams, setSearchParams, showError, success]);

  const patch = useCallback(<K extends keyof UcretAlacagiForm>(key: K, value: UcretAlacagiForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleStartDateChange = useCallback((value: string) => {
    setForm((prev) => mergeFormRowsForDateRange({ ...prev, startDate: clampYear(value) }));
  }, []);

  const handleEndDateChange = useCallback((value: string) => {
    setForm((prev) => mergeFormRowsForDateRange({ ...prev, endDate: clampYear(value) }));
  }, []);

  const validateDates = useCallback(
    (start: string, end: string) => {
      if (isDateOrderInvalid(start, end)) {
        setDateError("Bitiş tarihi, başlangıç tarihinden önce olamaz.");
        showError("Bitiş tarihi, başlangıç tarihinden önce olamaz.");
        return false;
      }
      setDateError(null);
      return true;
    },
    [showError],
  );

  const handleNew = useCallback(() => {
    if (dirty) {
      setConfirmNew(true);
      return;
    }
    setForm(createEmptyForm());
    setActiveId(null);
    setActiveName(null);
    setBaseline(snapshotKey(createEmptyForm()));
    setDateError(null);
    setManualWageFromTemplateActive(false);
  }, [dirty]);

  const doNew = useCallback(() => {
    setConfirmNew(false);
    setForm(createEmptyForm());
    setActiveId(null);
    setActiveName(null);
    setBaseline(snapshotKey(createEmptyForm()));
    setDateError(null);
    setManualWageFromTemplateActive(false);
  }, []);

  const persist = useCallback(
    async (name: string, existingId?: string | null) => {
      if (result.totalBrut <= 0 && result.totalNet <= 0) {
        showError("Önce geçerli bir hesaplama yapın");
        return;
      }
      setCaseSaving(true);
      const wasUpdate = !!(existingId && /^\d+$/.test(existingId));
      try {
        const record = await ucretAlacagiCaseCrud.saveCase(
          name,
          form,
          buildUcretAlacagiSaveResult(result.totalBrut, result.totalNet),
          existingId,
        );
        const recordId = String(record.id);
        setActiveId(recordId);
        setActiveName(resolveSavedCaseDisplayName(record));
        setBaseline(snapshotKey(form));
        setCaseIdParam(recordId);
        backendLoadedCaseIdRef.current = recordId;
        await reloadCases();
        success(wasUpdate ? "Kayıt güncellendi" : "Kayıt kaydedildi");
        setNameOpen(false);
      } catch (error) {
        showError(
          error instanceof ApiError
            ? error.message
            : error instanceof Error
              ? error.message
              : "Kayıt yapılamadı",
        );
      } finally {
        setCaseSaving(false);
      }
    },
    [form, result, reloadCases, setCaseIdParam, showError, success],
  );

  const handleSaveClick = useCallback(() => {
    if (result.totalBrut <= 0 && result.totalNet <= 0) {
      showError("Önce geçerli bir hesaplama yapın");
      return;
    }
    if (activeId && activeName && /^\d+$/.test(activeId)) {
      void persist(activeName, activeId);
      return;
    }
    setNameOpen(true);
  }, [activeId, activeName, persist, result.totalBrut, result.totalNet, showError]);

  const openCase = useCallback(
    (c: SavedCase) => {
      const next = { ...createEmptyForm(), ...c.form };
      setForm(next);
      setActiveId(c.id);
      setActiveName(c.name);
      setBaseline(snapshotKey(next));
      setDateError(null);
      setListOpen(false);
      success(`Kayıt açıldı: ${c.name}`);
    },
    [success],
  );

  const doDelete = useCallback(async () => {
    if (!confirmDeleteId) return;
    try {
      if (/^\d+$/.test(confirmDeleteId)) {
        await ucretAlacagiCaseCrud.removeCase(confirmDeleteId);
      } else {
        deleteCase(confirmDeleteId);
      }
      if (activeId === confirmDeleteId) {
        setActiveId(null);
        setActiveName(null);
      }
      setConfirmDeleteId(null);
      await reloadCases();
      success("Kayıt silindi");
    } catch (error) {
      showError(
        error instanceof ApiError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Kayıt silinemedi",
      );
    }
  }, [activeId, confirmDeleteId, reloadCases, showError, success]);

  const updateRow = useCallback((tab: HesaplamaTab, rowId: string, patchRow: Partial<CetvelRow>) => {
    setForm((prev) => {
      const key = tab === "net" ? "netCetvelRows" : "cetvelRows";
      return { ...prev, [key]: prev[key].map((r) => (r.id === rowId ? { ...r, ...patchRow } : r)) };
    });
  }, []);

  const handleHakEdisCommit = useCallback(
    (tab: HesaplamaTab, row: CetvelRow, value: string) => {
      const numValue = parseNum(value);
      updateRow(tab, row.id, { ucret: monthlyUcretFromHakEdis(numValue, row), ucretManual: true, netVerisiYok: false });
    },
    [updateRow],
  );

  const handleKatsayiCommit = useCallback(
    (tab: HesaplamaTab, rowId: string, value: string) => {
      const numValue = parseFloat(value.replace(",", ".")) || 1;
      updateRow(tab, rowId, { katsayi: numValue });
    },
    [updateRow],
  );

  const handleOdenenCommit = useCallback(
    (tab: HesaplamaTab, rowId: string, value: string) => {
      updateRow(tab, rowId, { odenenUcret: parseNum(value) });
    },
    [updateRow],
  );

  const applyGlobalCoefficient = useCallback(
    (katsayi: number) => {
      if (!Number.isFinite(katsayi) || katsayi <= 0) return;
      if (katsayiTarget === "net") {
        setForm((prev) => ({
          ...prev,
          netGlobalKatsayi: katsayi,
          netHasCustomKatsayi: true,
          netCetvelRows: prev.netCetvelRows.map((row) => ({ ...row, katsayi })),
        }));
        return;
      }
      setForm((prev) => ({
        ...prev,
        globalKatsayi: katsayi,
        hasCustomKatsayi: true,
        cetvelRows: prev.cetvelRows.map((row) => ({ ...row, katsayi })),
      }));
    },
    [katsayiTarget],
  );

  const removeGlobalCoefficient = useCallback(() => {
    if (form.activeTab === "net") {
      setForm((prev) => ({
        ...prev,
        netGlobalKatsayi: 1,
        netHasCustomKatsayi: false,
        netCetvelRows: prev.netCetvelRows.map((row) => ({ ...row, katsayi: 1 })),
      }));
      return;
    }
    setForm((prev) => ({
      ...prev,
      globalKatsayi: 1,
      hasCustomKatsayi: false,
      cetvelRows: prev.cetvelRows.map((row) => ({ ...row, katsayi: 1 })),
    }));
  }, [form.activeTab]);

  const handleApplyManualBruts = useCallback((brutById: Record<string, number>) => {
    setForm((prev) => ({
      ...prev,
      cetvelRows: prev.cetvelRows.map((row) => {
        const b = brutById[row.id];
        if (b != null && Number.isFinite(b) && b > 0) {
          return { ...row, ucret: b, ucretManual: true };
        }
        return row;
      }),
    }));
    if (Object.keys(brutById).length > 0) setManualWageFromTemplateActive(true);
  }, []);

  const handleDeactivateManualTemplate = useCallback(() => {
    setForm((prev) => ({
      ...prev,
      cetvelRows: prev.cetvelRows.map((row) => ({
        ...row,
        ucret: getAsgariUcretForPeriod(row.startISO),
        ucretManual: false,
      })),
    }));
    setManualWageFromTemplateActive(false);
  }, []);

  const isNetTab = form.activeTab === "net";
  const rows = isNetTab ? form.netCetvelRows : form.cetvelRows;
  const kalanRows = isNetTab ? result.netKalanRows : result.brutKalanRows;
  const odenenToplam = isNetTab ? result.netOdenenToplam : result.brutOdenenToplam;
  const totalAmount = isNetTab ? result.totalNet : result.totalBrut;

  const previewSections = useMemo((): PreviewSection[] => {
    const sections: PreviewSection[] = [
      {
        id: "genel",
        title: "Genel Bilgiler",
        headers: ["Alan", "Değer"],
        rows: [
          ["Çalışma Dönemi Başlangıcı", form.startDate ? formatDateTR(form.startDate) : "—"],
          ["Çalışma Dönemi Sonu", form.endDate ? formatDateTR(form.endDate) : "—"],
          ["Çalışma Süresi", result.workPeriod.label],
          ["Sekme", isNetTab ? "Netten Hesaplama" : "Brütten Hesaplama"],
        ],
      },
    ];

    if (rows.length > 0) {
      sections.push({
        id: "cetvel",
        title: isNetTab ? "Net Ücret Hesaplama Cetveli" : "Ücret Hesaplama Cetveli",
        headers: ["Tarih Aralığı", "Gün", "Katsayı", isNetTab ? "Net Ücret" : "Ücret", "Ödenen", "Kalan"],
        rows: rows.map((row, idx) => [
          row.rangeLabel,
          String(row.gunSayisi),
          row.katsayi.toFixed(4).replace(".", ","),
          `${formatMoney(calcRowHakEdisDisplay(row))} ₺`,
          row.odenenUcret > 0 ? `${formatMoney(row.odenenUcret)} ₺` : "-",
          `${formatMoney(calcRowKalan(rows, idx))} ₺`,
        ]),
        lastRowTone: "blue",
      });
      sections.push({
        id: "toplam",
        title: "Toplam",
        headers: ["Kalem", "Tutar"],
        rows: [
          ["Toplam Ödenen", `${formatMoney(odenenToplam)} ₺`],
          [isNetTab ? "Ödenecek Net Ücret" : "Ödenecek Brüt Ücret", `${formatMoney(totalAmount)} ₺`],
        ],
        lastRowTone: "green",
      });
    }

    const netFromGross = isNetTab ? result.netTabNetFromGrossManual : result.netFromGross;
    const grossFromNet = isNetTab ? result.netTabGrossFromCetvel : result.brutTabGrossFromNetManual;

    if (netFromGross.gross > 0 || netFromGross.net > 0) {
      sections.push({
        id: "brutten-nete",
        title: "Brütten Nete Çeviri",
        headers: ["Kalem", "Tutar"],
        rows: [
          ["Brüt Ücret", `${formatMoney(netFromGross.gross)} ₺`],
          ["SGK Primi (%14)", `-${formatMoney(netFromGross.sgk)} ₺`],
          ["İşsizlik Primi (%1)", `-${formatMoney(netFromGross.issizlik)} ₺`],
          [`Gelir Vergisi ${netFromGross.gelirVergisiDilimleri}`.trim(), `-${formatMoney(netFromGross.gelirVergisi)} ₺`],
          ["Damga Vergisi (Binde 7,59)", `-${formatMoney(netFromGross.damgaVergisi)} ₺`],
          ["Net Ücret", `${formatMoney(netFromGross.net)} ₺`],
        ],
        lastRowTone: "green",
      });
    }

    if (grossFromNet.gross > 0 || grossFromNet.net > 0) {
      sections.push({
        id: "netten-brute",
        title: "Netten Brüte Çeviri",
        headers: ["Kalem", "Tutar"],
        rows: [
          ["Net Ücret", `${formatMoney(grossFromNet.net)} ₺`],
          ["SGK Primi (%14)", `+${formatMoney(grossFromNet.sgk)} ₺`],
          ["İşsizlik Primi (%1)", `+${formatMoney(grossFromNet.issizlik)} ₺`],
          [`Gelir Vergisi ${grossFromNet.gelirVergisiDilimleri}`.trim(), `+${formatMoney(grossFromNet.gelirVergisi)} ₺`],
          ["Damga Vergisi (Binde 7,59)", `+${formatMoney(grossFromNet.damgaVergisi)} ₺`],
          ["Brüt Ücret", `${formatMoney(grossFromNet.gross)} ₺`],
        ],
        lastRowTone: "blue",
      });
    }

    return sections;
  }, [form.startDate, form.endDate, isNetTab, rows, result, odenenToplam, totalAmount]);

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div className={styles.heroMain}>
          <div className={styles.heroIcon} aria-hidden>
            <Banknote size={20} />
          </div>
          <div style={{ minWidth: 0 }}>
            <h1 className={styles.title}>{PAGE_TITLE}</h1>
            <p className={styles.desc}>
              Çalışma dönemi için asgari ücret tabanlı ücret cetveli; brüt/net dönüştürücüler ve dönemsel gelir
              vergisi kademelendirmesi.
            </p>
            <div className={styles.privacyBadge}>
              <ShieldCheck size={12} /> Hesaplama lokal çalışır
            </div>
          </div>
        </div>
        <div className={styles.heroAside}>
          {activeName ? (
            <div className={styles.recordBadge}>
              <span>{activeName}</span>
            </div>
          ) : null}
          <div className={styles.quickTotal}>
            <span>{isNetTab ? "Ödenecek Net" : "Ödenecek Brüt"}</span>
            <span className={styles.quickTotalValue}>{formatMoney(totalAmount)} ₺</span>
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
              <CirclePlay size={14} /> Nasıl kullanılır?
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setListOpen(true)}>
              <FolderOpen size={14} /> Kayıtlar
            </Button>
            <Button type="button" variant="soft" size="sm" onClick={handleNew}>
              <FilePlus2 size={14} /> Yeni Hesaplama
            </Button>
          </div>
        </div>
      </header>

      {storageError ? (
        <div className={styles.storageBanner}>
          {storageError}{" "}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              clearCorruptCases();
              setStorageError(null);
              reloadCases();
            }}
          >
            Temizle
          </Button>
        </div>
      ) : null}

      <section className={styles.card} data-tour="ucret-alacagi-donem">
        <div className={styles.cardHead}>
          <Calculator size={16} />
          <h2 className={styles.cardTitle}>Tarih bilgileri</h2>
        </div>
        <div className={styles.fields3}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="ua-start">
              Çalışma dönemi başlangıcı
            </label>
            <DraftDateInput
              id="ua-start"
              max="9999-12-31"
              className={`${styles.input} ${dateError ? styles.inputError : ""}`}
              value={form.startDate}
              onCommit={(v) => handleStartDateChange(v)}
              onBlur={() => {
                if (form.startDate && form.endDate) validateDates(form.startDate, form.endDate);
              }}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="ua-end">
              Çalışma dönemi sonu
            </label>
            <DraftDateInput
              id="ua-end"
              max="9999-12-31"
              className={`${styles.input} ${dateError ? styles.inputError : ""}`}
              value={form.endDate}
              onCommit={(v) => handleEndDateChange(v)}
              onBlur={() => {
                if (form.startDate && form.endDate) validateDates(form.startDate, form.endDate);
              }}
            />
          </div>
          <div className={styles.field}>
            <span className={styles.label}>Çalışma süresi</span>
            <div className={styles.readonlyBox}>
              <FlashValue value={result.workPeriod.label || "—"} />
            </div>
          </div>
        </div>
      </section>

      <div className={styles.tabRow} data-tour="ucret-alacagi-hesap-turu">
        <button
          type="button"
          className={`${styles.tabBtn} ${!isNetTab ? styles.tabBtnActive : ""}`}
          onClick={() => patch("activeTab", "brut")}
        >
          Brütten Hesaplama
        </button>
        <button
          type="button"
          className={`${styles.tabBtn} ${isNetTab ? styles.tabBtnActive : ""}`}
          onClick={() => patch("activeTab", "net")}
        >
          Netten Hesaplama
        </button>
      </div>

      <section className={styles.card} data-tour="ucret-alacagi-kalemler">
        <div className={styles.rowHead}>
          <h2 className={styles.cardTitle}>{isNetTab ? "Net Ücret Hesaplama Cetveli" : "Ücret Hesaplama Cetveli"}</h2>
          <div data-tour="ucret-alacagi-ayarlar" style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", alignItems: "center" }}>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setKatsayiTarget(form.activeTab);
                setKatsayiOpen(true);
              }}
            >
              Kat Sayı Hesapla
            </Button>
            {(isNetTab ? form.netHasCustomKatsayi : form.hasCustomKatsayi) ? (
              <Button type="button" variant="ghost" size="sm" onClick={removeGlobalCoefficient}>
                Kat Sayı Kaldır ({(isNetTab ? form.netGlobalKatsayi : form.globalKatsayi).toFixed(4)})
              </Button>
            ) : null}
            {!isNetTab ? (
              <ManualBrutWageApplyControls
                rows={form.cetvelRows}
                onApplyBrutsByRowId={handleApplyManualBruts}
                manualBrutActive={manualWageFromTemplateActive}
                onDeactivateManualBrut={handleDeactivateManualTemplate}
                success={success}
                error={showError}
              />
            ) : null}
          </div>
        </div>

        {rows.length === 0 ? (
          <p className={styles.emptyCoef}>
            {isNetTab ? "Net ücret hesaplaması" : "Ücret hesaplaması"} için tarihleri girin. Tablo otomatik oluşturulacaktır.
          </p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.thLeft}>Tarih Aralığı</th>
                  <th>Gün</th>
                  <th>Katsayı</th>
                  <th>{isNetTab ? "Net Ücret" : "Ücret"}</th>
                  <th>Ödenen</th>
                  <th>Kalan</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => (
                  <tr key={row.id} className={idx % 2 === 0 ? styles.rowEven : styles.rowOdd}>
                    <td className={styles.tdLeft}>{row.rangeLabel}</td>
                    <td className={styles.tdCenter}>{row.gunSayisi}</td>
                    <td className={styles.tdRight}>
                      <DraftTextInput
                        value={row.katsayi.toFixed(4).replace(".", ",")}
                        onCommit={(v) => handleKatsayiCommit(form.activeTab, row.id, v)}
                        className={styles.cellInput}
                      />
                    </td>
                    <td className={styles.tdRight}>
                      <DraftTextInput
                        value={
                          row.netVerisiYok && !row.ucretManual ? "" : row.ucret ? formatMoney(calcRowHakEdisDisplay(row)) : ""
                        }
                        placeholder={row.netVerisiYok && !row.ucretManual ? "Net verisi yok" : "0,00"}
                        onCommit={(v) => handleHakEdisCommit(form.activeTab, row, v)}
                        className={`${styles.cellInput} ${
                          row.netVerisiYok && !row.ucretManual ? styles.cellInputWarn : row.ucretManual ? styles.cellInputManual : ""
                        }`}
                      />
                    </td>
                    <td className={styles.tdRight}>
                      <DraftTextInput
                        value={row.odenenUcret ? formatMoney(row.odenenUcret) : ""}
                        placeholder="0"
                        onCommit={(v) => handleOdenenCommit(form.activeTab, row.id, v)}
                        className={styles.cellInput}
                      />
                    </td>
                    <td className={styles.tdKalan}>{formatMoney(kalanRows[idx] ?? 0)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className={styles.tfootRow}>
                  <td colSpan={4} />
                  <td className={styles.tfootLabel}>Toplam Ödenen: {formatMoney(odenenToplam)}</td>
                  <td className={styles.tfootTotal}>
                    <div className={styles.tfootTotalLabel}>{isNetTab ? "Ödenecek Net Ücret:" : "Ödenecek Brüt Ücret:"}</div>
                    <div>
                      {formatMoney(totalAmount)} ₺
                    </div>
                  </td>
                </tr>
              </tfoot>
            </table>
            <div className={styles.tableNote}>
              {isNetTab
                ? "Net ücret sütunu dönemsel resmi net asgari ücret tablosundan okunur (2015 ve sonrası). Veri bulunmayan dönemlerde hücre boş kalır; değerleri manuel girebilirsiniz."
                : "Ücret sütunundaki değerler varsayılan olarak ilgili dönemin resmi asgari brüt ücretini gösterir. İsterseniz bu değerleri manuel olarak değiştirebilirsiniz."}
            </div>
          </div>
        )}
      </section>

      <section className={styles.card}>
        <div className={styles.cardHead}>
          <h2 className={styles.cardTitle}>{isNetTab ? "Netten Brüte Çeviri" : "Brütten Nete Çeviri"}</h2>
        </div>
        <div className={styles.convGrid}>
          <div className={styles.convPanel}>
            <div className={styles.convTitle}>{isNetTab ? "Netten Brüte" : "Brütten Nete"}</div>
            <div className={styles.convSource}>{rows.length > 0 ? `Cetvelden: ${formatMoney(totalAmount)}` : "Cetvel oluşturun"}</div>
            <div className={styles.lineList}>
              <div className={styles.line}>
                <span>{isNetTab ? "Brüt Ücret" : "Brüt Ücret"}</span>
                <strong>{formatMoney((isNetTab ? result.netTabGrossFromCetvel : result.netFromGross).gross)}</strong>
              </div>
              <div className={styles.line}>
                <span>SGK Primi (%14)</span>
                <strong className={styles.deduction}>
                  -{formatMoney((isNetTab ? result.netTabGrossFromCetvel : result.netFromGross).sgk)}
                </strong>
              </div>
              <div className={styles.line}>
                <span>İşsizlik Primi (%1)</span>
                <strong className={styles.deduction}>
                  -{formatMoney((isNetTab ? result.netTabGrossFromCetvel : result.netFromGross).issizlik)}
                </strong>
              </div>
              <div className={styles.line}>
                <span>Gelir Vergisi {(isNetTab ? result.netTabGrossFromCetvel : result.netFromGross).gelirVergisiDilimleri}</span>
                <strong className={styles.deduction}>
                  -{formatMoney((isNetTab ? result.netTabGrossFromCetvel : result.netFromGross).gelirVergisi)}
                </strong>
              </div>
              <div className={styles.line}>
                <span>Damga Vergisi (binde 7,59)</span>
                <strong className={styles.deduction}>
                  -{formatMoney((isNetTab ? result.netTabGrossFromCetvel : result.netFromGross).damgaVergisi)}
                </strong>
              </div>
            </div>
            <div className={`${styles.resultCard} ${styles.resultCardStrong}`} style={{ marginTop: "0.5rem" }}>
              <div className={styles.resultLabel}>Net Ücret</div>
              <div className={styles.resultValue}>
                {formatMoney((isNetTab ? result.netTabGrossFromCetvel : result.netFromGross).net)} ₺
              </div>
            </div>
          </div>

          <div className={styles.convPanel}>
            <div className={styles.convTitle}>{isNetTab ? "Brütten Nete" : "Netten Brüte"}</div>
            <div className={styles.field}>
              <label className={styles.label}>{isNetTab ? "Brüt Ücret" : "Net Ücret"}</label>
              <div className={styles.inputRow}>
                <DraftTextInput
                  className={`${styles.input} ${styles.inputRowInput}`}
                  placeholder="Örn: 18.000,00"
                  value={isNetTab ? form.netTabGrossForNet : form.netForGross}
                  onCommit={(v) => patch(isNetTab ? "netTabGrossForNet" : "netForGross", v)}
                />
                {(isNetTab ? result.netTabGrossFromCetvel.gross : result.netFromGross.net) > 0 ? (
                  <Button
                    type="button"
                    variant="soft"
                    size="sm"
                    className={styles.useLeftPanelBtn}
                    onClick={() =>
                      patch(
                        isNetTab ? "netTabGrossForNet" : "netForGross",
                        formatMoney(isNetTab ? result.netTabGrossFromCetvel.gross : result.netFromGross.net),
                      )
                    }
                  >
                    {isNetTab ? "Sol panelin brütünü kullan" : "Sol panelin netini kullan"}
                  </Button>
                ) : null}
              </div>
            </div>
            <div className={styles.lineList} style={{ marginTop: "0.5rem" }}>
              <div className={styles.line}>
                <span>{isNetTab ? "Net Ücret" : "Net Ücret"}</span>
                <strong>{formatMoney((isNetTab ? result.netTabNetFromGrossManual : result.brutTabGrossFromNetManual).net)}</strong>
              </div>
              <div className={styles.line}>
                <span>SGK Primi (%14)</span>
                <strong>
                  +{formatMoney((isNetTab ? result.netTabNetFromGrossManual : result.brutTabGrossFromNetManual).sgk)}
                </strong>
              </div>
              <div className={styles.line}>
                <span>İşsizlik Primi (%1)</span>
                <strong>
                  +{formatMoney((isNetTab ? result.netTabNetFromGrossManual : result.brutTabGrossFromNetManual).issizlik)}
                </strong>
              </div>
              <div className={styles.line}>
                <span>
                  Gelir Vergisi {(isNetTab ? result.netTabNetFromGrossManual : result.brutTabGrossFromNetManual).gelirVergisiDilimleri}
                </span>
                <strong>
                  +{formatMoney((isNetTab ? result.netTabNetFromGrossManual : result.brutTabGrossFromNetManual).gelirVergisi)}
                </strong>
              </div>
              <div className={styles.line}>
                <span>Damga Vergisi (binde 7,59)</span>
                <strong>
                  +{formatMoney((isNetTab ? result.netTabNetFromGrossManual : result.brutTabGrossFromNetManual).damgaVergisi)}
                </strong>
              </div>
            </div>
            <div className={`${styles.resultCard} ${styles.resultCardAccent}`} style={{ marginTop: "0.5rem" }}>
              <div className={styles.resultLabel}>Brüt Ücret</div>
              <div className={styles.resultValue}>
                {formatMoney((isNetTab ? result.netTabNetFromGrossManual : result.brutTabGrossFromNetManual).gross)} ₺
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.card}>
        <div className={styles.cardHead}>
          <h2 className={styles.cardTitle}>Notlar</h2>
        </div>
        <p className={styles.note}>{NOTE_TEXT}</p>
      </section>

      <div className={`${styles.stickyBar} ${dirty ? styles.stickyBarDirty : ""}`} data-tour="ucret-alacagi-kaydet-actions">
        <div className={styles.stickyInner}>
          <div className={styles.stickyStatus}>
            {dirty ? "Kaydedilmemiş değişiklikler var" : activeName ? `Kayıt: ${activeName}` : "Yeni hesaplama"}
          </div>
          <div className={styles.stickyActions}>
            <Button type="button" variant="soft" size="sm" onClick={() => setPreviewOpen(true)}>
              <Eye size={14} /> Önizleme
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={handleNew}>
              <FilePlus2 size={14} /> Yeni
            </Button>
            <Button type="button" variant="primary" size="sm" onClick={handleSaveClick} disabled={caseSaving}>
              <Save size={14} /> {caseSaving ? "Kaydediliyor…" : activeId && /^\d+$/.test(activeId) ? "Güncelle" : "Kaydet"}
            </Button>
          </div>
        </div>
      </div>

      <NameModal open={nameOpen} initial={activeName || PAGE_TITLE} onClose={() => setNameOpen(false)} onConfirm={(name) => void persist(name, null)} />
      <KatsayiModal open={katsayiOpen} onClose={() => setKatsayiOpen(false)} onApply={applyGlobalCoefficient} />

      {listOpen ? (
        <div className={styles.modalOverlay} role="dialog" aria-modal="true">
          <div className={styles.modalCard}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 className={styles.modalTitle}>Kayıtlı hesaplamalar</h3>
              <Button type="button" variant="ghost" size="icon" onClick={() => setListOpen(false)} aria-label="Kapat">
                <X size={16} />
              </Button>
            </div>
            {cases.length === 0 ? (
              <p className={styles.helper}>Henüz kayıt yok.</p>
            ) : (
              <div className={styles.caseList}>
                {cases.map((c) => (
                  <div key={c.id} className={styles.caseItem}>
                    <div style={{ minWidth: 0 }}>
                      <div className={styles.caseName}>{c.name}</div>
                      <div className={styles.caseMeta}>
                        {new Date(c.updatedAt).toLocaleString("tr-TR")} · Brüt {formatMoney(c.results.totalBrut)} ₺ · Net{" "}
                        {formatMoney(c.results.totalNet)} ₺
                      </div>
                    </div>
                    <div className={styles.caseBtns}>
                      <Button type="button" variant="soft" size="sm" onClick={() => openCase(c)}>
                        Aç
                      </Button>
                      <Button type="button" variant="danger" size="icon" aria-label="Sil" onClick={() => setConfirmDeleteId(c.id)}>
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={confirmNew}
        title="Yeni hesaplama"
        description="Kaydedilmemiş veriler silinecek. Devam edilsin mi?"
        confirmLabel="Devam et"
        onConfirm={doNew}
        onCancel={() => setConfirmNew(false)}
      />
      <ConfirmDialog
        open={!!confirmDeleteId}
        title="Kaydı sil"
        description="Bu kayıt kalıcı olarak silinecek."
        confirmLabel="Sil"
        danger
        onConfirm={doDelete}
        onCancel={() => setConfirmDeleteId(null)}
      />

      <CalculationPreviewModal
        open={previewOpen}
        title={PREVIEW_TITLE}
        sections={previewSections}
        contentId="ucret-alacagi-preview"
        onClose={() => setPreviewOpen(false)}
      />

      <GuidedTourHost
        definition={UCRET_ALACAGI_TOUR}
        active={tour.active}
        onActiveChange={tour.setActive}
        welcomeOpen={tour.welcomeOpen}
        onWelcomeOpenChange={tour.setWelcomeOpen}
        welcomeTitle={UCRET_ALACAGI_TOUR_WELCOME_TITLE}
        welcomeBody={UCRET_ALACAGI_TOUR_WELCOME_BODY}
        welcomeStartLabel="Başlat"
        welcomeLaterLabel="Kendim devam edeceğim"
        initialStepIndex={tour.resumeStepIndex}
        onCollectingComplete={() => {
          tour.completeTour();
          toastInfo("Kılavuz tamamlandı. Hesaplamanızı önizleyebilir veya kaydedebilirsiniz.");
        }}
        paused={previewOpen || nameOpen || listOpen || katsayiOpen || confirmNew || !!confirmDeleteId}
      />
    </div>
  );
}
