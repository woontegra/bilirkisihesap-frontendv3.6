/**
 * Standart Fazla Mesai — sayfaya özel veri modeli. Hesaplama modeli ve
 * motoru %100 lokaldir; başka bir fazla mesai alt türüne referans vermez.
 */

export type Mode270 = "none" | "simple" | "detailed";

export type SevenDayMode = "tatilli" | "tatilsiz";

/** V3 ile birebir aynı 5 dışlama türü. Yalnızca UBGT ve Yıllık İzin fazla mesai hesabını etkiler;
 * Rapor / Diğer / Puantaj-Bordro yalnızca kayıt/gösterim amaçlıdır (arayüz eşdeğerliği). */
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

/** Cetvel satırı üzerinde kullanıcı tarafından yapılan manuel düzenlemeler (opsiyonel). */
export type RowOverride = {
  weeks?: number;
  brut?: number;
  fmHours?: number;
  startISO?: string;
  endISO?: string;
  /** Otomatik satır için − ile gizleme (V3 paritesi). Manuel satırlar silinir, gizlenmez. */
  hidden?: boolean;
  /** Manuel brüt şablonundan / hücreden uygulandı. */
  brutManual?: boolean;
};

export type PeriodRow = {
  id: string;
  startISO: string;
  endISO: string;
  weeks: number;
  /** 270 detaylı modda düşüm öncesi hafta (V3 `originalWeekCount` paritesi). */
  originalWeekCount?: number;
  brut: number;
  katsayi: number;
  fmHours: number;
  fm: number;
  isDeductionRow: boolean;
  note?: string;
  /** + ile eklenen boş/düzenlenebilir satır. */
  isManual?: boolean;
  /** Manuel satırın hangi otomatik satırın hemen altına ekleneceği. */
  insertAfter?: string;
};

export type StandartFormSnapshot = {
  iseGiris: string;
  istenCikis: string;
  weeklyDays: number;
  sevenDayMode: SevenDayMode;
  haftaTatiliGunu: number | "";
  davaciIn: string;
  davaciOut: string;
  exclusions: ExclusionItem[];
  katSayi: string;
  mode270: Mode270;
  mahsup: string;
  notes: string;
  zamanasimi: ZamanasimiInfo;
  /** Cetvel satırlarında hafta/ücret/FM saati/tarih alanlarına yapılan manuel düzeltmeler (satır id → düzeltme). */
  rowOverrides: Record<string, RowOverride>;
  /**
   * Cetvelde + ile eklenen manuel satırlar (V3 paritesi).
   * insertAfter: hangi otomatik satırın altına yerleştirileceği.
   */
  manualRows: PeriodRow[];
};

export type StandartResult = {
  dailyGrossHours: number;
  breakHours: number;
  dailyNetHours: number;
  weeklyRawHours: number;
  weeklyRoundedHours: number;
  baselineWeeklyFmHours: number;
  rows: PeriodRow[];
  /** Toplam fazla mesai (brüt) — cetvel satırlarının brüt toplamı. */
  toplamFm: number;
  /** Brütten nete (TOPLAM bazında): SGK %14. */
  sgk: number;
  /** Brütten nete (TOPLAM bazında): İşsizlik %1. */
  issizlik: number;
  /** Brütten nete (TOPLAM bazında): kademeli gelir vergisi (işten çıkış yılı dilimleri). */
  gelirVergisi: number;
  /** Uygulanan gelir vergisi dilimlerinin özeti, örn. "(%15, %20)". */
  gelirVergisiDilimleri: string;
  /** Brütten nete (TOPLAM bazında): damga vergisi binde 7,59. */
  damgaVergisi: number;
  /** Brütten nete sonucu: toplamFm - sgk - issizlik - gelirVergisi - damgaVergisi. */
  netYillik: number;
  /** Hakkaniyet indirimi: toplamFm / 3 (BRÜT üzerinden, nete göre değil). */
  hakkaniyetIndirimi: number;
  mahsupTutari: number;
  /** Son net alacak: max(0, toplamFm - hakkaniyetIndirimi - mahsupTutari). Brüt bazlı; vergi düşülmez. */
  sonNet: number;
  warnings: string[];
};

export type SavedCase = {
  id: string;
  name: string;
  version: 2;
  updatedAt: string;
  form: StandartFormSnapshot;
  result: {
    toplamFm: number;
    sonNet: number;
    rowCount: number;
  };
};

export function newLocalId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `fm-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function createEmptyForm(): StandartFormSnapshot {
  return {
    iseGiris: "",
    istenCikis: "",
    weeklyDays: 6,
    sevenDayMode: "tatilsiz",
    haftaTatiliGunu: "",
    davaciIn: "",
    davaciOut: "",
    exclusions: [],
    katSayi: "1",
    mode270: "none",
    mahsup: "",
    notes: "",
    zamanasimi: null,
    rowOverrides: {},
    manualRows: [],
  };
}

export function cloneExclusions(items: ExclusionItem[]): ExclusionItem[] {
  return items.map((item) => ({ ...item }));
}
