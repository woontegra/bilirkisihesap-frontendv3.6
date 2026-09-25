import { extractIzinKodlari, mergeDurumKodlari, primaryIzinKod } from "../codes";
import type { CodeMap, IzinKodKey, StandardRow } from "../model";
import { applyHourPriority, computeRowStatus } from "../transform";
import { parseCombinedTimeCell } from "../timeRange";
import { id, isValidTime, normalizeTimeString, parseDateToISO } from "../utils";
import type { CanonicalAttendanceRow } from "./types";

/**
 * CanonicalAttendanceRow → mevcut StandardRow modeli (Verileri Kontrol Et adımı).
 * Mesai/vardiya saat aralıkları yalnızca esas çalışma alanına yazılır; izin alanına aktarılmaz.
 */
export function canonicalRowsToStandardRows(
  rows: CanonicalAttendanceRow[],
  codeMap: CodeMap = {},
  pageNumber = 1,
): StandardRow[] {
  return rows.map((row) => {
    const tarihRaw = row.workDate ?? "";
    const tarihIso = parseDateToISO(tarihRaw) ?? tarihRaw;

    let kartGiris = row.actualEntry ?? "";
    let kartCikis = row.actualExit ?? "";
    let esasGiris = row.plannedEntry ?? "";
    let esasCikis = row.plannedExit ?? "";
    let esasAralikHam = "";
    const kartAralikHam = "";
    let ertesiGun = false;
    let aralikKontrol = false;
    const aralikNotlari: string[] = [];

    let hamMesaiAciklama = "";
    const hamIzinAciklama = (row.leaveText ?? "").trim();
    let mesaiKodlari: IzinKodKey[] = [];

    const shiftRaw = (row.plannedShiftText ?? "").trim();
    if (shiftRaw) {
      const parsed = parseCombinedTimeCell(shiftRaw, codeMap);
      if (parsed.kind === "range") {
        esasAralikHam = parsed.raw;
        esasGiris = parsed.start || esasGiris;
        esasCikis = parsed.end || esasCikis;
        if (parsed.ertesiGun) ertesiGun = true;
      } else if (parsed.kind === "izin") {
        hamMesaiAciklama = parsed.raw;
        mesaiKodlari = mergeDurumKodlari(mesaiKodlari, extractIzinKodlari(parsed.raw, codeMap));
      } else if (parsed.reason !== "empty") {
        esasAralikHam = parsed.raw;
        aralikKontrol = true;
        aralikNotlari.push(
          parsed.reason === "single"
            ? "Birleşik saat hücresinde tek saat var; giriş-çıkış ayrıştırılamadı."
            : "Birleşik saat hücresi ayrıştırılamadı; kullanıcı kontrolü gerekli.",
        );
      }
    }

    if (kartGiris && isValidTime(kartGiris)) kartGiris = normalizeTimeString(kartGiris);
    if (kartCikis && isValidTime(kartCikis)) kartCikis = normalizeTimeString(kartCikis);
    if (esasGiris && isValidTime(esasGiris)) esasGiris = normalizeTimeString(esasGiris);
    if (esasCikis && isValidTime(esasCikis)) esasCikis = normalizeTimeString(esasCikis);

    if (kartGiris && kartCikis) {
      const gi = parseTimeMinutes(kartGiris);
      const ci = parseTimeMinutes(kartCikis);
      if (gi != null && ci != null && ci < gi) ertesiGun = true;
    }

    const izinKodlari = extractIzinKodlari(hamIzinAciklama, codeMap);
    const durumKodlari = mergeDurumKodlari(mesaiKodlari, izinKodlari);
    const izinTatilKodu = primaryIzinKod(durumKodlari);
    const izinTatilRaw = [hamMesaiAciklama, hamIzinAciklama].filter(Boolean).join(" · ");

    const hp = applyHourPriority({
      kartGiris,
      kartCikis,
      esasGiris,
      esasCikis,
    });

    const draft: StandardRow = {
      id: id("srow"),
      personelAdSoyad: row.employeeName ?? row.employeeId ?? "",
      birim: row.department ?? "",
      pozisyon: row.position ?? "",
      tarih: tarihIso,
      kartGiris,
      kartCikis,
      kartAralikHam,
      esasCalismaGiris: esasGiris,
      esasCalismaCikis: esasCikis,
      esasCalismaAralikHam: esasAralikHam,
      kullanilanGiris: hp.kullanilanGiris,
      kullanilanCikis: hp.kullanilanCikis,
      girisKaynagi: hp.girisKaynagi,
      cikisKaynagi: hp.cikisKaynagi,
      izinTatilRaw,
      izinTatilKodu,
      durumKodlari,
      hamMesaiAciklama: hamMesaiAciklama,
      hamIzinAciklama: hamIzinAciklama,
      aciklama: "",
      kontrolDurumu: "green",
      durumNotlari: aralikNotlari,
      kaynakSayfa: pageNumber,
      kaynakSatirSira: row.sourceRow - 1,
      okumaGuveni: 0.85,
      ertesiGunCikis: ertesiGun,
      userEdited: false,
      aralikKontrolGerekli: aralikKontrol,
    };

    const status = computeRowStatus(draft);
    return {
      ...draft,
      kontrolDurumu: status.status,
      durumNotlari: [...new Set([...draft.durumNotlari, ...status.notlar])],
    };
  });
}

function parseTimeMinutes(t: string): number | null {
  const m = t.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

export type SmartImportAdapterResult = {
  rows: StandardRow[];
  headerRowIndex: number;
  segmentCount: number;
  dataRowCount: number;
};

export function adaptSmartImportToReview(
  canonicalRows: CanonicalAttendanceRow[],
  meta: { headerRowIndex: number; segmentCount: number },
  codeMap: CodeMap = {},
): SmartImportAdapterResult {
  return {
    rows: canonicalRowsToStandardRows(canonicalRows, codeMap),
    headerRowIndex: meta.headerRowIndex,
    segmentCount: meta.segmentCount,
    dataRowCount: canonicalRows.length,
  };
}
