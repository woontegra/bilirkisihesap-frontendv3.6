/**
 * Standart Fazla Mesai — UBGT (Ulusal Bayram ve Genel Tatil) gün kataloğu.
 * Statik, tamamen lokal bir kopyadır (ağ isteği yoktur); tarihler resmî tatil
 * takvimiyle uyumludur. Bu dosya yalnızca bu klasöre aittir.
 *
 * Dini bayram tarihleri 2010–2025 için kesindir (Diyanet takvimi). 2026 dini
 * bayram tarihleri bu kopya oluşturulduğunda resmen ilan edilmemişti; bu
 * nedenle 2026 için yalnızca sabit (resmî/millî) tatiller listelenir — UBGT
 * picker'da bu durum bir bilgi notu ile belirtilir.
 */

export type UbgtCatalogEntry = {
  date: string;
  holidayId: string;
  label: string;
  /** 28 Ekim gibi yarım günlük tatillerde 0,5; diğerlerinde 1. */
  days: number;
};

type FixedHoliday = {
  id: string;
  label: string;
  days: number;
  month: number;
  day: number;
  fromYear?: number;
};

const FIXED_HOLIDAYS: FixedHoliday[] = [
  { id: "1-ocak", label: "Yılbaşı", days: 1, month: 1, day: 1 },
  { id: "23-nisan", label: "23 Nisan Ulusal Egemenlik ve Çocuk Bayramı", days: 1, month: 4, day: 23 },
  { id: "1-mayis", label: "1 Mayıs Emek ve Dayanışma Günü", days: 1, month: 5, day: 1, fromYear: 2009 },
  { id: "19-mayis", label: "19 Mayıs Atatürk'ü Anma, Gençlik ve Spor Bayramı", days: 1, month: 5, day: 19 },
  { id: "15-temmuz", label: "15 Temmuz Demokrasi ve Millî Birlik Günü", days: 1, month: 7, day: 15, fromYear: 2017 },
  { id: "30-agustos", label: "30 Ağustos Zafer Bayramı", days: 1, month: 8, day: 30 },
  { id: "28-ekim", label: "28 Ekim (yarım gün)", days: 0.5, month: 10, day: 28 },
  { id: "29-ekim", label: "29 Ekim Cumhuriyet Bayramı", days: 1, month: 10, day: 29 },
];

/** Dini bayram "arife" başlangıç tarihleri (ay-gün, o yıla ait); diğer günler buradan türetilir. */
const RELIGIOUS_ANCHORS: { year: number; ramazanArife: string; kurbanArife: string }[] = [
  { year: 2010, ramazanArife: "09-08", kurbanArife: "11-15" },
  { year: 2011, ramazanArife: "08-29", kurbanArife: "11-05" },
  { year: 2012, ramazanArife: "08-18", kurbanArife: "10-24" },
  { year: 2013, ramazanArife: "08-07", kurbanArife: "10-14" },
  { year: 2014, ramazanArife: "07-27", kurbanArife: "10-03" },
  { year: 2015, ramazanArife: "07-16", kurbanArife: "09-23" },
  { year: 2016, ramazanArife: "07-04", kurbanArife: "09-11" },
  { year: 2017, ramazanArife: "06-24", kurbanArife: "08-31" },
  { year: 2018, ramazanArife: "06-14", kurbanArife: "08-20" },
  { year: 2019, ramazanArife: "06-03", kurbanArife: "08-10" },
  { year: 2020, ramazanArife: "05-23", kurbanArife: "07-30" },
  { year: 2021, ramazanArife: "05-12", kurbanArife: "07-19" },
  { year: 2022, ramazanArife: "05-01", kurbanArife: "07-08" },
  { year: 2023, ramazanArife: "04-20", kurbanArife: "06-27" },
  { year: 2024, ramazanArife: "04-09", kurbanArife: "06-15" },
  { year: 2025, ramazanArife: "03-30", kurbanArife: "06-05" },
];

function addIsoDays(iso: string, amount: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + amount);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function buildReligiousEntriesForYear(year: number): UbgtCatalogEntry[] {
  const anchor = RELIGIOUS_ANCHORS.find((a) => a.year === year);
  if (!anchor) return [];
  const ramazanArife = `${year}-${anchor.ramazanArife}`;
  const kurbanArife = `${year}-${anchor.kurbanArife}`;
  return [
    { date: ramazanArife, holidayId: "ramazan-arife", label: "Ramazan Bayramı Arife", days: 0.5 },
    { date: addIsoDays(ramazanArife, 1), holidayId: "ramazan-1", label: "Ramazan Bayramı 1. Gün", days: 1 },
    { date: addIsoDays(ramazanArife, 2), holidayId: "ramazan-2", label: "Ramazan Bayramı 2. Gün", days: 1 },
    { date: addIsoDays(ramazanArife, 3), holidayId: "ramazan-3", label: "Ramazan Bayramı 3. Gün", days: 1 },
    { date: kurbanArife, holidayId: "kurban-arife", label: "Kurban Bayramı Arife", days: 0.5 },
    { date: addIsoDays(kurbanArife, 1), holidayId: "kurban-1", label: "Kurban Bayramı 1. Gün", days: 1 },
    { date: addIsoDays(kurbanArife, 2), holidayId: "kurban-2", label: "Kurban Bayramı 2. Gün", days: 1 },
    { date: addIsoDays(kurbanArife, 3), holidayId: "kurban-3", label: "Kurban Bayramı 3. Gün", days: 1 },
    { date: addIsoDays(kurbanArife, 4), holidayId: "kurban-4", label: "Kurban Bayramı 4. Gün", days: 1 },
  ];
}

export const UBGT_CATALOG_MIN_YEAR = 2010;
export const UBGT_CATALOG_MAX_YEAR = 2026;
/** Dini bayram tarihleri bu yıldan sonrası için katalogda henüz mevcut değil. */
export const UBGT_RELIGIOUS_DATA_MAX_YEAR = 2025;

/** [startISO, endISO] aralığındaki tüm UBGT günlerini (sabit + dini) döner, tarih sırasıyla. */
export function getUbgtCatalogForRange(startISO: string, endISO: string): UbgtCatalogEntry[] {
  const s = String(startISO ?? "").slice(0, 10);
  const e = String(endISO ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || !/^\d{4}-\d{2}-\d{2}$/.test(e) || s > e) return [];

  const startYear = Math.max(UBGT_CATALOG_MIN_YEAR, Number(s.slice(0, 4)));
  const endYear = Math.min(UBGT_CATALOG_MAX_YEAR, Number(e.slice(0, 4)));
  const out: UbgtCatalogEntry[] = [];

  for (let year = startYear; year <= endYear; year++) {
    for (const h of FIXED_HOLIDAYS) {
      if (h.fromYear && year < h.fromYear) continue;
      const iso = `${year}-${String(h.month).padStart(2, "0")}-${String(h.day).padStart(2, "0")}`;
      if (iso >= s && iso <= e) out.push({ date: iso, holidayId: h.id, label: h.label, days: h.days });
    }
    if (year <= UBGT_RELIGIOUS_DATA_MAX_YEAR) {
      for (const entry of buildReligiousEntriesForYear(year)) {
        if (entry.date >= s && entry.date <= e) out.push(entry);
      }
    }
  }

  return out.sort((a, b) => a.date.localeCompare(b.date));
}

export type UbgtYearGroup = { year: number; entries: UbgtCatalogEntry[] };

/** Katalog girdilerini yıla göre gruplar (picker'da yıl başlıklı bölümler için). */
export function groupUbgtCatalogByYear(entries: UbgtCatalogEntry[]): UbgtYearGroup[] {
  const byYear = new Map<number, UbgtCatalogEntry[]>();
  for (const entry of entries) {
    const year = Number(entry.date.slice(0, 4));
    const list = byYear.get(year);
    if (list) list.push(entry);
    else byYear.set(year, [entry]);
  }
  return Array.from(byYear.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([year, list]) => ({ year, entries: list }));
}
