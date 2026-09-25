/**
 * Puantaj Kayıtlarına Göre Fazla Mesai — BAĞIMSIZ lokal hesap motoru.
 *
 * Mevcut Standart Fazla Mesai motorunu import ETMEZ. Yalnızca sonuç doğrulama
 * referansı olarak incelenmiş olan yasal davranış (haftalık 45 saat sınırı,
 * ara dinlenme tablosu, saatlik ücret = brüt/225, fazla mesai katsayısı 1,5)
 * burada bağımsız yeniden yazılmıştır. Tamamen saf/test edilebilir; ağ yok.
 */

import { getAsgariByDate } from "./asgari";
import { isNonWorkingCode, isNonWorkingDurum, rowHasOff, ensureDurumKodlari } from "./codes";
import { deriveValidOffDays } from "./offAudit";
import type {
  CalcSettings,
  DailyWorkRow,
  PuantajFmResult,
  StandardRow,
  WeeklyCetvelRow,
} from "./model";
import { OFF_HOURS_PER_DAY } from "./model";
import { grossHoursBetween, id, isValidISODate, isValidTime, round2, weekStartMonday } from "./utils";

const DENOMINATOR = 225; // 30 gün × 7,5 saat
const FM_KATSAYI = 1.5; // fazla mesai zamlı ücret çarpanı

export const DEFAULT_CALC_SETTINGS: CalcSettings = {
  weeklyLimit: 45,
  breakRule: { kind: "auto" },
  applyEquityDiscount: true,
  equityDivisor: 3,
  mahsup: 0,
};

/**
 * Ara dinlenme (4857 s.K. m.68): ≤4 sa → 0,25; ≤7,5 → 0,5; <11 → 1;
 * <14 → 1,5; <15 → 2; ≥15 → 3.
 */
export function computeBreakHours(gross: number): number {
  if (!Number.isFinite(gross) || gross <= 0) return 0;
  if (gross <= 4) return 0.25;
  if (gross <= 7.5) return 0.5;
  if (gross < 11) return 1;
  if (gross < 14) return 1.5;
  if (gross < 15) return 2;
  return 3;
}

/** Haftalık fiili çalışmayı yarım saate yuvarlar (.5 kaybı olmadan üste). */
export function ceilWeeklyToHalf(total: number): number {
  if (!Number.isFinite(total) || total <= 0) return 0;
  const EPS = 1e-7;
  const doubled = total * 2;
  const nearest = Math.round(doubled);
  if (Math.abs(doubled - nearest) < EPS) return nearest / 2;
  return Math.ceil(doubled - EPS) / 2;
}

/** Tek satırın günlük çalışma bilgisini üretir. */
export function buildDailyRow(row: StandardRow, settings: CalcSettings): DailyWorkRow {
  const kodlar = ensureDurumKodlari(row);
  const kod = row.izinTatilKodu;

  if (rowHasOff(row)) {
    return {
      rowId: row.id,
      tarih: row.tarih,
      kullanilanGiris: "",
      kullanilanCikis: "",
      ertesiGunCikis: false,
      brutSaat: 0,
      molaSaat: 0,
      netSaat: 0,
      izinTatilKodu: kod,
      durumKodlari: kodlar,
      girisKaynagi: row.girisKaynagi,
      cikisKaynagi: row.cikisKaynagi,
      dahil: false,
      not: kodlar.includes("RAPOR")
        ? "Fazla mesai karşılığı izin (OFF) · Rapor"
        : "Fazla mesai karşılığı izin (OFF)",
    };
  }

  const nonWorking = isNonWorkingDurum(kodlar) || isNonWorkingCode(kod);

  let brutSaat = 0;
  let molaSaat = 0;
  let netSaat = 0;
  let ertesiGun = row.ertesiGunCikis;
  let not: string | undefined;

  if (!nonWorking && isValidTime(row.kullanilanGiris) && isValidTime(row.kullanilanCikis)) {
    const g = grossHoursBetween(row.kullanilanGiris, row.kullanilanCikis);
    if (g) {
      brutSaat = g.hours;
      ertesiGun = g.ertesiGun;
      molaSaat = settings.breakRule.kind === "fixed" ? settings.breakRule.hours : computeBreakHours(g.hours);
      netSaat = round2(Math.max(0, brutSaat - molaSaat));
    }
  } else if (nonWorking) {
    not = "Çalışma dışı gün (fazla mesaiye dahil değil).";
  } else {
    not = "Saat bilgisi yetersiz.";
  }

  return {
    rowId: row.id,
    tarih: row.tarih,
    kullanilanGiris: row.kullanilanGiris,
    kullanilanCikis: row.kullanilanCikis,
    ertesiGunCikis: ertesiGun,
    brutSaat,
    molaSaat,
    netSaat,
    izinTatilKodu: kod,
    durumKodlari: kodlar,
    girisKaynagi: row.girisKaynagi,
    cikisKaynagi: row.cikisKaynagi,
    dahil: !nonWorking && netSaat > 0,
    not,
  };
}

type WeekBucket = { startISO: string; rows: DailyWorkRow[] };

function bucketByWeek(dailyRows: DailyWorkRow[]): { weeks: WeekBucket[]; datesizNotu: boolean } {
  const map = new Map<string, WeekBucket>();
  let datesiz = false;
  for (const d of dailyRows) {
    if (!isValidISODate(d.tarih)) {
      datesiz = true;
      continue;
    }
    const key = weekStartMonday(d.tarih);
    if (!map.has(key)) map.set(key, { startISO: key, rows: [] });
    map.get(key)!.rows.push(d);
  }
  const weeks = [...map.values()].sort((a, b) => (a.startISO < b.startISO ? -1 : 1));
  return { weeks, datesizNotu: datesiz };
}

/** @deprecated deriveValidOffDays kullanın — geriye dönük test uyumu. */
export function countOffDaysInRange(
  rows: StandardRow[],
  rangeStart?: string,
  rangeEnd?: string,
): number {
  return deriveValidOffDays(rows, rangeStart, rangeEnd).length;
}

/** Satırlardan geçerli ISO tarihlerin min–max aralığını çıkarır. */
export function inferCalcDateRange(rows: StandardRow[]): { start: string; end: string } | null {
  const dates = rows.map((r) => r.tarih).filter((d) => isValidISODate(d)).sort();
  if (dates.length === 0) return null;
  return { start: dates[0], end: dates[dates.length - 1] };
}

/** Onaylanmış standart satırlardan tek personelin FM hesabını üretir. */
export function computePuantajFm(
  rows: StandardRow[],
  settings: CalcSettings,
  katsayi = 1,
): PuantajFmResult {
  const personelAdSoyad = rows.find((r) => r.personelAdSoyad)?.personelAdSoyad ?? "Belirtilmemiş";
  const birim = rows.find((r) => r.birim?.trim())?.birim?.trim() ?? "";
  const pozisyon = rows.find((r) => r.pozisyon?.trim())?.pozisyon?.trim() ?? "";
  const dailyRows = rows.map((r) => buildDailyRow(r, settings));

  const { weeks, datesizNotu } = bucketByWeek(dailyRows);
  const weeklyRows: WeeklyCetvelRow[] = [];

  for (const wk of weeks) {
    const included = wk.rows.filter((r) => r.dahil);
    const calisilanGun = included.length;
    const netHaftalik = round2(included.reduce((s, r) => s + r.netSaat, 0));
    const netRounded = ceilWeeklyToHalf(netHaftalik);
    const fmSaat = round2(Math.max(0, netRounded - settings.weeklyLimit));

    const asgari = getAsgariByDate(wk.startISO);
    const saatlik = asgari != null ? round2(asgari / DENOMINATOR) : 0;
    const fmTutari = asgari != null ? round2((fmSaat * asgari * katsayi * FM_KATSAYI) / DENOMINATOR) : 0;

    weeklyRows.push({
      id: id("wk"),
      haftaBaslangicISO: wk.startISO,
      haftaBitisISO: addDays(wk.startISO, 6),
      calisilanGunSayisi: calisilanGun,
      netHaftalikSaat: netHaftalik,
      haftalikFmSaat: fmSaat,
      asgariUcret: asgari,
      saatlikUcret: saatlik,
      katsayi,
      fmTutari,
      not: asgari == null ? "Asgari ücret dönemi bulunamadı." : undefined,
    });
  }

  const hesaplananToplamFmSaat = round2(weeklyRows.reduce((s, r) => s + r.haftalikFmSaat, 0));
  const rangeStart = settings.calcDateStart;
  const rangeEnd = settings.calcDateEnd;
  const offValidatedDays = deriveValidOffDays(rows, rangeStart, rangeEnd);
  const offGunSayisi = offValidatedDays.length;
  const offSaatKarsiligi = OFF_HOURS_PER_DAY;
  const offMahsupSaati = round2(offGunSayisi * offSaatKarsiligi);
  const toplamFmSaat = round2(Math.max(0, hesaplananToplamFmSaat - offMahsupSaati));

  const rawFmTutari = round2(weeklyRows.reduce((s, r) => s + r.fmTutari, 0));
  const toplamFmTutari =
    hesaplananToplamFmSaat > 0
      ? round2((rawFmTutari * toplamFmSaat) / hesaplananToplamFmSaat)
      : 0;
  const hakkaniyet = settings.applyEquityDiscount
    ? round2(toplamFmTutari / (settings.equityDivisor || 3))
    : 0;
  const mahsup = round2(settings.mahsup || 0);
  const sonTutar = Math.max(0, round2(toplamFmTutari - hakkaniyet - mahsup));

  const notlar: string[] = [];
  if (datesizNotu) notlar.push("Tarihi ayrıştırılamayan kayıtlar haftalık hesaba dahil edilmedi.");
  if (offGunSayisi > 0) {
    notlar.push(
      `OFF mahsubu: ${offGunSayisi} gün × ${offSaatKarsiligi} saat = ${offMahsupSaati} saat (tarih aralığı: ${rangeStart ?? "—"} – ${rangeEnd ?? "—"}).`,
    );
  }

  return {
    personelAdSoyad,
    birim,
    pozisyon,
    dailyRows,
    weeklyRows,
    hesaplananToplamFmSaat,
    toplamFmSaat,
    offValidatedDays,
    offGunSayisi,
    offSaatKarsiligi,
    offMahsupSaati,
    toplamFmTutari,
    hakkaniyetIndirimi: hakkaniyet,
    mahsup,
    sonTutar,
    stats: computeStats(rows, dailyRows),
    notlar,
  };
}

function computeStats(rows: StandardRow[], dailyRows: DailyWorkRow[]): PuantajFmResult["stats"] {
  const duzeltilen = rows.filter((r) => r.userEdited).length;
  const tamamlanan = rows.filter((r) => r.girisKaynagi === "esas" || r.cikisKaynagi === "esas").length;
  const karttanAlinan = dailyRows.filter(
    (r) => r.girisKaynagi === "kart" && r.cikisKaynagi === "kart" && r.dahil,
  ).length;
  const vardiyadan = dailyRows.filter(
    (r) => (r.girisKaynagi === "esas" || r.cikisKaynagi === "esas") && r.dahil,
  ).length;
  return {
    duzeltilenKayit: duzeltilen,
    tamamlananKayit: tamamlanan,
    karttanAlinanSaat: karttanAlinan,
    vardiyadanTamamlanan: vardiyadan,
    kullaniciDegistirdi: duzeltilen,
  };
}

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(
    dt.getUTCDate(),
  ).padStart(2, "0")}`;
}
