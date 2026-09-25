/**
 * Gemi Adamı — Günlük Çalışan Fazla Mesai — sayfa veri modeli (V3 state hizalı).
 * İzolasyon: başka FM alt türüne import yok.
 */

export type Mode270 = "none" | "simple" | "detailed";
export type SevenDayMode = "tatilli" | "tatilsiz";

export type ExclusionType = "Yıllık İzin" | "Rapor" | "Diğer" | "UBGT" | "Puantaj/Bordro";

export const EXCLUSION_TYPES: readonly ExclusionType[] = [
  "Yıllık İzin",
  "Rapor",
  "Diğer",
  "UBGT",
  "Puantaj/Bordro",
];

export type ExclusionItem = {
  id: string;
  type: ExclusionType;
  start: string;
  end: string;
  days: number;
};

export type ZamanasimiInfo = {
  davaTarihi: string;
  arabuluculukBaslangic: string;
  arabuluculukBitis: string;
  nihaiBaslangic: string;
} | null;

export type Witness = {
  id: string;
  name: string;
  dateIn: string;
  dateOut: string;
  in: string;
  out: string;
  weeklyDays?: number | "";
  sevenDayMode?: SevenDayMode;
};

export type RowOverride = {
  weeks?: number;
  brut?: number;
  katsayi?: number;
  fmHours?: number;
  startISO?: string;
  endISO?: string;
  hidden?: boolean;
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
  net?: number;
  isDeductionRow?: boolean;
  note?: string;
  yillikIzinAciklama?: string;
  isManual?: boolean;
  insertAfter?: string;
  dailyNet?: number;
  annualLeaveHg?: number;
  annualLeaveSevenDay?: SevenDayMode;
  prePreserveWeeks?: number;
  originalWeekCount?: number;
};

export type GemiGunlukFormSnapshot = {
  iseGiris: string;
  istenCikis: string;
  weeklyDays: number;
  sevenDayMode: SevenDayMode;
  davaciIn: string;
  davaciOut: string;
  witnesses: Witness[];
  exclusions: ExclusionItem[];
  haftaTatiliGunu: number | "";
  katSayi: string;
  mode270: Mode270;
  zamanasimi: ZamanasimiInfo;
  mahsup: string;
  notes: string;
  rowOverrides: Record<string, RowOverride>;
  manualRows: PeriodRow[];
};

export type GemiGunlukResult = {
  dailyGrossHours: number;
  breakHours: number;
  dailyNetHours: number;
  weeklyRawHours: number;
  weeklyRoundedHours: number;
  baselineWeeklyFmHours: number;
  rows: PeriodRow[];
  toplamFm: number;
  sgk: number;
  issizlik: number;
  gelirVergisi: number;
  gelirVergisiDilimleri: string;
  damgaVergisi: number;
  netYillik: number;
  hakkaniyetIndirimi: number;
  mahsupTutari: number;
  sonNet: number;
  warnings: string[];
};

export type SavedCase = {
  id: string;
  name: string;
  version: 2;
  updatedAt: string;
  form: GemiGunlukFormSnapshot;
  result: {
    toplamFm: number;
    sonNet: number;
    rowCount: number;
  };
};

export function newLocalId(prefix = "gg"): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function createEmptyWitness(_index = 1): Witness {
  return {
    id: newLocalId("w"),
    name: "",
    dateIn: "",
    dateOut: "",
    in: "",
    out: "",
  };
}

export function createEmptyForm(): GemiGunlukFormSnapshot {
  return {
    iseGiris: "",
    istenCikis: "",
    weeklyDays: 6,
    sevenDayMode: "tatilsiz",
    davaciIn: "",
    davaciOut: "",
    witnesses: [createEmptyWitness(1)],
    exclusions: [],
    haftaTatiliGunu: "",
    katSayi: "1",
    mode270: "none",
    zamanasimi: null,
    mahsup: "",
    notes: "",
    rowOverrides: {},
    manualRows: [],
  };
}
