import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Calculator,
  CirclePlay,
  Download,
  Eye,
  FilePlus2,
  FolderOpen,
  Plus,
  RefreshCw,
  Save,
  ShieldCheck,
  Trash2,
  Wallet,
  X,
} from "lucide-react";
import { ApiError } from "@/api/client";
import { getSavedCase } from "@/api/savedCases";
import { CalculationPreviewModal, type PreviewSection } from "@/components/calculation-preview";
import { DraftDateInput, DraftTextInput } from "@/components/form";
import { GuidedTourHost, useGuidedTourController } from "@/components/guided-tour";
import tourStyles from "@/components/guided-tour/GuidedTour.module.css";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { useToast } from "@/context/ToastContext";
import { useCalculationCaseBinding } from "@/hooks/useCalculationCaseBinding";
import {
  BAKIYE_UCRET_TOUR,
  BAKIYE_UCRET_TOUR_WELCOME_BODY,
  BAKIYE_UCRET_TOUR_WELCOME_TITLE,
} from "./guidedTour";
import {
  applyExtraSetItemsAsExtrasList,
  collectExtrasOnlyItems,
  tryMergeLegacyExtraSets,
} from "@/lib/localExtraSetsHelpers";
import {
  deleteLocalExtraSet,
  listLocalExtraSets,
  type LocalExtraSet,
  upsertLocalExtraSet,
} from "@/lib/localExtraSetsStore";
import {
  bakiyeUcretCaseCrud,
  buildBakiyeSaveResult,
  listBakiyeUcretCasesFromBackend,
  mapBakiyeRecordToSavedCase,
  resolveSavedCaseDisplayName,
} from "./backendCase";
import {
  calculateRemainingDays,
  calculateRemainingLabel,
  calcWorkPeriodBilirKisi,
  clampYear,
  computeBakiyeUcret,
  computeEklentiResult,
  formatDateTR,
  formatMoney,
  isDateOrderInvalid,
  parseNum,
  validateAsgariByResignDate,
  type BakiyeResult,
  type MonthRow,
} from "./engine";
import {
  calculateSegmentedNetFromRows,
  computeGrossFromNetSingle,
  computeNetFromGrossSingle,
  computeNetFromPeriodBrut,
  round2,
  type SegmentedNetResult,
} from "./netSegmented";
import {
  createEmptyForm,
  newLocalId,
  NOTE_TEXT,
  snapshotKey,
  type BakiyeForm,
  type BakiyeResults,
  type SavedCase,
} from "./model";
import { clearCorruptCases, deleteCase } from "./storage";
import styles from "./BakiyeUcretAlacagiPage.module.css";

const PAGE_TITLE = "Bakiye Ücret Alacağı";
const EXTRA_SETS_MODULE_ID = "bakiye-ucret-alacagi";
const CALCULATE_LABEL = "Bakiye Hesapla";

function monthlyFromForm(form: BakiyeForm): number {
  const base = parseNum(form.brut);
  const extras = form.extras.reduce((acc, item) => acc + parseNum(item.value), 0);
  return base + extras;
}

function resultFromSaved(results: BakiyeResults): BakiyeResult | null {
  if (!results.monthRows.length) return null;
  return {
    rows: results.rows,
    monthRows: results.monthRows,
    totalAmount: results.totalAmount,
  };
}

function tryAutoCalculate(form: BakiyeForm): BakiyeResult | null {
  const monthlyVal = monthlyFromForm(form);
  if (!form.startDate || !form.endDate || !form.resignDate || monthlyVal <= 0) return null;
  const calc = computeBakiyeUcret({
    startDate: form.startDate,
    endDate: form.endDate,
    resignDate: form.resignDate,
    monthly: monthlyVal,
  });
  return calc.error ? null : calc;
}

function NameModal({
  open,
  initial,
  title = "Kaydı adlandır",
  onClose,
  onConfirm,
}: {
  open: boolean;
  initial: string;
  title?: string;
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
        <h3 className={styles.modalTitle}>{title}</h3>
        <input className={styles.input} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
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

function buildGrossToNetPreviewRows(data: SegmentedNetResult & { gross?: number }): [string, string][] {
  const gross = data.gross ?? data.totalGross;
  const rows: [string, string][] = [
    ["Brüt", `${formatMoney(gross)} ₺`],
    ["SGK (%14)", `−${formatMoney(data.totalSgk)} ₺`],
    ["İşsizlik (%1)", `−${formatMoney(data.totalIssizlik)} ₺`],
  ];
  if ((data.totalGelirVergisiIstisna ?? 0) > 0) {
    rows.push(
      ["GV brüt", `−${formatMoney(data.totalGelirVergisiBrut)} ₺`],
      ["GV istisna", `+${formatMoney(data.totalGelirVergisiIstisna)} ₺`],
    );
  }
  rows.push([`GV ${data.gelirVergisiDilimleri || ""}`.trim(), `−${formatMoney(data.totalGelirVergisi)} ₺`]);
  if ((data.totalDamgaVergisiIstisna ?? 0) > 0) {
    rows.push(
      ["Damga brüt", `−${formatMoney(data.totalDamgaVergisiBrut)} ₺`],
      ["Damga istisna", `+${formatMoney(data.totalDamgaVergisiIstisna)} ₺`],
    );
  }
  rows.push(["Damga", `−${formatMoney(data.totalDamgaVergisi)} ₺`], ["Net", `${formatMoney(data.totalNet)} ₺`]);
  return rows;
}

function buildNetToGrossPreviewRows(data: SegmentedNetResult & { gross?: number }): [string, string][] {
  const gross = data.gross ?? data.totalGross;
  const rows: [string, string][] = [
    ["Net", `${formatMoney(data.totalNet)} ₺`],
    ["SGK (%14)", `+${formatMoney(data.totalSgk)} ₺`],
    ["İşsizlik (%1)", `+${formatMoney(data.totalIssizlik)} ₺`],
  ];
  if ((data.totalGelirVergisiIstisna ?? 0) > 0) {
    rows.push(
      ["GV brüt", `+${formatMoney(data.totalGelirVergisiBrut)} ₺`],
      ["GV istisna", `−${formatMoney(data.totalGelirVergisiIstisna)} ₺`],
      ["Net GV", `+${formatMoney(data.totalGelirVergisi)} ₺`],
    );
  } else {
    rows.push([`GV ${data.gelirVergisiDilimleri || ""}`.trim(), `+${formatMoney(data.totalGelirVergisi)} ₺`]);
  }
  if ((data.totalDamgaVergisiIstisna ?? 0) > 0) {
    rows.push(
      ["Damga brüt", `+${formatMoney(data.totalDamgaVergisiBrut)} ₺`],
      ["Damga istisna", `−${formatMoney(data.totalDamgaVergisiIstisna)} ₺`],
      ["Net damga", `+${formatMoney(data.totalDamgaVergisi)} ₺`],
    );
  } else {
    rows.push(["Damga", `+${formatMoney(data.totalDamgaVergisi)} ₺`]);
  }
  rows.push(["Brüt", `${formatMoney(gross)} ₺`]);
  return rows;
}

function NetBreakdown({ data, title }: { data: SegmentedNetResult & { gross?: number }; title: string }) {
  const gross = data.gross ?? data.totalGross;
  return (
    <div className={styles.fields} style={{ marginTop: "0.5rem", gap: "0.25rem" }}>
      <p className={styles.label} style={{ fontWeight: 600 }}>
        {title}
      </p>
      <p className={styles.helper} style={{ display: "flex", justifyContent: "space-between" }}>
        <span>Brüt</span>
        <span>{formatMoney(gross)} ₺</span>
      </p>
      <p className={styles.helper} style={{ display: "flex", justifyContent: "space-between" }}>
        <span>SGK (%14)</span>
        <span>−{formatMoney(data.totalSgk)} ₺</span>
      </p>
      <p className={styles.helper} style={{ display: "flex", justifyContent: "space-between" }}>
        <span>İşsizlik (%1)</span>
        <span>−{formatMoney(data.totalIssizlik)} ₺</span>
      </p>
      {(data.totalGelirVergisiIstisna ?? 0) > 0 ? (
        <>
          <p className={styles.helper} style={{ display: "flex", justifyContent: "space-between" }}>
            <span>GV brüt</span>
            <span>−{formatMoney(data.totalGelirVergisiBrut)} ₺</span>
          </p>
          <p className={styles.helper} style={{ display: "flex", justifyContent: "space-between" }}>
            <span>GV istisna</span>
            <span>+{formatMoney(data.totalGelirVergisiIstisna)} ₺</span>
          </p>
        </>
      ) : null}
      <p className={styles.helper} style={{ display: "flex", justifyContent: "space-between" }}>
        <span>GV {data.gelirVergisiDilimleri || ""}</span>
        <span>−{formatMoney(data.totalGelirVergisi)} ₺</span>
      </p>
      {(data.totalDamgaVergisiIstisna ?? 0) > 0 ? (
        <>
          <p className={styles.helper} style={{ display: "flex", justifyContent: "space-between" }}>
            <span>Damga brüt</span>
            <span>−{formatMoney(data.totalDamgaVergisiBrut)} ₺</span>
          </p>
          <p className={styles.helper} style={{ display: "flex", justifyContent: "space-between" }}>
            <span>Damga istisna</span>
            <span>+{formatMoney(data.totalDamgaVergisiIstisna)} ₺</span>
          </p>
        </>
      ) : null}
      <p className={styles.helper} style={{ display: "flex", justifyContent: "space-between" }}>
        <span>Damga</span>
        <span>−{formatMoney(data.totalDamgaVergisi)} ₺</span>
      </p>
      <p className={styles.helper} style={{ display: "flex", justifyContent: "space-between", fontWeight: 600 }}>
        <span>Net</span>
        <span>{formatMoney(data.totalNet)} ₺</span>
      </p>
    </div>
  );
}

export default function BakiyeUcretAlacagiPage() {
  const { success, error: showError, info: toastInfo } = useToast();
  const tour = useGuidedTourController();
  const [searchParams, setSearchParams] = useSearchParams();
  const caseIdParam = searchParams.get("caseId");
  const backendLoadedCaseIdRef = useRef<string | null>(null);
  const [form, setForm] = useState<BakiyeForm>(createEmptyForm);
  const [dateError, setDateError] = useState<string | null>(null);
  const [grossForNet, setGrossForNet] = useState("");
  const [netForGross, setNetForGross] = useState("");
  const lastSyncedTotal = useRef<number | null>(null);
  const [editingGross, setEditingGross] = useState<Record<number, string>>({});
  const [rowOverrides, setRowOverrides] = useState<Record<number, { gross: number; net: number }>>({});
  const [eklentiFor, setEklentiFor] = useState<string | null>(null);
  const [eklentiMonths, setEklentiMonths] = useState<Record<string, string[]>>({});
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
  const [extraSaveOpen, setExtraSaveOpen] = useState(false);
  const [extraImportOpen, setExtraImportOpen] = useState(false);
  const [savedExtraSets, setSavedExtraSets] = useState<LocalExtraSet[]>([]);
  const [caseSaving, setCaseSaving] = useState(false);
  const [calculatedResult, setCalculatedResult] = useState<BakiyeResult | null>(null);

  useEffect(() => {
    document.title = `${PAGE_TITLE} | Bilirkişi Hesap`;
  }, []);

  const patch = useCallback(<K extends keyof BakiyeForm>(key: K, value: BakiyeForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  const validateDates = useCallback(
    (start: string, end: string) => {
      if (isDateOrderInvalid(start, end)) {
        setDateError("Çalışma dönemi sonu, başlangıçtan önce olamaz.");
        showError("Çalışma dönemi sonu, başlangıçtan önce olamaz.");
        return false;
      }
      setDateError(null);
      return true;
    },
    [showError],
  );

  const refreshExtraSets = useCallback(async () => {
    setSavedExtraSets(await listLocalExtraSets(EXTRA_SETS_MODULE_ID));
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const merged = await tryMergeLegacyExtraSets(EXTRA_SETS_MODULE_ID);
      if (cancelled) return;
      if (merged && merged.imported > 0) {
        success(`${merged.imported} eski ekstra set hesaba aktarıldı`);
      }
      await refreshExtraSets();
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshExtraSets, success]);

  const hasExtraSetData = form.extras.some((e) => String(e.value ?? "").trim() !== "");

  const openExtraImport = () => {
    void refreshExtraSets().then(() => setExtraImportOpen(true));
  };

  const persistExtraSet = (name: string) => {
    void (async () => {
      try {
        const items = collectExtrasOnlyItems(form.extras);
        await upsertLocalExtraSet(EXTRA_SETS_MODULE_ID, name, items);
        await refreshExtraSets();
        setExtraSaveOpen(false);
        success("Ekstra hesaplamalar kaydedildi");
      } catch (err) {
        showError(err instanceof Error ? err.message : "Kaydedilemedi");
      }
    })();
  };

  const importExtraSet = (set: LocalExtraSet) => {
    setForm((f) => ({ ...f, extras: applyExtraSetItemsAsExtrasList(set.data) }));
    setExtraImportOpen(false);
    success("Ekstra hesaplamalar yüklendi");
  };

  const removeExtraSet = (id: string) => {
    void (async () => {
      await deleteLocalExtraSet(EXTRA_SETS_MODULE_ID, id);
      await refreshExtraSets();
      success("Set silindi");
    })();
  };

  const rescanLegacy = async () => {
    const merged = await tryMergeLegacyExtraSets(EXTRA_SETS_MODULE_ID, { force: true });
    await refreshExtraSets();
    if (!merged) {
      success("Hesap setleri kullanılıyor (eski sunucu setleri alınamadı)");
      return;
    }
    success(
      merged.imported > 0
        ? `${merged.imported} set eklendi (${merged.skipped} atlandı)`
        : `Yeni set yok (${merged.skipped} atlandı)`,
    );
  };

  const monthly = useMemo(() => monthlyFromForm(form), [form]);
  const result = calculatedResult;

  useEffect(() => {
    setRowOverrides({});
    setEditingGross({});
  }, [result?.totalAmount, result?.monthRows.length]);

  useEffect(() => {
    if (!result || result.error || !result.monthRows.length) return;
    const total = result.totalAmount;
    if (lastSyncedTotal.current === total) return;
    lastSyncedTotal.current = total;
    setGrossForNet(formatMoney(total));
  }, [result]);

  const displayMonthRows: MonthRow[] = useMemo(() => {
    if (!result?.monthRows) return [];
    return result.monthRows.map((mr, i) => {
      const ov = rowOverrides[i];
      return ov ? { ...mr, gross: ov.gross, net: ov.net } : mr;
    });
  }, [result, rowOverrides]);

  const displayTotal = useMemo(
    () => round2(displayMonthRows.reduce((a, b) => a + b.gross, 0)),
    [displayMonthRows],
  );

  const asgariErr = validateAsgariByResignDate(form.resignDate, parseNum(form.brut));
  const remainingDays = calculateRemainingDays(form.resignDate, form.endDate);
  const remainingLabel = calculateRemainingLabel(form.resignDate, form.endDate);
  const workPeriod = useMemo(() => {
    if (!form.startDate || !form.endDate) return null;
    const wp = calcWorkPeriodBilirKisi(form.startDate, form.endDate);
    return wp.label ? wp : null;
  }, [form.startDate, form.endDate]);
  const selectedYear = form.resignDate ? new Date(form.resignDate).getFullYear() : new Date().getFullYear();
  const dirty = snapshotKey(form) !== baseline;

  const handleCalculate = useCallback(() => {
    if (isDateOrderInvalid(form.startDate, form.endDate)) {
      showError("Çalışma dönemi sonu, başlangıçtan önce olamaz.");
      setCalculatedResult(null);
      return;
    }
    if (!form.startDate || !form.endDate || !form.resignDate) {
      showError("Lütfen tüm tarih alanlarını doldurun");
      setCalculatedResult(null);
      return;
    }
    if (!form.brut || parseNum(form.brut) <= 0) {
      showError("Geçerli bir brüt ücret girin");
      setCalculatedResult(null);
      return;
    }
    if (monthly <= 0) {
      showError("Toplam aylık ücret 0'dan büyük olmalıdır");
      setCalculatedResult(null);
      return;
    }
    const calc = computeBakiyeUcret({
      startDate: form.startDate,
      endDate: form.endDate,
      resignDate: form.resignDate,
      monthly,
    });
    if (calc.error) {
      showError(calc.error);
      setCalculatedResult(null);
      return;
    }
    setCalculatedResult(calc);
    setRowOverrides({});
    setEditingGross({});
    lastSyncedTotal.current = null;
    if (calc.totalAmount > 0) {
      setGrossForNet(formatMoney(calc.totalAmount));
    }
  }, [form, monthly, showError]);

  const grossVal = parseNum(grossForNet);
  const netPanel = useMemo((): (SegmentedNetResult & { gross?: number }) | null => {
    if (grossVal <= 0) return null;
    const totalFromRows = displayTotal;
    if (displayMonthRows.length && Math.abs(grossVal - totalFromRows) < 1) {
      const rows = displayMonthRows.map((mr) => {
        const ucret = mr.days > 0 ? (mr.gross * 30) / mr.days : monthly;
        return {
          ucret,
          katsayi: 1,
          gunSayisi: mr.days,
          ayGunSayisi: 30,
          startISO: mr.start,
          odenenUcret: 0,
        };
      });
      return calculateSegmentedNetFromRows(rows);
    }
    return computeNetFromGrossSingle(grossVal, selectedYear);
  }, [grossVal, displayMonthRows, displayTotal, monthly, selectedYear]);

  const netVal = parseNum(netForGross);
  const grossFromNet = useMemo(() => {
    if (netVal <= 0) return null;
    if (netPanel && netPanel.totalNet > 0 && Math.abs(netVal - netPanel.totalNet) < 1) {
      return { ...netPanel, gross: netPanel.totalGross };
    }
    return computeGrossFromNetSingle(netVal, selectedYear);
  }, [netVal, selectedYear, netPanel]);

  const eklentiPreview = eklentiFor
    ? computeEklentiResult(eklentiMonths[eklentiFor] ?? Array(12).fill(""))
    : 0;

  const reloadCases = useCallback(async () => {
    try {
      const items = await listBakiyeUcretCasesFromBackend();
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
    reloadCases();
  }, [reloadCases]);

  const setCaseIdParam = useCallback(
    (id: string) => {
      const next = new URLSearchParams(searchParams);
      next.set("caseId", id);
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams],
  );

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
        const saved = mapBakiyeRecordToSavedCase(record);
        if (!saved) {
          showError("Kayıt formu okunamadı");
          return;
        }
        const restored = resultFromSaved(saved.results) ?? tryAutoCalculate(saved.form);
        setForm(saved.form);
        setCalculatedResult(restored);
        setActiveId(String(numericId));
        setActiveName(saved.name);
        setBaseline(snapshotKey(saved.form));
        setDateError(null);
        lastSyncedTotal.current = null;
        setRowOverrides({});
        setEditingGross({});
        setGrossForNet(restored?.totalAmount ? formatMoney(restored.totalAmount) : "");
        setNetForGross("");
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

  const resetForm = useCallback(() => {
    const empty = createEmptyForm();
    setForm(empty);
    setGrossForNet("");
    setNetForGross("");
    lastSyncedTotal.current = null;
    setRowOverrides({});
    setEditingGross({});
    setEklentiFor(null);
    setEklentiMonths({});
    setActiveId(null);
    setActiveName(null);
    setCalculatedResult(null);
    setBaseline(snapshotKey(empty));
    setDateError(null);
  }, []);

  const applyCase = useCallback(
    (c: SavedCase) => {
      const restored = resultFromSaved(c.results) ?? tryAutoCalculate(c.form);
      setForm({ ...c.form });
      setCalculatedResult(restored);
      setActiveId(c.id);
      setActiveName(c.name);
      setBaseline(snapshotKey(c.form));
      lastSyncedTotal.current = null;
      setRowOverrides({});
      setEditingGross({});
      setGrossForNet(restored?.totalAmount ? formatMoney(restored.totalAmount) : "");
      setNetForGross("");
      setDateError(null);
      setListOpen(false);
      success(`Kayıt açıldı: ${c.name}`);
    },
    [success],
  );

  const persist = useCallback(
    async (name: string, existingId?: string | null) => {
      if (!result || result.error || !displayMonthRows.length) {
        showError("Önce geçerli bir hesaplama yapın");
        return;
      }
      setCaseSaving(true);
      const wasUpdate = !!(existingId && /^\d+$/.test(existingId));
      const results = {
        rows: result.rows,
        monthRows: displayMonthRows,
        totalAmount: displayTotal || result.totalAmount,
        monthly,
      };
      try {
        const record = await bakiyeUcretCaseCrud.saveCase(
          name,
          form,
          buildBakiyeSaveResult(results, { netTotal: netPanel?.totalNet ?? displayTotal }),
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
    [displayMonthRows, displayTotal, form, monthly, netPanel?.totalNet, reloadCases, result, setCaseIdParam, showError, success],
  );

  const handleSaveClick = useCallback(() => {
    if (!result || result.error || !displayMonthRows.length) {
      showError("Önce geçerli bir hesaplama yapın");
      return;
    }
    if (activeId && activeName && /^\d+$/.test(activeId)) {
      void persist(activeName, activeId);
      return;
    }
    setNameOpen(true);
  }, [activeId, activeName, displayMonthRows.length, persist, result, showError]);

  const doDelete = useCallback(async () => {
    if (!confirmDeleteId) return;
    try {
      if (/^\d+$/.test(confirmDeleteId)) {
        await bakiyeUcretCaseCrud.removeCase(confirmDeleteId);
      } else {
        deleteCase(confirmDeleteId);
      }
      if (activeId === confirmDeleteId) {
        resetForm();
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
  }, [activeId, confirmDeleteId, reloadCases, resetForm, showError, success]);

  const openEklenti = (itemId: string) => {
    setEklentiMonths((prev) => (prev[itemId] ? prev : { ...prev, [itemId]: Array(12).fill("") }));
    setEklentiFor(itemId);
  };

  const applyEklenti = () => {
    if (!eklentiFor) return;
    const months = eklentiMonths[eklentiFor] ?? Array(12).fill("");
    const value = computeEklentiResult(months) || 0;
    setForm((f) => ({
      ...f,
      extras: f.extras.map((e) => (e.id === eklentiFor ? { ...e, value: formatMoney(value) } : e)),
    }));
    setEklentiFor(null);
  };

  const handleMonthGrossBlur = (index: number) => {
    const raw = editingGross[index];
    if (raw === undefined) return;
    setEditingGross((prev) => {
      const next = { ...prev };
      delete next[index];
      return next;
    });
    const parsed = parseNum(raw);
    if (!Number.isFinite(parsed) || parsed < 0) return;
    const mr = displayMonthRows[index] ?? result?.monthRows[index];
    if (!mr) return;
    const monthlyEquiv = mr.days > 0 ? (parsed * 30) / mr.days : parsed;
    const net = round2(computeNetFromPeriodBrut(monthlyEquiv, mr.days, mr.start));
    setRowOverrides((prev) => ({ ...prev, [index]: { gross: round2(parsed), net } }));
    const newTotal = round2(
      (result?.monthRows ?? []).reduce((a, b, i) => {
        if (i === index) return a + parsed;
        return a + (rowOverrides[i]?.gross ?? b.gross);
      }, 0),
    );
    setGrossForNet(formatMoney(newTotal));
  };

  const previewSections = useMemo((): PreviewSection[] => {
    if (!displayMonthRows.length) return [];
    const daily = monthly > 0 ? round2(monthly / 30) : 0;
    const extraRows = form.extras
      .filter((e) => e.label.trim() || parseNum(e.value) > 0)
      .map((e) => [e.label || "Kalem", `${formatMoney(parseNum(e.value))} ₺`]);
    const totalDays = displayMonthRows.reduce((a, b) => a + b.days, 0);
    const totalNet = round2(displayMonthRows.reduce((a, b) => a + b.net, 0));
    const sections: PreviewSection[] = [
      {
        id: "genel",
        title: "Genel Bilgiler",
        headers: ["Alan", "Değer"],
        rows: [
          ["Çalışma dönemi başlangıcı", form.startDate ? formatDateTR(form.startDate) : "—"],
          ["Çalışma dönemi sonu", form.endDate ? formatDateTR(form.endDate) : "—"],
          ["İş akdinin fesih edildiği tarih", form.resignDate ? formatDateTR(form.resignDate) : "—"],
          ...(workPeriod ? [["Çalışma süresi", workPeriod.label] as [string, string]] : []),
          ["Kalan süre", remainingLabel || `${remainingDays} gün`],
          ["Günlük ücret", daily > 0 ? `${formatMoney(daily)} ₺` : "—"],
        ],
      },
    ];
    if (result?.rows?.length) {
      const hesaplamaDays = result.rows.reduce((a, b) => a + b.days, 0);
      sections.push({
        id: "hesaplama",
        title: "Bakiye ücret hesaplama cetveli",
        headers: ["Dönem", "Gün", "Tutar"],
        rows: [
          ...result.rows.map((row) => [
            `${formatDateTR(row.start)} – ${formatDateTR(row.end)}`,
            String(row.days),
            `${formatMoney(row.amount)} ₺`,
          ]),
          ["TOPLAM", String(hesaplamaDays), `${formatMoney(result.totalAmount)} ₺`],
        ],
        lastRowTone: "blue",
      });
    }
    sections.push(
      {
        id: "cetvel",
        title: "Aylık Brüt → Net Dönüşüm",
        headers: ["Dönem", "Gün", "Brüt", "Net"],
        rows: [
          ...displayMonthRows.map((mr) => [
            `${formatDateTR(mr.start)} – ${formatDateTR(mr.end)}`,
            String(mr.days),
            `${formatMoney(mr.gross)} ₺`,
            `${formatMoney(mr.net)} ₺`,
          ]),
          ["TOPLAM", String(totalDays), `${formatMoney(displayTotal)} ₺`, `${formatMoney(totalNet)} ₺`],
        ],
        lastRowTone: "blue",
      },
      {
        id: "ozet",
        title: "Özet",
        headers: ["Kalem", "Değer"],
        rows: [
          ["Çıplak brüt", `${formatMoney(parseNum(form.brut))} ₺`],
          ...extraRows,
          ["Aylık toplam", `${formatMoney(monthly)} ₺`],
          ["Toplam brüt", `${formatMoney(displayTotal)} ₺`],
          ["Kalan gün", String(remainingDays)],
          ...(remainingLabel ? [["Kalan süre", remainingLabel] as [string, string]] : []),
        ],
        lastRowTone: "green",
      },
    );
    if (netPanel) {
      sections.push({
        id: "net",
        title: "Brütten nete",
        headers: ["Kalem", "Tutar"],
        rows: buildGrossToNetPreviewRows(netPanel),
        lastRowTone: "green",
      });
    }
    if (grossFromNet && netVal > 0) {
      sections.push({
        id: "brut",
        title: "Netten brüte",
        headers: ["Kalem", "Tutar"],
        rows: buildNetToGrossPreviewRows(grossFromNet),
        lastRowTone: "blue",
      });
    }
    return sections;
  }, [
    displayMonthRows,
    displayTotal,
    form,
    grossFromNet,
    monthly,
    netPanel,
    netVal,
    remainingDays,
    remainingLabel,
    result,
    workPeriod,
  ]);

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div className={styles.heroMain}>
          <div className={styles.heroIcon} aria-hidden>
            <Wallet size={20} />
          </div>
          <div style={{ minWidth: 0 }}>
            <h1 className={styles.title}>{PAGE_TITLE}</h1>
            <p className={styles.desc}>
              Fesih sonrası kalan süre için ay bölme cetveli; istisnalı brütten nete dönüşüm.
            </p>
            <div className={styles.privacyBadge}>
              <ShieldCheck size={12} /> Veriler hesabınıza güvenli şekilde kaydedilir
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
            <span>Toplam brüt</span>
            <span className={styles.quickTotalValue}>{formatMoney(displayTotal)} ₺</span>
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
            <Button
              type="button"
              variant="soft"
              size="sm"
              onClick={() => (dirty ? setConfirmNew(true) : resetForm())}
            >
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
              void reloadCases();
            }}
          >
            Temizle
          </Button>
        </div>
      ) : null}

      <div className={styles.layout}>
        <section className={styles.card}>
          <div className={styles.fields}>
            <div data-tour="bakiye-ucret-donem" className={styles.fields} style={{ gap: "0.5rem" }}>
            <div>
              <label className={styles.label}>Çalışma dönemi başlangıcı</label>
              <DraftDateInput
                max="9999-12-31"
                className={`${styles.input} ${dateError ? styles.inputError : ""}`}
                value={form.startDate}
                onCommit={(v) => patch("startDate", clampYear(v))}
                onBlur={() => {
                  if (form.startDate && form.endDate) validateDates(form.startDate, form.endDate);
                }}
              />
            </div>
            <div>
              <label className={styles.label}>Çalışma dönemi sonu</label>
              <DraftDateInput
                max="9999-12-31"
                className={`${styles.input} ${dateError ? styles.inputError : ""}`}
                value={form.endDate}
                onCommit={(v) => patch("endDate", clampYear(v))}
                onBlur={() => {
                  if (form.startDate && form.endDate) validateDates(form.startDate, form.endDate);
                }}
              />
            </div>
            {workPeriod ? (
              <p className={styles.helper}>
                Çalışma süresi: {workPeriod.label}
              </p>
            ) : null}
            <div>
              <label className={styles.label}>İş Akdinin Fesih Edildiği Tarih</label>
              <DraftDateInput
                max="9999-12-31"
                className={styles.input}
                value={form.resignDate}
                onCommit={(v) => patch("resignDate", clampYear(v))}
              />
            </div>
            <div>
              <label className={styles.label}>Kalan Süre</label>
              <p className={styles.helper}>
                {remainingDays > 0
                  ? `${remainingDays} gün${remainingLabel ? ` (${remainingLabel})` : ""}`
                  : "—"}
              </p>
            </div>
            </div>
            <div data-tour="bakiye-ucret-ucret">
              <label className={styles.label}>Çıplak Brüt Ücret</label>
              <DraftTextInput
                className={styles.input}
                value={form.brut}
                onCommit={(v) => patch("brut", v)}
                placeholder="25.000,00"
              />
              {asgariErr ? <p className={styles.helper}>{asgariErr}</p> : null}
            </div>

            <div data-tour="bakiye-ucret-kalemler">
              <div className={styles.cardTitleRow} style={{ marginBottom: "0.35rem" }}>
                <label className={styles.label} style={{ margin: 0 }}>
                  Ekstra Hesaplamalar (Prim, İkramiye, Yol, Yemek vb.)
                </label>
                <div className={styles.inlineActions}>
                  <Button type="button" variant="soft" size="sm" onClick={openExtraImport}>
                    <Download size={14} /> İçe Aktar
                  </Button>
                  <Button
                    type="button"
                    variant="soft"
                    size="sm"
                    onClick={() => setExtraSaveOpen(true)}
                    disabled={!hasExtraSetData}
                  >
                    <Save size={14} /> Kaydet
                  </Button>
                </div>
              </div>
              <div className={styles.fields} style={{ gap: "0.4rem", marginTop: "0.35rem" }}>
                {form.extras.map((it) => (
                  <div
                    key={it.id}
                    style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", alignItems: "center" }}
                  >
                    <input
                      className={styles.input}
                      style={{ flex: "1 1 6rem", minWidth: "5rem" }}
                      value={it.label}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          extras: f.extras.map((x) => (x.id === it.id ? { ...x, label: e.target.value } : x)),
                        }))
                      }
                      placeholder="Kalem adı"
                    />
                    <input
                      className={styles.input}
                      style={{ flex: "1 1 6rem", minWidth: "5rem" }}
                      value={it.value}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          extras: f.extras.map((x) => (x.id === it.id ? { ...x, value: e.target.value } : x)),
                        }))
                      }
                      placeholder="0,00"
                    />
                    <Button type="button" variant="soft" size="sm" onClick={() => openEklenti(it.id)}>
                      <Calculator size={13} /> Eklenti Hesapla
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Sil"
                      onClick={() => setForm((f) => ({ ...f, extras: f.extras.filter((x) => x.id !== it.id) }))}
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setForm((f) => ({
                      ...f,
                      extras: [...f.extras, { id: newLocalId("extra"), label: "Ek Kalem", value: "" }],
                    }))
                  }
                >
                  <Plus size={14} /> Kalem
                </Button>
              </div>
              <p className={styles.helper} style={{ marginTop: "0.4rem" }}>
                Aylık toplam: {formatMoney(monthly)} ₺
              </p>
            </div>
            <div data-tour="bakiye-ucret-hesapla">
            <Button type="button" variant="primary" size="md" onClick={handleCalculate} style={{ width: "100%" }}>
              <Calculator size={16} /> {CALCULATE_LABEL}
            </Button>
            </div>
          </div>
        </section>

        <section className={styles.card} data-tour="bakiye-ucret-cetvel">
          <div className={styles.cardHead}>
            <h2 className={styles.cardTitle}>Bakiye cetveli</h2>
          </div>
          {result?.error ? <p className={styles.helper}>{result.error}</p> : null}
          {displayMonthRows.length ? (
            <>
              <div className={styles.resultCard}>
                <div className={styles.resultLabel}>Toplam brüt</div>
                <div className={styles.resultValue}>{formatMoney(displayTotal)} ₺</div>
              </div>
              <div style={{ overflowX: "auto", marginTop: "0.75rem" }}>
                <table style={{ width: "100%", fontSize: "0.85rem", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th align="left">Dönem</th>
                      <th align="right">Gün</th>
                      <th align="right">Brüt</th>
                      <th align="right">Net</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayMonthRows.map((mr, i) => (
                      <tr key={i}>
                        <td>
                          {formatDateTR(mr.start)} – {formatDateTR(mr.end)}
                        </td>
                        <td align="right">{mr.days}</td>
                        <td align="right">
                          <input
                            className={styles.input}
                            style={{ width: "6.5rem", textAlign: "right", padding: "0.2rem 0.35rem" }}
                            value={editingGross[i] ?? formatMoney(mr.gross)}
                            onChange={(e) => setEditingGross((prev) => ({ ...prev, [i]: e.target.value }))}
                            onBlur={() => handleMonthGrossBlur(i)}
                            onFocus={() =>
                              setEditingGross((prev) =>
                                prev[i] === undefined ? { ...prev, [i]: formatMoney(mr.gross) } : prev,
                              )
                            }
                          />
                        </td>
                        <td align="right">{formatMoney(mr.net)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <p className={styles.helper}>
              Alanları doldurup <strong>{CALCULATE_LABEL}</strong> ile hesaplayın.
            </p>
          )}

          <div className={styles.fields} style={{ marginTop: "0.85rem" }}>
            <div>
              <label className={styles.label}>Brütten Nete Çevir</label>
              <DraftTextInput
                className={styles.input}
                value={grossForNet}
                onCommit={setGrossForNet}
                placeholder={result ? formatMoney(result.totalAmount) : ""}
              />
              {netPanel ? <NetBreakdown data={netPanel} title="Brütten nete dökümü" /> : null}
            </div>
            <div>
              <label className={styles.label}>Netten Brüte Çevir</label>
              <div className={styles.inputRow}>
                <DraftTextInput
                  className={`${styles.input} ${styles.inputRowInput}`}
                  value={netForGross}
                  onCommit={setNetForGross}
                />
                <Button
                  type="button"
                  variant="soft"
                  size="sm"
                  className={styles.useLeftPanelBtn}
                  disabled={!netPanel || netPanel.totalNet <= 0}
                  onClick={() => netPanel && setNetForGross(formatMoney(netPanel.totalNet))}
                >
                  Sol panelin netini kullan
                </Button>
              </div>
              {grossFromNet ? <NetBreakdown data={grossFromNet} title="Netten brüte dökümü" /> : null}
            </div>
          </div>
        </section>

        <section className={styles.card}>
          <div className={styles.cardHead}>
            <h2 className={styles.cardTitle}>Notlar</h2>
          </div>
          <p className={styles.note}>{NOTE_TEXT}</p>
        </section>
      </div>

      <div className={`${styles.stickyBar} ${dirty ? styles.stickyBarDirty : ""}`} data-tour="bakiye-ucret-kaydet-actions">
        <div className={styles.stickyInner}>
          <div className={styles.stickyStatus}>
            {dirty ? "Kaydedilmemiş değişiklikler var" : activeName ? `Kayıt: ${activeName}` : "Yeni hesaplama"}
          </div>
          <div className={styles.stickyActions}>
            <Button
              type="button"
              variant="soft"
              size="sm"
              disabled={!result || !!result.error || !displayMonthRows.length}
              onClick={() => setPreviewOpen(true)}
            >
              <Eye size={14} /> Önizleme
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => (dirty ? setConfirmNew(true) : resetForm())}>
              <FilePlus2 size={14} /> Yeni
            </Button>
            <Button type="button" variant="primary" size="sm" onClick={handleSaveClick} disabled={caseSaving}>
              <Save size={14} /> {caseSaving ? "Kaydediliyor…" : activeId && /^\d+$/.test(activeId) ? "Güncelle" : "Kaydet"}
            </Button>
          </div>
        </div>
      </div>

      <NameModal
        open={nameOpen}
        initial={activeName ?? PAGE_TITLE}
        onClose={() => setNameOpen(false)}
        onConfirm={(name) => void persist(name, null)}
      />

      <NameModal
        open={extraSaveOpen}
        initial=""
        title="Ekstra Hesaplamaları Kaydet"
        onClose={() => setExtraSaveOpen(false)}
        onConfirm={persistExtraSet}
      />

      {extraImportOpen ? (
        <div className={styles.modalOverlay} role="presentation" onClick={() => setExtraImportOpen(false)}>
          <div className={styles.modalCard} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem" }}>
              <h3 className={styles.modalTitle}>Kaydedilmiş Setleri İçe Aktar</h3>
              <Button type="button" variant="ghost" size="sm" onClick={() => void rescanLegacy()} title="Sunucudaki eski setleri yeniden tara">
                <RefreshCw size={14} /> Yeniden tara
              </Button>
            </div>
            {savedExtraSets.length === 0 ? (
              <p className={styles.helper}>
                Kaydedilmiş set yok. Ekstra Hesaplamalar bölümündeki “Kaydet” ile mevcut kalemleri saklayabilirsiniz.
              </p>
            ) : (
              <ul className={styles.setList}>
                {savedExtraSets.map((set) => (
                  <li key={set.id} className={styles.setRow}>
                    <div className={styles.setInfo}>
                      <strong>{set.name}</strong>
                      <span>{set.data.length} kalem</span>
                    </div>
                    <div className={styles.inlineActions}>
                      <Button type="button" variant="soft" size="sm" onClick={() => importExtraSet(set)}>
                        <Download size={13} /> İçe aktar
                      </Button>
                      <Button type="button" variant="danger" size="sm" onClick={() => removeExtraSet(set.id)}>
                        <Trash2 size={13} />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <div className={styles.modalActions}>
              <Button type="button" variant="soft" size="sm" onClick={() => setExtraImportOpen(false)}>
                Kapat
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {eklentiFor ? (
        <div className={styles.modalOverlay} role="presentation" onClick={() => setEklentiFor(null)}>
          <div className={styles.modalCard} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.modalTitle}>Eklenti hesaplama</h3>
            <p className={styles.helper}>Son 12 aylık bordro tutarlarını girin. Formül: (toplam / 360) × 30</p>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(7rem, 1fr))",
                gap: "0.5rem",
                marginTop: "0.75rem",
              }}
            >
              {(eklentiMonths[eklentiFor] ?? Array(12).fill("")).map((value, index) => (
                <label key={index} className={styles.label}>
                  {index + 1}. ay
                  <input
                    className={styles.input}
                    inputMode="decimal"
                    value={value}
                    onChange={(e) => {
                      const v = e.target.value;
                      setEklentiMonths((prev) => ({
                        ...prev,
                        [eklentiFor]: (prev[eklentiFor] ?? Array(12).fill("")).map((m, i) => (i === index ? v : m)),
                      }));
                    }}
                    placeholder="1.250,00"
                  />
                </label>
              ))}
            </div>
            <p className={styles.helper} style={{ marginTop: "0.5rem" }}>
              Sonuç: <strong>{formatMoney(eklentiPreview)} ₺</strong>
            </p>
            <div className={styles.modalActions}>
              <Button type="button" variant="ghost" size="sm" onClick={() => setEklentiFor(null)}>
                İptal
              </Button>
              <Button type="button" variant="primary" size="sm" onClick={applyEklenti}>
                Uygula
              </Button>
            </div>
          </div>
        </div>
      ) : null}

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
                        {new Date(c.savedAt).toLocaleString("tr-TR")} · {formatMoney(c.results.totalAmount)} ₺
                      </div>
                    </div>
                    <div className={styles.caseBtns}>
                      <Button type="button" variant="soft" size="sm" onClick={() => applyCase(c)}>
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
        description="Kaydedilmemiş değişiklikler kaybolacak. Devam edilsin mi?"
        confirmLabel="Devam et"
        onConfirm={() => {
          setConfirmNew(false);
          resetForm();
        }}
        onCancel={() => setConfirmNew(false)}
      />
      <ConfirmDialog
        open={!!confirmDeleteId}
        title="Kaydı sil"
        description="Bu kayıt kalıcı olarak silinecek."
        confirmLabel="Sil"
        danger
        onConfirm={() => void doDelete()}
        onCancel={() => setConfirmDeleteId(null)}
      />
      <CalculationPreviewModal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        title="Bakiye Ücret Alacağı — Önizleme"
        sections={previewSections}
        contentId="bakiye-ucret-preview"
      />

      <GuidedTourHost
        definition={BAKIYE_UCRET_TOUR}
        active={tour.active}
        onActiveChange={tour.setActive}
        welcomeOpen={tour.welcomeOpen}
        onWelcomeOpenChange={tour.setWelcomeOpen}
        welcomeTitle={BAKIYE_UCRET_TOUR_WELCOME_TITLE}
        welcomeBody={BAKIYE_UCRET_TOUR_WELCOME_BODY}
        welcomeStartLabel="Başlat"
        welcomeLaterLabel="Kendim devam edeceğim"
        initialStepIndex={tour.resumeStepIndex}
        onCollectingComplete={() => {
          tour.completeTour();
          toastInfo("Kılavuz tamamlandı. Hesaplamanızı önizleyebilir veya kaydedebilirsiniz.");
        }}
        paused={
          previewOpen ||
          nameOpen ||
          listOpen ||
          extraSaveOpen ||
          extraImportOpen ||
          !!eklentiFor ||
          confirmNew ||
          !!confirmDeleteId
        }
      />
    </div>
  );
}
