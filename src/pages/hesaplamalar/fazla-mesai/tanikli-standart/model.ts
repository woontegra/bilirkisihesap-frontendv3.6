/**
 * Tanıklı Standart Fazla Mesai — sayfaya özel veri modeli. Hesaplama modeli
 * ve motoru %100 lokaldir; `fazla-mesai/standart` dahil başka bir fazla
 * mesai alt türüne referans vermez.
 */

export type Mode270 = "none" | "simple" | "detailed";

export type SevenDayMode = "tatilli" | "tatilsiz";

/** V3 ile birebir: yalnızca UBGT ve Yıllık İzin hesabı etkiler; diğerleri kayıt/gösterim. */
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
  /** ISO (YYYY-MM-DD) başlangıç. */
  start: string;
  /** ISO (YYYY-MM-DD) bitiş (tek günde start ile aynı). */
  end: string;
  /** Düşülecek gün sayısı (0,5 desteklenir). */
  days: number;
};

export type ZamanasimiInfo = {
  davaTarihi: string;
  arabuluculukBaslangic: string;
  arabuluculukBitis: string;
  /** Hesaplanan nihai zamanaşımı başlangıç tarihi (ISO). */
  nihaiBaslangic: string;
} | null;

export type Witness = {
  id: string;
  name?: string;
  dateIn: string;
  dateOut: string;
  in: string;
  out: string;
  /** Boş bırakılırsa davacı haftalık gün sayısı kullanılır. */
  weeklyDays?: number | "";
};

/** Cetvel satırı üzerinde kullanıcı düzeltmeleri. */
export type RowOverride = {
  weeks?: number;
  brut?: number;
  fmHours?: number;
  startISO?: string;
  endISO?: string;
  /** Otomatik satır için − ile gizleme. */
  hidden?: boolean;
  /** Manuel brüt şablonundan / hücreden uygulandı. */
  brutManual?: boolean;
};

export type PeriodRow = {
  id: string;
  startISO: string;
  endISO: string;
  weeks: number;
  brut: number;
  katsayi: number;
  fmHours: number;
  fm: number;
  isDeductionRow: boolean;
  note?: string;
  /** Kazanan tanığın günlük net süresi (düşüm FM hesabı). */
  dailyNet?: number;
  /** Kazanan tanığın haftalık iş günü. */
  annualLeaveHg?: number;
  annualLeaveSevenDay?: SevenDayMode;
  segmentWorkDays?: number;
  excludedDays?: number;
  isExclusionBlock?: boolean;
  prePreserveWeeks?: number;
  originalWeekCount?: number;
  isManual?: boolean;
  insertAfter?: string;
};

export type TanikliFormSnapshot = {
  iseGiris: string;
  istenCikis: string;
  weeklyDays: number;
  sevenDayMode: SevenDayMode;
  haftaTatiliGunu: number | "";
  davaciIn: string;
  davaciOut: string;
  taniklar: Witness[];
  exclusions: ExclusionItem[];
  katSayi: string;
  mode270: Mode270;
  mahsup: string;
  notes: string;
  zamanasimi: ZamanasimiInfo;
  rowOverrides: Record<string, RowOverride>;
  manualRows: PeriodRow[];
};

/** Birleştirilmiş tanık dilimi (davacı fill YOK). */
export type EffectiveSegment = {
  startISO: string;
  endISO: string;
  fmHours: number;
  dailyNet?: number;
  weeklyDays?: number;
  annualLeaveSevenDay?: SevenDayMode;
};

export type TanikliResult = {
  segments: EffectiveSegment[];
  rows: PeriodRow[];
  toplamFm: number;
  sgk: number;
  issizlik: number;
  gelirVergisi: number;
  gelirVergisiDilimleri: string;
  damgaVergisi: number;
  netYillik: number;
  hakkaniyetOneri: number;
  mahsupTutari: number;
  mahsupSonrasiNet: number;
  warnings: string[];
};

export type SavedCase = {
  id: string;
  name: string;
  version: 1;
  updatedAt: string;
  form: TanikliFormSnapshot;
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
  return `fmt-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function createEmptyWitness(): Witness {
  return { id: newLocalId(), name: "", dateIn: "", dateOut: "", in: "", out: "", weeklyDays: "" };
}

export function createEmptyForm(): TanikliFormSnapshot {
  return {
    iseGiris: "",
    istenCikis: "",
    weeklyDays: 6,
    sevenDayMode: "tatilsiz",
    haftaTatiliGunu: "",
    davaciIn: "",
    davaciOut: "",
    taniklar: [createEmptyWitness()],
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

export function cloneWitnesses(items: Witness[]): Witness[] {
  return items.map((item) => ({ ...item }));
}
