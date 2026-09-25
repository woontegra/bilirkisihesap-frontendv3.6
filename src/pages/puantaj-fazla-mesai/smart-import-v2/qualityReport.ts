import { isNonWorkingCode, rowHasOff } from "../codes";
import type { IzinKodKey, StandardRow } from "../model";
import { hasOffCardConflict, isOffConflictRow } from "../transform";
import { isValidISODate, isValidTime } from "../utils";
import type { SmartImportAnalysis } from "./types";

export type QualityIssueRow = {
  sourceRow: number;
  reason: string;
};

export type InsufficientReasonKey =
  | "kart_giris_eksik"
  | "kart_cikis_eksik"
  | "tarih_eksik_gecersiz"
  | "aciklama_taninamadi"
  | "off_celiskisi"
  | "aralik_kontrol"
  | "diger";

export type SmartImportQualityReport = {
  totalSourceRows: number;
  normalizedRows: number;
  segmentCount: number;
  validDateCount: number;
  rowsWithEntryAndExit: number;
  rowsWithEntryOnly: number;
  rowsWithExitOnly: number;
  offCount: number;
  weeklyRestCount: number;
  leaveCount: number;
  invalidDateCount: number;
  duplicateColumnCount: number;
  duplicateRowCount: number;
  possibleNightShiftCount: number;
  lowConfidenceCount: number;
  insufficientCount: number;
  offConflictCount: number;
  insufficientReasons: Record<InsufficientReasonKey, number>;
  issueRows: QualityIssueRow[];
};

function rowKey(r: StandardRow): string {
  return [r.personelAdSoyad, r.tarih, r.kartGiris, r.kartCikis, r.esasCalismaAralikHam, r.izinTatilRaw].join("|");
}

function isExemptFromCardHours(row: StandardRow): boolean {
  const kod = row.izinTatilKodu;
  return isNonWorkingCode(kod) && kod !== "BILINMIYOR";
}

export function classifyInsufficientReason(row: StandardRow): InsufficientReasonKey | null {
  if (isOffConflictRow(row)) return "off_celiskisi";
  if (row.kontrolDurumu !== "red") return null;

  if (row.aralikKontrolGerekli) return "aralik_kontrol";
  if (row.izinTatilKodu === "BILINMIYOR" && row.izinTatilRaw) return "aciklama_taninamadi";
  if (!row.tarih || !isValidISODate(row.tarih)) return "tarih_eksik_gecersiz";

  const hasGiris = isValidTime(row.kullanilanGiris);
  const hasCikis = isValidTime(row.kullanilanCikis);
  if (!hasGiris && !hasCikis) {
    if (!isValidTime(row.kartGiris)) return "kart_giris_eksik";
    if (!isValidTime(row.kartCikis)) return "kart_cikis_eksik";
    return "kart_giris_eksik";
  }
  if (!hasGiris) return "kart_giris_eksik";
  if (!hasCikis) return "kart_cikis_eksik";
  return "diger";
}

/** @deprecated canonical satırlardan rapor — buildQualityReportFromStandardRows kullanın */
export function buildQualityReport(
  analysis: SmartImportAnalysis,
  rows: { sourceRow: number; workDate?: string; actualEntry?: string; actualExit?: string; plannedShiftText?: string }[],
): SmartImportQualityReport {
  const stdLike: StandardRow[] = rows.map((r, i) => ({
    id: String(i),
    tarih: r.workDate ?? "",
    kartGiris: r.actualEntry ?? "",
    kartCikis: r.actualExit ?? "",
    esasCalismaAralikHam: r.plannedShiftText ?? "",
    izinTatilRaw: "",
    izinTatilKodu: "CALISTI",
    durumKodlari: [] as IzinKodKey[],
    kontrolDurumu: "green",
    kaynakSatirSira: r.sourceRow,
    kullanilanGiris: r.actualEntry ?? "",
    kullanilanCikis: r.actualExit ?? "",
    girisKaynagi: "kart",
    cikisKaynagi: "kart",
    personelAdSoyad: "",
    birim: "",
    pozisyon: "",
    kartAralikHam: "",
    esasCalismaGiris: "",
    esasCalismaCikis: "",
    hamMesaiAciklama: "",
    hamIzinAciklama: "",
    aciklama: "",
    durumNotlari: [],
    kaynakSayfa: 1,
    okumaGuveni: 1,
    ertesiGunCikis: false,
    userEdited: false,
    aralikKontrolGerekli: false,
  }));
  return buildQualityReportFromStandardRows(analysis, stdLike);
}

/** Verileri Kontrol Et adımına gidecek gerçek StandardRow listesinden kalite raporu üretir. */
export function buildQualityReportFromStandardRows(
  analysis: SmartImportAnalysis,
  rows: StandardRow[],
): SmartImportQualityReport {
  const issueRows: QualityIssueRow[] = [];
  const insufficientReasons: Record<InsufficientReasonKey, number> = {
    kart_giris_eksik: 0,
    kart_cikis_eksik: 0,
    tarih_eksik_gecersiz: 0,
    aciklama_taninamadi: 0,
    off_celiskisi: 0,
    aralik_kontrol: 0,
    diger: 0,
  };

  let validDateCount = 0;
  let invalidDateCount = 0;
  let rowsWithEntryAndExit = 0;
  let rowsWithEntryOnly = 0;
  let rowsWithExitOnly = 0;
  let offCount = 0;
  let weeklyRestCount = 0;
  let leaveCount = 0;
  let possibleNightShiftCount = 0;
  let insufficientCount = 0;
  let offConflictCount = 0;

  const seen = new Map<string, number>();
  let duplicateRowCount = 0;

  for (const row of rows) {
    const sourceRow = (row.kaynakSatirSira ?? 0) + 1;
    const hasKartGiris = isValidTime(row.kartGiris);
    const hasKartCikis = isValidTime(row.kartCikis);
    const exempt = isExemptFromCardHours(row);

    if (row.tarih) {
      if (isValidISODate(row.tarih)) validDateCount += 1;
      else {
        invalidDateCount += 1;
        issueRows.push({ sourceRow, reason: "Geçersiz tarih" });
      }
    }

    if (!exempt) {
      if (hasKartGiris && hasKartCikis) rowsWithEntryAndExit += 1;
      else if (hasKartGiris) {
        rowsWithEntryOnly += 1;
        issueRows.push({ sourceRow, reason: "Yalnız giriş saati" });
      } else if (hasKartCikis) {
        rowsWithExitOnly += 1;
        issueRows.push({ sourceRow, reason: "Yalnız çıkış saati" });
      } else if (!row.tarih || !isValidISODate(row.tarih)) {
        issueRows.push({ sourceRow, reason: "Zorunlu alan eksik (tarih/giriş/çıkış)" });
      } else if (row.kontrolDurumu === "red") {
        issueRows.push({ sourceRow, reason: "Zorunlu saat alanı eksik" });
      }
    }

    if (rowHasOff(row)) offCount += 1;
    if (row.izinTatilKodu === "HAFTA_TATILI" || row.durumKodlari?.includes("HAFTA_TATILI")) weeklyRestCount += 1;
    if (
      row.izinTatilKodu === "YILLIK_IZIN" ||
      row.izinTatilKodu === "IZIN" ||
      row.izinTatilKodu === "RAPOR" ||
      row.durumKodlari?.some((k) => k === "YILLIK_IZIN" || k === "IZIN" || k === "RAPOR")
    ) {
      leaveCount += 1;
    }

    if (row.esasCalismaAralikHam?.includes("-") && /20:|21:|22:|23:|00:|01:/.test(row.esasCalismaAralikHam)) {
      possibleNightShiftCount += 1;
    }

    if (row.kontrolDurumu === "red") {
      insufficientCount += 1;
      const reason = classifyInsufficientReason(row);
      if (reason) insufficientReasons[reason] += 1;
    }

    if (hasOffCardConflict(row)) {
      offConflictCount += 1;
      issueRows.push({ sourceRow, reason: "OFF/kart çelişkisi" });
    }

    const k = rowKey(row);
    const prev = seen.get(k) ?? 0;
    seen.set(k, prev + 1);
    if (prev === 1) duplicateRowCount += 1;
  }

  return {
    totalSourceRows: analysis.dataRowCount,
    normalizedRows: rows.length,
    segmentCount: analysis.segmentCount,
    validDateCount,
    rowsWithEntryAndExit,
    rowsWithEntryOnly,
    rowsWithExitOnly,
    offCount,
    weeklyRestCount,
    leaveCount,
    invalidDateCount,
    duplicateColumnCount: analysis.duplicateColumns.length,
    duplicateRowCount,
    possibleNightShiftCount,
    lowConfidenceCount: analysis.stats.lowConfidence,
    insufficientCount,
    offConflictCount,
    insufficientReasons,
    issueRows: issueRows.slice(0, 200),
  };
}
