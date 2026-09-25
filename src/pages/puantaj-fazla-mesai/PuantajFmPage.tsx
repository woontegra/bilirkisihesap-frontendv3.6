import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, RefreshCw, ShieldCheck } from "lucide-react";
import { collectUnknownDescriptions, extractIzinKodlari, matchIzinKod, mergeDurumKodlari, primaryIzinKod, rowHasOff } from "./codes";
import { autoDetectMappings, applyTemplateToLogicalMappings, guessHeaderRowIndex, toTableView, validateMappingCoverage } from "./detect";
import { computePuantajFm, DEFAULT_CALC_SETTINGS, inferCalcDateRange } from "./engine";
import { buildOffAuditReport } from "./offAudit";
import { parseFile } from "./parsing";
import { guessGeometryHeaderIndex } from "./pdfLayout";
import {
  buildSignature,
  deleteTemplate,
  duplicateTemplate,
  loadTemplatesSafe,
  saveTemplate,
  suggestTemplate,
} from "./templates";
import {
  applyHourPriority,
  buildStandardRows,
  computeRowStatus,
  groupByPersonel,
  hasOffCardConflict,
  isOffConflictRow,
  resolveOffKeepHours,
  resolveOffKeepOffMany,
  migrateStandardRow,
  recomputeEditedRow,
} from "./transform";
import type {
  CalcSettings,
  CodeMap,
  ColumnMapping,
  IzinKodKey,
  MappableFieldKey,
  ParsedDocument,
  PuantajFmResult,
  PuantajTemplate,
  StandardRow,
  TableView,
  WizardStep,
} from "./model";
import { WIZARD_STEPS } from "./model";
import { id, isValidTime, normalizeTimeString, parseDateToISO } from "./utils";
import Stepper from "./components/Stepper";
import UploadStep from "./components/UploadStep";
import MappingStep from "./components/MappingStep";
import ReviewStep from "./components/ReviewStep";
import type { EditableField } from "./components/ReviewStep";
import CalculateStep from "./components/CalculateStep";
import ReportStep from "./components/ReportStep";
import OffAuditModal from "./components/OffAuditModal";
import {
  adaptSmartImportToReview,
  buildFileAnalysisKey,
  buildQualityReportFromStandardRows,
  buildWorkbookFingerprint,
  fingerprintSimilarity,
  isSmartImportV2Enabled,
  runSmartAnalysisAsync,
} from "./smart-import-v2";
import type { SmartImportAnalysis } from "./smart-import-v2/types";
import type { SmartImportQualityReport } from "./smart-import-v2/qualityReport";
import {
  deleteSmartImportTemplate,
  loadSmartImportTemplatesSafe,
  saveSmartImportTemplate,
  type SmartImportMappingTemplate,
} from "./smart-import-v2/smartTemplateStore";
import SmartQualityReportModal from "./components/SmartQualityReportModal";
import styles from "./PuantajFmPage.module.css";

const STEP_ORDER: WizardStep[] = WIZARD_STEPS.map((s) => s.key);

export default function PuantajFmPage() {
  const [step, setStep] = useState<WizardStep>("upload");
  const [maxReached, setMaxReached] = useState(0);

  const [doc, setDoc] = useState<ParsedDocument | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [headerRowIndex, setHeaderRowIndex] = useState(0);

  const [mappings, setMappings] = useState<ColumnMapping[]>([]);
  const [constants, setConstants] = useState<Partial<Record<MappableFieldKey, string>>>({});
  const [codeMap, setCodeMap] = useState<CodeMap>({});
  const [templates, setTemplates] = useState<PuantajTemplate[]>([]);
  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(null);
  const [suggestedTemplateName, setSuggestedTemplateName] = useState<string | null>(null);

  const [rows, setRows] = useState<StandardRow[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);

  const [settings, setSettings] = useState<CalcSettings>(DEFAULT_CALC_SETTINGS);
  const [katsayi, setKatsayi] = useState(1);
  const [results, setResults] = useState<PuantajFmResult[]>([]);
  const [offAuditOpen, setOffAuditOpen] = useState(false);

  const [smartAnalysis, setSmartAnalysis] = useState<SmartImportAnalysis | null>(null);
  const [smartUiMode, setSmartUiMode] = useState<"panel" | "review" | "hidden">("panel");
  const [smartImportApplied, setSmartImportApplied] = useState(false);
  const [smartImportWarning, setSmartImportWarning] = useState<string | null>(null);
  const [smartAnalyzing, setSmartAnalyzing] = useState(false);
  const [smartProgress, setSmartProgress] = useState(0);
  const [qualityReport, setQualityReport] = useState<SmartImportQualityReport | null>(null);
  const [qualityModalOpen, setQualityModalOpen] = useState(false);
  const [smartTemplates, setSmartTemplates] = useState<SmartImportMappingTemplate[]>([]);
  const preparedSmartRows = useRef<StandardRow[] | null>(null);
  const smartAbortRef = useRef<AbortController | null>(null);
  const smartGenRef = useRef(0);

  const lastHeaderSig = useRef<string>("");

  useEffect(() => {
    void loadTemplatesSafe().then(setTemplates);
    void loadSmartImportTemplatesSafe().then(setSmartTemplates);
  }, []);

  const table: TableView | null = useMemo(() => {
    if (!doc) return null;
    const sheet = doc.sheets[sheetIndex];
    if (!sheet) return null;
    return toTableView(sheet, headerRowIndex, sheetIndex + 1);
  }, [doc, sheetIndex, headerRowIndex]);

  // Tablo (başlıklar) değişince eşlemeleri otomatik yeniden tahmin et.
  useEffect(() => {
    if (!table) return;
    const sig = table.headers.join("|") + `#${headerRowIndex}#${sheetIndex}`;
    if (sig === lastHeaderSig.current) return;
    lastHeaderSig.current = sig;
    setMappings(autoDetectMappings(table.headers));
    setActiveTemplateId(null);
  }, [table, headerRowIndex, sheetIndex]);

  // Gölge mod: klasik akışı değiştirmeden arka planda akıllı analiz.
  useEffect(() => {
    if (!doc || !isSmartImportV2Enabled()) {
      setSmartAnalysis(null);
      setSmartAnalyzing(false);
      setSmartProgress(0);
      return;
    }

    smartAbortRef.current?.abort();
    const ac = new AbortController();
    smartAbortRef.current = ac;
    const gen = ++smartGenRef.current;
    setSmartAnalyzing(true);
    setSmartProgress(8);

    const sheets = doc.sheets.map((s) => ({ name: s.name, grid: s.grid }));
    const fileKey = buildFileAnalysisKey(doc.fileName, sheets);

    runSmartAnalysisAsync({
      fileKey,
      sheets,
      signal: ac.signal,
      onProgress: (pct) => {
        if (gen === smartGenRef.current) setSmartProgress(pct);
      },
    })
      .then(({ analysis }) => {
        if (gen !== smartGenRef.current) return;
        if (analysis.ok && analysis.dataRowCount > 0 && analysis.proposals.length > 0) {
          setSmartAnalysis(analysis);
          setSmartUiMode((prev) => (prev === "hidden" ? "hidden" : "panel"));
          setSmartImportWarning(null);
        } else {
          setSmartAnalysis(null);
        }
      })
      .catch((e) => {
        if (gen !== smartGenRef.current) return;
        if (import.meta.env.DEV) {
          // eslint-disable-next-line no-console
          console.warn("[smart-import-v2]", e);
        }
        setSmartAnalysis(null);
        setSmartImportWarning("Akıllı analiz kullanılamadı; klasik eşleştirme ile devam edebilirsiniz.");
      })
      .finally(() => {
        if (gen === smartGenRef.current) setSmartAnalyzing(false);
      });

    return () => ac.abort();
  }, [doc]);

  const reachStep = useCallback((target: WizardStep) => {
    const idx = STEP_ORDER.indexOf(target);
    setStep(target);
    setMaxReached((prev) => Math.max(prev, idx));
  }, []);

  /* ── Dosya yükleme ── */
  const handleFile = useCallback(async (file: File) => {
    setLoading(true);
    setError(null);
    try {
      const parsed = await parseFile(file);
      if (parsed.kind === "unknown") {
        setError(parsed.warnings[0] ?? "Dosya okunamadı.");
        setDoc(null);
        return;
      }
      setDoc(parsed);
      setSheetIndex(0);
      const firstSheet = parsed.sheets[0];
      const hdr =
        firstSheet?.geometry && firstSheet.geometry.length > 0
          ? guessGeometryHeaderIndex(firstSheet.geometry)
          : firstSheet
            ? guessHeaderRowIndex(firstSheet.grid)
            : 0;
      setHeaderRowIndex(hdr);
      lastHeaderSig.current = "";
      if (firstSheet) {
        const view = toTableView(firstSheet, hdr, 1);
        const sug = suggestTemplate(view.headers);
        setSuggestedTemplateName(sug?.name ?? null);
        setSmartImportApplied(false);
        setSmartUiMode("panel");
        setSmartImportWarning(null);
        preparedSmartRows.current = null;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Dosya işlenirken hata oluştu.");
      setDoc(null);
    } finally {
      setLoading(false);
    }
  }, []);

  /* ── Eşleştirme ── */
  const handleMappingChange = useCallback((columnIndex: number, next: Partial<ColumnMapping>) => {
    setMappings((prev) => prev.map((m) => (m.columnIndex === columnIndex ? { ...m, ...next } : m)));
  }, []);

  const handleApplyTemplate = useCallback(
    (templateId: string) => {
      if (!table) return;
      const tpl = templates.find((t) => t.id === templateId);
      if (!tpl) return;
      const mapped = applyTemplateToLogicalMappings(autoDetectMappings(table.headers), tpl.mappings);
      setMappings(mapped);
      setConstants(tpl.constants ?? {});
      setCodeMap(tpl.codeMap ?? {});
      setActiveTemplateId(tpl.id);
      lastHeaderSig.current = table.headers.join("|") + `#${headerRowIndex}#${sheetIndex}`;
    },
    [table, templates, headerRowIndex, sheetIndex],
  );

  const handleSaveTemplate = useCallback(
    (name: string) => {
      if (!table) return;
      const tpl: PuantajTemplate = {
        id: activeTemplateId ?? id("tpl"),
        name,
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        signature: buildSignature(table.headers),
        headerRowIndex,
        dateFormat: "auto",
        timeFormat: "auto",
        rangeSeparator: "-–—/",
        nightShiftRule: "nextDayIfEndBeforeStart",
        mappings,
        codeMap,
        constants,
        hourPriorityEnabled: true,
        multiPageBehavior: "mergeAll",
      };
      void (async () => {
        const saved = await saveTemplate(tpl);
        setActiveTemplateId(saved.id);
        setTemplates(await loadTemplatesSafe());
      })();
    },
    [table, activeTemplateId, headerRowIndex, mappings, codeMap, constants],
  );

  const handleDeleteTemplate = useCallback((templateId: string) => {
    void (async () => {
      await deleteTemplate(templateId);
      setTemplates(await loadTemplatesSafe());
    })();
  }, []);

  const handleDuplicateTemplate = useCallback((templateId: string) => {
    void (async () => {
      await duplicateTemplate(templateId);
      setTemplates(await loadTemplatesSafe());
    })();
  }, []);

  /* ── Standart satırları üret (kontrol adımına girerken) ── */
  const buildRows = useCallback(() => {
    if (smartImportApplied && preparedSmartRows.current) {
      const built = preparedSmartRows.current.map(migrateStandardRow);
      setRows(built);
      const groups = groupByPersonel(built);
      setSelectedKeys(groups.map((g) => g.key));
      return;
    }
    if (!table) return;
    const built = buildStandardRows(table, { mappings, constants, codeMap, headers: table.headers }).map(migrateStandardRow);
    setRows(built);
    const groups = groupByPersonel(built);
    setSelectedKeys(groups.map((g) => g.key));
  }, [table, mappings, constants, codeMap, smartImportApplied]);

  const handleSmartUse = useCallback(() => {
    if (!smartAnalysis?.ok || !doc) return;
    const adapted = adaptSmartImportToReview(
      smartAnalysis.canonicalRows,
      { headerRowIndex: smartAnalysis.headerRowIndex, segmentCount: smartAnalysis.segmentCount },
      codeMap,
    );
    const report = buildQualityReportFromStandardRows(smartAnalysis, adapted.rows);
    setQualityReport(report);
    setQualityModalOpen(true);
  }, [smartAnalysis, doc, codeMap]);

  const confirmSmartUse = useCallback(() => {
    if (!smartAnalysis?.ok) return;
    const adapted = adaptSmartImportToReview(
      smartAnalysis.canonicalRows,
      { headerRowIndex: smartAnalysis.headerRowIndex, segmentCount: smartAnalysis.segmentCount },
      codeMap,
    );
    preparedSmartRows.current = adapted.rows;
    setSmartImportApplied(true);
    setSmartUiMode("panel");
    setQualityModalOpen(false);
  }, [smartAnalysis, codeMap]);

  const handleSaveSmartTemplate = useCallback(
    (name: string) => {
      if (!smartAnalysis?.ok || !doc) return;
      const firstSheet = doc.sheets[0];
      if (!firstSheet) return;
      const fingerprint = buildWorkbookFingerprint(firstSheet.grid, smartAnalysis);
      const tpl: SmartImportMappingTemplate = {
        id: id("smart-tpl"),
        name,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        fingerprint,
        minSimilarity: 72,
        mappings: smartAnalysis.proposals
          .filter((p) => p.targetField)
          .map((p) => ({
            segmentIndex: p.segmentIndex,
            logicalGroupIndex: p.logicalColumnIndex,
            physicalColumns: p.physicalColumns,
            role: "unknown",
            targetField: p.targetField,
            confidence: p.confidence,
          })),
      };
      void (async () => {
        await saveSmartImportTemplate(tpl);
        setSmartTemplates(await loadSmartImportTemplatesSafe());
      })();
    },
    [smartAnalysis, doc],
  );

  const handleApplySmartTemplate = useCallback(
    (templateId: string) => {
      if (!smartAnalysis?.ok || !doc) return;
      const tpl = smartTemplates.find((t) => t.id === templateId);
      const firstSheet = doc.sheets[0];
      if (!tpl || !firstSheet) return;
      const fp = buildWorkbookFingerprint(firstSheet.grid, smartAnalysis);
      const similarity = fingerprintSimilarity(fp, tpl.fingerprint);
      if (similarity < (tpl.minSimilarity ?? 72)) {
        setSmartImportWarning(`Şablon benzerliği düşük (%${similarity}); lütfen öneriyi doğrulayın.`);
        return;
      }
      setSmartImportWarning(null);
      setSmartUiMode("review");
    },
    [smartAnalysis, doc, smartTemplates],
  );

  const handleDeleteSmartTemplate = useCallback((templateId: string) => {
    void (async () => {
      await deleteSmartImportTemplate(templateId);
      setSmartTemplates(await loadSmartImportTemplatesSafe());
    })();
  }, []);

  const handleSmartReview = useCallback(() => setSmartUiMode("review"), []);
  const handleSmartClassic = useCallback(() => {
    setSmartUiMode("hidden");
    setSmartImportApplied(false);
    preparedSmartRows.current = null;
  }, []);
  const handleSmartBackToPanel = useCallback(() => setSmartUiMode("panel"), []);

  /* ── Kontrol tablosu düzenleme ── */
  const handleEditCell = useCallback((rowId: string, field: EditableField, value: string) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== rowId) return r;
        let next: StandardRow = { ...r };
        if (field === "tarih") {
          const iso = parseDateToISO(value);
          next.tarih = iso ?? value;
        } else if (field === "izinTatilRaw") {
          next.izinTatilRaw = value;
          next.hamIzinAciklama = value;
          const fromIzin = extractIzinKodlari(value, codeMap);
          const fromMesai = extractIzinKodlari(next.hamMesaiAciklama ?? "", codeMap);
          next.durumKodlari = mergeDurumKodlari(fromMesai, fromIzin);
          next.izinTatilKodu = primaryIzinKod(next.durumKodlari);
        } else if (field === "kullanilanGiris" || field === "kullanilanCikis") {
          const norm = isValidTime(value) ? normalizeTimeString(value) : value;
          next[field] = norm;
          if (field === "kullanilanGiris") next.girisKaynagi = norm ? "manuel" : "yok";
          else next.cikisKaynagi = norm ? "manuel" : "yok";
        } else {
          const norm = isValidTime(value) ? normalizeTimeString(value) : value;
          next[field] = norm;
          const hp = applyHourPriority({
            kartGiris: next.kartGiris,
            kartCikis: next.kartCikis,
            esasGiris: next.esasCalismaGiris,
            esasCikis: next.esasCalismaCikis,
          });
          next.kullanilanGiris = hp.kullanilanGiris;
          next.kullanilanCikis = hp.kullanilanCikis;
          next.girisKaynagi = hp.girisKaynagi;
          next.cikisKaynagi = hp.cikisKaynagi;
        }
        return recomputeEditedRow(next);
      }),
    );
  }, [codeMap]);

  const handleResolveCode = useCallback((raw: string, kod: IzinKodKey) => {
    setCodeMap((prev) => {
      const nextMap = { ...prev, [raw]: kod };
      setRows((rprev) =>
        rprev.map((r) => {
          if (matchIzinKod(r.izinTatilRaw, prev) !== "BILINMIYOR") return r;
          if (r.izinTatilRaw !== raw && matchIzinKod(r.izinTatilRaw, nextMap) === "BILINMIYOR") return r;
          let updated = {
            ...r,
            izinTatilKodu: matchIzinKod(r.izinTatilRaw, nextMap),
            durumKodlari: mergeDurumKodlari(
              extractIzinKodlari(r.hamMesaiAciklama ?? "", nextMap),
              extractIzinKodlari(r.izinTatilRaw || r.hamIzinAciklama || "", nextMap),
            ),
          };
          updated.izinTatilKodu = primaryIzinKod(updated.durumKodlari);
          if (rowHasOff(updated) && !hasOffCardConflict(updated)) {
            updated = {
              ...updated,
              kartGiris: "",
              kartCikis: "",
              esasCalismaGiris: "",
              esasCalismaCikis: "",
              kullanilanGiris: "",
              kullanilanCikis: "",
              girisKaynagi: "yok",
              cikisKaynagi: "yok",
              ertesiGunCikis: false,
            };
          }
          const st = computeRowStatus(updated);
          return { ...updated, kontrolDurumu: st.status, durumNotlari: st.notlar };
        }),
      );
      return nextMap;
    });
  }, []);

  const handleDeleteRow = useCallback((rowId: string) => {
    setRows((prev) => prev.filter((r) => r.id !== rowId));
  }, []);

  const handleResolveOffKeepOff = useCallback((rowIds?: string[]) => {
    setRows((prev) => resolveOffKeepOffMany(prev, rowIds));
  }, []);

  const handleResolveOffKeepHours = useCallback((rowId: string) => {
    setRows((prev) => prev.map((r) => (r.id === rowId ? resolveOffKeepHours(r) : r)));
  }, []);

  const handleAddRow = useCallback(() => {
    const label = groupByPersonel(rows).find((g) => selectedKeys.includes(g.key))?.label ?? "";
    const empty: StandardRow = {
      id: id("prow"),
      personelAdSoyad: label,
      birim: "",
      pozisyon: "",
      tarih: "",
      kartGiris: "",
      kartCikis: "",
      kartAralikHam: "",
      esasCalismaGiris: "",
      esasCalismaCikis: "",
      esasCalismaAralikHam: "",
      kullanilanGiris: "",
      kullanilanCikis: "",
      girisKaynagi: "yok",
      cikisKaynagi: "yok",
      izinTatilRaw: "",
      izinTatilKodu: "CALISTI",
      durumKodlari: [],
      hamMesaiAciklama: "",
      hamIzinAciklama: "",
      aciklama: "",
      kontrolDurumu: "red",
      durumNotlari: ["Yeni satır — bilgileri doldurun."],
      kaynakSayfa: 1,
      okumaGuveni: 1,
      ertesiGunCikis: false,
      userEdited: true,
      aralikKontrolGerekli: false,
    };
    setRows((prev) => [...prev, empty]);
  }, [rows, selectedKeys]);

  /* ── Personel seçimi ── */
  const groups = useMemo(() => groupByPersonel(rows), [rows]);
  const visibleRows = useMemo(
    () => rows.filter((r) => selectedKeys.includes((r.personelAdSoyad || "Belirtilmemiş").toLocaleLowerCase("tr-TR").trim())),
    [rows, selectedKeys],
  );
  const unknownDescriptions = useMemo(
    () => collectUnknownDescriptions(visibleRows.map((r) => r.izinTatilRaw), codeMap),
    [visibleRows, codeMap],
  );
  const redCount = useMemo(() => visibleRows.filter((r) => r.kontrolDurumu === "red").length, [visibleRows]);
  const offConflictCount = useMemo(
    () => visibleRows.filter((r) => isOffConflictRow(r)).length,
    [visibleRows],
  );
  const reviewBlockCount = redCount + offConflictCount;

  const offAuditReport = useMemo(() => {
    if (!table || rows.length === 0) return null;
    return buildOffAuditReport({
      table,
      mappings,
      constants,
      codeMap,
      standardRows: rows,
      calcDateStart: settings.calcDateStart,
      calcDateEnd: settings.calcDateEnd,
    });
  }, [table, rows, mappings, constants, codeMap, settings.calcDateStart, settings.calcDateEnd]);

  const togglePersonel = useCallback((key: string) => {
    setSelectedKeys((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }, []);
  const selectAllPersonel = useCallback(() => {
    setSelectedKeys((prev) => (prev.length === groups.length ? [] : groups.map((g) => g.key)));
  }, [groups]);

  /* ── Hesaplama ── */
  const runCalculation = useCallback(() => {
    const perPersonel = groups
      .filter((g) => selectedKeys.includes(g.key))
      .map((g) => computePuantajFm(g.rows, settings, katsayi));
    setResults(perPersonel);
  }, [groups, selectedKeys, settings, katsayi]);

  /* ── Navigasyon ── */
  const resetAll = useCallback(() => {
    setStep("upload");
    setMaxReached(0);
    setDoc(null);
    setError(null);
    setMappings([]);
    setConstants({});
    setCodeMap({});
    setActiveTemplateId(null);
    setSuggestedTemplateName(null);
    setRows([]);
    setSelectedKeys([]);
    setResults([]);
    setKatsayi(1);
    setSettings(DEFAULT_CALC_SETTINGS);
    setSmartAnalysis(null);
    setSmartUiMode("panel");
    setSmartImportApplied(false);
    setSmartImportWarning(null);
    preparedSmartRows.current = null;
    lastHeaderSig.current = "";
  }, []);

  const goNext = useCallback(() => {
    if (step === "upload") {
      if (!table) return;
      reachStep("mapping");
    } else if (step === "mapping") {
      buildRows();
      reachStep("review");
    } else if (step === "review") {
      if (reviewBlockCount > 0) return;
      const allRows = groups.filter((g) => selectedKeys.includes(g.key)).flatMap((g) => g.rows);
      const inferred = inferCalcDateRange(allRows);
      if (inferred && (!settings.calcDateStart || !settings.calcDateEnd)) {
        setSettings((s) => ({
          ...s,
          calcDateStart: s.calcDateStart ?? inferred.start,
          calcDateEnd: s.calcDateEnd ?? inferred.end,
        }));
      }
      reachStep("calculate");
    } else if (step === "calculate") {
      runCalculation();
      reachStep("report");
    }
  }, [step, table, reviewBlockCount, reachStep, buildRows, runCalculation, groups, selectedKeys, settings.calcDateStart, settings.calcDateEnd]);

  const goBack = useCallback(() => {
    const idx = STEP_ORDER.indexOf(step);
    if (idx > 0) setStep(STEP_ORDER[idx - 1]);
  }, [step]);

  const activeTemplateName = templates.find((t) => t.id === activeTemplateId)?.name ?? null;

  const nextLabel = useMemo(() => {
    switch (step) {
      case "upload": return "Alanları Eşleştir";
      case "mapping": return "Verileri Kontrol Et";
      case "review": return "Onayla ve Hesapla";
      case "calculate": return "Hesapla";
      default: return "";
    }
  }, [step]);

  const mappingCoverage = useMemo(
    () => (smartImportApplied ? { sufficient: true, missingLabels: [] } : validateMappingCoverage(mappings)),
    [mappings, smartImportApplied],
  );

  const canNext = useMemo(() => {
    if (step === "upload") return !!table;
    if (step === "mapping") return smartImportApplied || (mappings.some((m) => m.mode === "field") && mappingCoverage.sufficient);
    if (step === "review") return visibleRows.length > 0 && reviewBlockCount === 0;
    if (step === "calculate") return selectedKeys.length > 0;
    return false;
  }, [step, table, mappings, visibleRows, reviewBlockCount, selectedKeys, smartImportApplied, mappingCoverage.sufficient]);

  const stickyStatus = useMemo(() => {
    if (step === "review") {
      if (offConflictCount > 0) {
        return `${offConflictCount} OFF kaydı kart saatiyle çelişiyor — kontrol edin`;
      }
      return redCount > 0
        ? `${redCount} kayıt yetersiz — düzeltilmeden hesaplanamaz`
        : `${visibleRows.length} kayıt onaya hazır`;
    }
    if (step === "calculate") return `${selectedKeys.length} personel seçili`;
    return "";
  }, [step, redCount, offConflictCount, visibleRows.length, selectedKeys.length]);

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div>
          <h1 className={styles.title}>Puantaj Kayıtlarına Göre Fazla Mesai</h1>
          <p className={styles.desc}>
            Puantaj belgenizi yükleyin, alanları eşleştirin, kayıtları kontrol edin ve fazla mesai cetvelini
            oluşturun. Dosya cihazınızda işlenir; eşleştirme şablonları hesabınıza kaydedilir.
          </p>
          <div className={styles.privacyBadge}>
            <ShieldCheck size={14} /> Dosya cihaz dışına gönderilmez · şablonlar hesabınıza kaydedilir
          </div>
        </div>
      </header>

      <Stepper current={step} maxReached={maxReached} onSelect={(s) => setStep(s)} />

      {step === "upload" && (
        <UploadStep
          doc={doc}
          table={table}
          loading={loading}
          error={error}
          sheetIndex={sheetIndex}
          headerRowIndex={headerRowIndex}
          suggestedTemplateName={suggestedTemplateName}
          onFile={handleFile}
          onSheetChange={setSheetIndex}
          onHeaderRowChange={setHeaderRowIndex}
        />
      )}

      {step === "mapping" && table && (
        <MappingStep
          table={table}
          mappings={mappings}
          templates={templates}
          onMappingChange={handleMappingChange}
          onApplyTemplate={handleApplyTemplate}
          onSaveTemplate={handleSaveTemplate}
          onDeleteTemplate={handleDeleteTemplate}
          onDuplicateTemplate={handleDuplicateTemplate}
          smartAnalysis={smartAnalysis}
          smartUiMode={smartUiMode}
          smartWarning={smartImportWarning}
          smartApplied={smartImportApplied}
          smartAnalyzing={smartAnalyzing}
          smartProgress={smartProgress}
          smartTemplates={smartTemplates}
          onSmartUse={handleSmartUse}
          onSmartReview={handleSmartReview}
          onSmartClassic={handleSmartClassic}
          onSmartBackToPanel={handleSmartBackToPanel}
          onSaveSmartTemplate={handleSaveSmartTemplate}
          onApplySmartTemplate={handleApplySmartTemplate}
          onDeleteSmartTemplate={handleDeleteSmartTemplate}
          mappingCoverageMissing={mappingCoverage.sufficient ? [] : mappingCoverage.missingLabels}
        />
      )}

      {step === "review" && (
        <ReviewStep
          groups={groups}
          selectedKeys={selectedKeys}
          visibleRows={visibleRows}
          unknownDescriptions={unknownDescriptions}
          redCount={redCount}
          offConflictCount={offConflictCount}
          onTogglePersonel={togglePersonel}
          onSelectAllPersonel={selectAllPersonel}
          onEditCell={handleEditCell}
          onResolveCode={handleResolveCode}
          onDeleteRow={handleDeleteRow}
          onAddRow={handleAddRow}
          onResolveOffKeepOff={handleResolveOffKeepOff}
          onResolveOffKeepHours={handleResolveOffKeepHours}
        />
      )}

      {step === "calculate" && (
        <CalculateStep
          settings={settings}
          katsayi={katsayi}
          personelCount={selectedKeys.length}
          onSettingsChange={(next) => setSettings((prev) => ({ ...prev, ...next }))}
          onKatsayiChange={setKatsayi}
        />
      )}

      {step === "report" && (
        <ReportStep
          results={results}
          fileName={doc?.fileName ?? ""}
          templateName={activeTemplateName}
          settings={settings}
          katsayi={katsayi}
        />
      )}

      <div className={styles.stickyBar}>
        <div className={styles.stickyInner}>
          <span className={styles.stickyStatus}>{stickyStatus}</span>
          <div className={styles.stickyActions}>
            <button type="button" className={styles.btn} onClick={resetAll}>
              <RefreshCw size={14} /> Yeni
            </button>
            {offAuditReport && (step === "review" || step === "calculate" || step === "report") && (
              <button type="button" className={styles.btn} onClick={() => setOffAuditOpen(true)}>
                OFF Denetimi
              </button>
            )}
            {step !== "upload" && (
              <button type="button" className={styles.btn} onClick={goBack}>
                <ArrowLeft size={14} /> Geri
              </button>
            )}
            {step !== "report" && (
              <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={goNext} disabled={!canNext}>
                {nextLabel} <ArrowRight size={14} />
              </button>
            )}
          </div>
        </div>
      </div>

      <OffAuditModal report={offAuditReport} open={offAuditOpen} onClose={() => setOffAuditOpen(false)} />
      <SmartQualityReportModal
        open={qualityModalOpen}
        report={qualityReport}
        onConfirm={confirmSmartUse}
        onCancel={() => setQualityModalOpen(false)}
      />
    </div>
  );
}
