/**
 * Yeraltı İşçisi Fazla Mesai — sayfaya özel veri modeli.
 * Bu modül tamamen izoledir: başka bir fazla mesai alt türüne veya V3 / backend'e
 * referans vermez. Hesaplama %100 lokaldir. Alanlar ve metinler V3 "Yeraltı
 * İşçileri Fazla Mesai" sayfasıyla eşdeğerdir; tasarım V3.5 desenidir.
 */

export type SevenDayMode = "tatilli" | "tatilsiz";

export type Mode270 = "none" | "simple" | "detailed";

export type WitnessInput = {
  id: string;
  name: string;
  dateIn: string;
  dateOut: string;
  in: string;
  out: string;
  /** Tanığa özel haftalık gün sayısı (opsiyonel; boşsa davacı gün sayısı kullanılır). */
  weeklyDays?: number | "";
};

/** V3 ile birebir 5 dışlama türü. Yalnızca UBGT ve Yıllık İzin fazla mesai hesabını
 * etkiler; Rapor / Diğer / Puantaj-Bordro yalnızca kayıt/gösterim amaçlıdır. */
export type ExclusionType = "Yıllık İzin" | "Rapor" | "Diğer" | "UBGT" | "Puantaj-Bordro";

export const EXCLUSION_TYPES: readonly ExclusionType[] = [
  "Yıllık İzin",
  "Rapor",
  "Diğer",
  "UBGT",
  "Puantaj-Bordro",
];

export type ExclusionItem = {
  id: string;
  type: ExclusionType;
  /** ISO (YYYY-MM-DD) başlangıç günü. */
  start: string;
  /** ISO (YYYY-MM-DD) bitiş günü (tek günlük düşümlerde start ile aynı). */
  end: string;
  /** Düşülecek gün sayısı (0,5 gün desteklenir). */
  days: number;
};

export type ZamanasimiInfo = {
  davaTarihi: string;
  arabuluculukBaslangic: string;
  arabuluculukBitis: string;
  /** Hesaplanan nihai zamanaşımı başlangıç tarihi (ISO). Bu tarihten önceki dönemler hesaba katılmaz. */
  nihaiBaslangic: string;
} | null;

/** Cetvel satırı üzerinde kullanıcı tarafından yapılan manuel düzeltmeler (opsiyonel). */
export type RowOverride = {
  weeks?: number;
  brut?: number;
  fmHours?: number;
  startISO?: string;
  endISO?: string;
  /** Otomatik satır için − ile gizleme (V3 paritesi). Manuel satırlar silinir, gizlenmez. */
  hidden?: boolean;
};

export type FmRow = {
  id: string;
  startISO: string;
  endISO: string;
  weeks: number;
  /** Cetvelde gösterilen ücret: çift asgari ücret (2 × dönemin asgari ücreti). */
  brut: number;
  katsayi: number;
  fmHours: number;
  fm: number;
  /** UBGT / yıllık izin satır bölmesiyle oluşan düşüm satırı. */
  isDeductionRow: boolean;
  /** UBGT / izin satır bölmesi açıklaması — Tanıklı Standart ile aynı metin. */
  note?: string;
  /** + ile eklenen boş/düzenlenebilir satır. */
  isManual?: boolean;
  /** Manuel satırın hangi otomatik satırın hemen altına ekleneceği. */
  insertAfter?: string;
};

export type YeraltiFormSnapshot = {
  davaciDateIn: string;
  davaciDateOut: string;
  davaciIn: string;
  davaciOut: string;
  weeklyDays: number;
  sevenDayMode: SevenDayMode;
  /** Hafta tatili günü (0=Pazar … 6=Cumartesi); boşsa tüm günlerde düşüm. */
  haftaTatiliGunu: number | "";
  katsayi: string;
  witnesses: WitnessInput[];
  exclusions: ExclusionItem[];
  mode270: Mode270;
  mahsup: string;
  notes: string;
  zamanasimi: ZamanasimiInfo;
  /** Cetvel satırlarında hafta/ücret/FM saati/tarih alanlarına yapılan manuel düzeltmeler (satır id → düzeltme). */
  rowOverrides: Record<string, RowOverride>;
  /** Cetvelde + ile eklenen manuel satırlar (V3 paritesi). */
  manualRows: FmRow[];
};

export type YeraltiResult = {
  dailyHours: number;
  breakHours: number;
  weeklyHours: number;
  fmHoursWeekly: number;
  rows: FmRow[];
  /** Toplam fazla mesai (brüt) — cetvel satırlarının brüt toplamı. */
  totalFm: number;
  /** Brütten nete (TOPLAM bazında): SGK %14. */
  sgk: number;
  /** Brütten nete (TOPLAM bazında): İşsizlik %1. */
  issizlik: number;
  /** Brütten nete (TOPLAM bazında): kademeli gelir vergisi. */
  gelirVergisi: number;
  gelirVergisiDilimleri: string;
  /** Brütten nete (TOPLAM bazında): damga vergisi binde 7,59. */
  damgaVergisi: number;
  /** Brütten nete: totalFm − sgk − issizlik − gelirVergisi − damgaVergisi. */
  netYillik: number;
  /** Hakkaniyet indirimi: totalFm / 3 (BRÜT üzerinden). */
  hakkaniyetIndirimi: number;
  mahsupTutari: number;
  /** Son net alacak: max(0, totalFm − hakkaniyet − mahsup). */
  sonNet: number;
};

export type SavedCase = {
  id: string;
  name: string;
  version: 2;
  updatedAt: string;
  form: YeraltiFormSnapshot;
  result: { totalFm: number; sonNet: number; rowCount: number };
};

export function newLocalId(prefix = "yr"): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function createEmptyForm(): YeraltiFormSnapshot {
  return {
    davaciDateIn: "",
    davaciDateOut: "",
    davaciIn: "",
    davaciOut: "",
    weeklyDays: 6,
    sevenDayMode: "tatilsiz",
    haftaTatiliGunu: "",
    katsayi: "1",
    witnesses: [],
    exclusions: [],
    mode270: "none",
    mahsup: "",
    notes: "",
    zamanasimi: null,
    rowOverrides: {},
    manualRows: [],
  };
}

export function cloneForm(form: YeraltiFormSnapshot): YeraltiFormSnapshot {
  return {
    ...form,
    witnesses: form.witnesses.map((w) => ({ ...w })),
    exclusions: form.exclusions.map((e) => ({ ...e })),
    rowOverrides: Object.fromEntries(Object.entries(form.rowOverrides).map(([k, v]) => [k, { ...v }])),
    manualRows: form.manualRows.map((r) => ({ ...r })),
  };
}
