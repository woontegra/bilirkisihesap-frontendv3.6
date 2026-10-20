/**
 * Resmî fazla mesai hesap cetveli — yalnızca rapor katmanı.
 * Mevcut PuantajFmResult'tan görünüm satırları üretir; motor/sonuç değiştirmez.
 */

import type { CalcSettings, DailyWorkRow, IzinKodKey, PuantajFmResult, ValidOffDay, WeeklyCetvelRow } from "./model";
import { formatDateTR, formatHours, formatNumber, formatTL } from "./format";
import { addDaysISO, isValidISODate, isoWeekday, weekStartMonday } from "./utils";

export type ReportCetvelMeta = {
  fileName: string;
  templateName: string | null;
  settings: CalcSettings;
  katsayi: number;
  birim?: string;
  pozisyon?: string;
};

export type CetvelRowKind = "day" | "weekTotal";

export type CetvelRowView = {
  key: string;
  kind: CetvelRowKind;
  /** Günlük satır alanları; haftalık toplamda boş bırakılabilir. */
  donem: string;
  tarih: string;
  gun: string;
  calisilanSaat: string;
  araDinlenme: string;
  netSaat: string;
  gunluk11Asim: string;
  haftalik45Asim: string;
  bayramGunleri: string;
  bayramTamYarim: string;
  bayramCalismaVarYok: string;
  bayramCalismasi: string;
  /** Haftalık toplam satırı etiketi (birleştirilmiş hücre). */
  weekLabel?: string;
  weekLabelTitle?: string;
  weekLabelRange?: string;
  isPartialWeek?: boolean;
  /** Pazar (veya son gün) — hemen ardından haftalık toplam gelir; sayfa kırılmasında birlikte kalsın. */
  keepWithNext?: boolean;
  /** Haftalık toplam — önceki günlük satırla birlikte kalsın. */
  keepWithPrev?: boolean;
};

export type OffCetvelSummary = {
  hesaplananToplamFm: string;
  acikOffGun: number;
  kullaniciOffGun: number;
  toplamMahsupGun: number;
  offGunKarsiligi: string;
  toplamOffMahsup: string;
  mahsupSonrasiFm: string;
  hakkaniyetIndirimi: string;
  nihaiSonuc: string;
  raw: {
    hesaplananToplamFmSaat: number;
    offGunSayisi: number;
    offSaatKarsiligi: number;
    offMahsupSaati: number;
    toplamFmSaat: number;
    hakkaniyetIndirimi: number;
    sonTutar: number;
  };
};

const MONTH_TR = [
  "Oca",
  "Şub",
  "Mar",
  "Nis",
  "May",
  "Haz",
  "Tem",
  "Ağu",
  "Eyl",
  "Eki",
  "Kas",
  "Ara",
];

const DAY_TR = ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"];

function tagsOf(d: DailyWorkRow): IzinKodKey[] {
  if (d.durumKodlari && d.durumKodlari.length > 0) return d.durumKodlari;
  return d.izinTatilKodu ? [d.izinTatilKodu] : [];
}

/** Dönem: Oca.22 */
export function formatDonem(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? "");
  if (!m) return "";
  const month = Number(m[2]);
  const yy = m[1].slice(2);
  return `${MONTH_TR[month - 1] ?? m[2]}.${yy}`;
}

/** Gün adı: Pzt */
export function formatGunAdi(iso: string): string {
  if (!isValidISODate(iso)) return "";
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return DAY_TR[dt.getUTCDay()] ?? "";
}

function fmtHrs(n: number): string {
  if (!Number.isFinite(n) || Math.abs(n) < 1e-9) return "";
  return formatNumber(n, 2);
}

function workRangeCell(d: DailyWorkRow): string {
  const tags = tagsOf(d);
  const hasOff = tags.includes("OFF");
  const hasRapor = tags.includes("RAPOR");
  const hasHt = tags.includes("HAFTA_TATILI");
  const hasYi = tags.includes("YILLIK_IZIN");
  const hasUbgt = tags.includes("UBGT");
  const hasCalismadi = tags.includes("CALISMADI");

  if (hasOff && hasRapor) return "OFF / RAPOR";
  if (hasOff) return "OFF";
  if (hasHt) return "HT";
  if (hasYi) return "Yİ";
  if (hasRapor) return "RAPOR";
  if (hasCalismadi) return "Çalışmadı";

  const g = (d.kullanilanGiris || "").trim();
  const c = (d.kullanilanCikis || "").trim();
  if (g && c) {
    const plus = d.ertesiGunCikis ? " +1 gün" : "";
    return `${g}–${c}${plus}`;
  }
  if (hasUbgt) return "";
  return "";
}

function isFmIzniText(ham: string): boolean {
  const t = (ham ?? "").toLocaleLowerCase("tr-TR");
  return t.includes("fazla mesai izni") || t.includes("fm izni") || t.includes("fazla çalışma izni");
}

function countOffBreakdown(days: ValidOffDay[]): { acik: number; kullanici: number } {
  let acik = 0;
  let kullanici = 0;
  for (const d of days) {
    if (isFmIzniText(d.hamMetin)) kullanici += 1;
    else acik += 1;
  }
  return { acik, kullanici };
}

function dailyOver11(d: DailyWorkRow): number {
  const tags = tagsOf(d);
  if (
    tags.includes("OFF") ||
    tags.includes("HAFTA_TATILI") ||
    tags.includes("YILLIK_IZIN") ||
    (tags.includes("RAPOR") && !d.dahil)
  ) {
    return 0;
  }
  return Math.max(0, d.netSaat - 11);
}

function dailyUbgtHours(d: DailyWorkRow): number {
  if (!tagsOf(d).includes("UBGT")) return 0;
  if (d.dahil && d.netSaat > 0) return d.netSaat;
  return 0;
}

function buildDayRow(d: DailyWorkRow, keepWithNext = false): CetvelRowView {
  const tags = tagsOf(d);
  const offLike =
    tags.includes("OFF") ||
    tags.includes("HAFTA_TATILI") ||
    tags.includes("YILLIK_IZIN") ||
    tags.includes("RAPOR") ||
    tags.includes("CALISMADI");
  const isUbgt = tags.includes("UBGT");
  const calCell = workRangeCell(d);

  let ara = "";
  let net = "";
  let gunluk11 = "";
  if (
    tags.includes("OFF") ||
    tags.includes("HAFTA_TATILI") ||
    tags.includes("YILLIK_IZIN") ||
    (tags.includes("RAPOR") && !d.dahil)
  ) {
    ara = "0";
    net = "0";
  } else if (d.dahil || d.netSaat > 0 || d.brutSaat > 0) {
    ara = fmtHrs(d.molaSaat) || "0";
    net = fmtHrs(d.netSaat) || "0";
    const over11 = dailyOver11(d);
    gunluk11 = over11 > 1e-9 ? fmtHrs(over11) : "";
  } else if (calCell && !offLike) {
    ara = fmtHrs(d.molaSaat);
    net = fmtHrs(d.netSaat);
  }

  let bayramGunleri = "";
  let bayramTamYarim = "";
  let bayramVarYok = "";
  let bayramCalismasi = "";
  if (isUbgt) {
    bayramGunleri = "UBGT";
    bayramTamYarim = d.netSaat > 0 && d.netSaat < 7.5 ? "Yarım" : "Tam";
    if (d.dahil && d.netSaat > 0) {
      bayramVarYok = "Var";
      bayramCalismasi = fmtHrs(d.netSaat);
    } else {
      bayramVarYok = "Yok";
      bayramCalismasi = "";
    }
  }

  return {
    key: d.rowId,
    kind: "day",
    donem: formatDonem(d.tarih),
    tarih: formatDateTR(d.tarih),
    gun: formatGunAdi(d.tarih),
    calisilanSaat: calCell,
    araDinlenme: ara,
    netSaat: net,
    gunluk11Asim: gunluk11,
    haftalik45Asim: "",
    bayramGunleri,
    bayramTamYarim,
    bayramCalismaVarYok: bayramVarYok,
    bayramCalismasi,
    keepWithNext,
  };
}

function weeklyByStart(result: PuantajFmResult): Map<string, WeeklyCetvelRow> {
  const map = new Map<string, WeeklyCetvelRow>();
  for (const w of result.weeklyRows) {
    map.set(w.haftaBaslangicISO, w);
  }
  return map;
}

function buildWeekTotalRow(
  weekKey: string,
  days: DailyWorkRow[],
  weekly: WeeklyCetvelRow | undefined,
  partial: boolean,
): CetvelRowView {
  const first = days[0]?.tarih ?? weekKey;
  const last = days[days.length - 1]?.tarih ?? weekKey;
  const calendarMon = weekStartMonday(first);
  const calendarSun = addDaysISO(calendarMon, 6);

  const rangeStart = partial ? first : calendarMon;
  const rangeEnd = partial ? last : calendarSun;
  const title = partial ? "HAFTALIK KISMİ TOPLAM" : "HAFTALIK TOPLAM";
  const range = `${formatDateTR(rangeStart)} / ${formatDateTR(rangeEnd)}`;

  const gunluk11Sum = days.reduce((s, d) => s + dailyOver11(d), 0);
  const ubgtSum = days.reduce((s, d) => s + dailyUbgtHours(d), 0);
  const net = weekly?.netHaftalikSaat ?? days.filter((d) => d.dahil).reduce((s, d) => s + d.netSaat, 0);
  const fm45 = weekly?.haftalikFmSaat ?? 0;

  return {
    key: `week-${weekKey}-${last}`,
    kind: "weekTotal",
    donem: "",
    tarih: "",
    gun: "",
    calisilanSaat: "",
    araDinlenme: "",
    netSaat: fmtHrs(net) || "0,00",
    gunluk11Asim: gunluk11Sum > 1e-9 ? fmtHrs(gunluk11Sum) : "",
    haftalik45Asim: fm45 > 1e-9 ? fmtHrs(fm45) : "",
    bayramGunleri: "",
    bayramTamYarim: "",
    bayramCalismaVarYok: "",
    bayramCalismasi: ubgtSum > 1e-9 ? fmtHrs(ubgtSum) : "",
    weekLabel: `${title} - ${range}`,
    weekLabelTitle: title,
    weekLabelRange: range,
    isPartialWeek: partial,
    keepWithPrev: true,
  };
}

/**
 * Resmî 12 sütunlu cetvel satırlarını sonuçtan türetir.
 * Her pazarın (veya son kısmi haftanın) hemen altına gri haftalık toplam satırı ekler.
 * 45 saat aşımı yalnız haftalık toplam satırında gösterilir.
 */
export function buildCetvelRows(result: PuantajFmResult): CetvelRowView[] {
  const sorted = [...result.dailyRows]
    .filter((d) => isValidISODate(d.tarih))
    .sort((a, b) => (a.tarih < b.tarih ? -1 : a.tarih > b.tarih ? 1 : 0));

  if (sorted.length === 0) return [];

  const weeklyMap = weeklyByStart(result);
  const groups = new Map<string, DailyWorkRow[]>();
  const order: string[] = [];
  for (const d of sorted) {
    const wk = weekStartMonday(d.tarih);
    if (!groups.has(wk)) {
      groups.set(wk, []);
      order.push(wk);
    }
    groups.get(wk)!.push(d);
  }

  const out: CetvelRowView[] = [];
  for (const wk of order) {
    const days = groups.get(wk)!;
    const last = days[days.length - 1];
    const endsOnSunday = isoWeekday(last.tarih) === 7;
    const partial = !endsOnSunday;

    for (let i = 0; i < days.length; i++) {
      const d = days[i];
      const isLastOfWeek = i === days.length - 1;
      out.push(buildDayRow(d, isLastOfWeek));
    }

    out.push(buildWeekTotalRow(wk, days, weeklyMap.get(wk), partial));
  }

  return out;
}

export function buildOffCetvelSummary(result: PuantajFmResult): OffCetvelSummary {
  const days = result.offValidatedDays ?? [];
  const { acik, kullanici } = countOffBreakdown(days);
  return {
    hesaplananToplamFm: formatHours(result.hesaplananToplamFmSaat),
    acikOffGun: acik,
    kullaniciOffGun: kullanici,
    toplamMahsupGun: result.offGunSayisi,
    offGunKarsiligi: formatHours(result.offSaatKarsiligi),
    toplamOffMahsup: formatHours(result.offMahsupSaati),
    mahsupSonrasiFm: formatHours(result.toplamFmSaat),
    hakkaniyetIndirimi: formatTL(result.hakkaniyetIndirimi),
    nihaiSonuc: formatTL(result.sonTutar),
    raw: {
      hesaplananToplamFmSaat: result.hesaplananToplamFmSaat,
      offGunSayisi: result.offGunSayisi,
      offSaatKarsiligi: result.offSaatKarsiligi,
      offMahsupSaati: result.offMahsupSaati,
      toplamFmSaat: result.toplamFmSaat,
      hakkaniyetIndirimi: result.hakkaniyetIndirimi,
      sonTutar: result.sonTutar,
    },
  };
}

export function breakRuleLabel(settings: CalcSettings): string {
  if (settings.breakRule.kind === "fixed") {
    return `Sabit ${formatNumber(settings.breakRule.hours, 2)} saat`;
  }
  return "Otomatik (yasal tablo)";
}

export function estimatePageCount(rowCount: number, rowsPerPage = 90): number {
  if (rowCount <= 0) return 1;
  return Math.max(1, Math.ceil(rowCount / rowsPerPage));
}

export function dateRangeLabel(result: PuantajFmResult, settings: CalcSettings): string {
  if (settings.calcDateStart && settings.calcDateEnd) {
    return `${formatDateTR(settings.calcDateStart)} – ${formatDateTR(settings.calcDateEnd)}`;
  }
  const dates = result.dailyRows.map((d) => d.tarih).filter((d) => isValidISODate(d)).sort();
  if (dates.length === 0) return "—";
  return `${formatDateTR(dates[0])} – ${formatDateTR(dates[dates.length - 1])}`;
}

export function todayTR(): string {
  const n = new Date();
  const dd = String(n.getDate()).padStart(2, "0");
  const mm = String(n.getMonth() + 1).padStart(2, "0");
  return `${dd}.${mm}.${n.getFullYear()}`;
}

export const CETVEL_HEADERS = [
  { key: "donem", label: "Dönem" },
  { key: "tarih", label: "Tarih" },
  { key: "gun", label: "Gün" },
  { key: "calisilanSaat", label: "Aylık Puantaja Göre Çalışılan Saat" },
  { key: "araDinlenme", label: "Ara Dinlenme" },
  { key: "netSaat", label: "Aylık Puantaja Göre Çalışılan Net Saat" },
  { key: "gunluk11Asim", label: "11 Saati Aşan Günlük Fazla Mesai" },
  { key: "haftalik45Asim", label: "45 Saati Aşan Haftalık Fazla Mesai" },
  { key: "bayramGunleri", label: "Bayram Günleri" },
  { key: "bayramTamYarim", label: "Bayram Günü Tam/Yarım" },
  { key: "bayramCalismaVarYok", label: "Bayram Çalışması Var/Yok" },
  { key: "bayramCalismasi", label: "Bayram Çalışması" },
] as const;

/** Yazdırma için Pazar+toplam gruplarını tbody bloklarına ayırır. */
export function groupCetvelRowsForPrint(rows: CetvelRowView[]): CetvelRowView[][] {
  const groups: CetvelRowView[][] = [];
  let buf: CetvelRowView[] = [];

  const flush = () => {
    if (buf.length > 0) {
      groups.push(buf);
      buf = [];
    }
  };

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const next = rows[i + 1];
    if (r.kind === "day" && r.keepWithNext && next?.kind === "weekTotal") {
      flush();
      groups.push([r, next]);
      i += 1;
      continue;
    }
    if (r.kind === "weekTotal") {
      flush();
      groups.push([r]);
      continue;
    }
    buf.push(r);
  }
  flush();
  return groups;
}
