/**
 * Dönemsel Haftalık Fazla Mesai — V3 state hizalı model (izolasyon).
 */

import { DEFAULT_SUMMER_MONTHS, DEFAULT_WINTER_MONTHS } from "./constants";

export function newLocalId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `dh-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export type Mode270 = "none" | "simple" | "detailed";

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

/**
 * Yaz/kış haftalık desen — V3 SeasonalPattern (haftalikMode).
 * days1/days2 UI'da string; hesapta Number.
 */
export type SeasonalHaftalikPattern = {
  months: number[];
  /** Grup 1 gün (boş = undefined). */
  days1: string;
  startTime: string;
  endTime: string;
  days2: string;
  startTime2: string;
  endTime2: string;
  hasWeeklyHoliday: boolean;
  weeklyHolidayRow: 1 | 2;
  weeklyHolidayWeekday: number;
};

export type DonemselHaftalikWitness = {
  id: string;
  name: string;
  dateIn: string;
  dateOut: string;
  summerPattern: SeasonalHaftalikPattern;
  winterPattern: SeasonalHaftalikPattern;
};

export type RowOverride = {
  weeks?: number;
  brut?: number;
  fmHours?: number;
  startISO?: string;
  endISO?: string;
  hidden?: boolean;
  brutManual?: boolean;
  originalWeekCount?: number;
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
  isDeductionRow?: boolean;
  note?: string;
  yillikIzinAciklama?: string;
  isManual?: boolean;
  insertAfter?: string;
  isExclusionBlock?: boolean;
  segmentWorkDays?: number;
  excludedDays?: number;
  prePreserveWeeks?: number;
  originalWeekCount?: number;
  dailyNet?: number;
  annualLeaveHg?: number;
  annualLeaveSevenDay?: "tatilli" | "tatilsiz";
  annualLeaveWeeklyIgnoredWeekday?: number | null;
  /** Düşüm satırı — sezon deseni + tarihler. */
  donemselHaftalikDeduction?: {
    pattern: SeasonalHaftalikPattern;
    deductionDates: Array<{ dateISO: string; dayWeight: number }>;
  };
};

export type DonemselHaftalikFormSnapshot = {
  dateIn: string;
  dateOut: string;
  summerPattern: SeasonalHaftalikPattern;
  winterPattern: SeasonalHaftalikPattern;
  witnessesSeasons: DonemselHaftalikWitness[];
  exclusions: ExclusionItem[];
  katSayi: string;
  mode270: Mode270;
  zamanasimi: ZamanasimiInfo;
  mahsup: string;
  notes: string;
  rowOverrides: Record<string, RowOverride>;
  manualRows: PeriodRow[];
};

export type DonemselHaftalikResult = {
  rows: PeriodRow[];
  yazFmHours: number;
  kisFmHours: number;
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

export type SavedDonemselHaftalikCase = {
  id: string;
  name: string;
  version: 1;
  updatedAt: string;
  form: DonemselHaftalikFormSnapshot;
  results: {
    totalMoney: number;
    sonNet: number;
  };
};

export function createDefaultSummerPattern(): SeasonalHaftalikPattern {
  return {
    months: [...DEFAULT_SUMMER_MONTHS],
    days1: "",
    startTime: "",
    endTime: "",
    days2: "",
    startTime2: "",
    endTime2: "",
    hasWeeklyHoliday: false,
    weeklyHolidayRow: 2,
    weeklyHolidayWeekday: 0,
  };
}

export function createDefaultWinterPattern(): SeasonalHaftalikPattern {
  return {
    months: [...DEFAULT_WINTER_MONTHS],
    days1: "",
    startTime: "",
    endTime: "",
    days2: "",
    startTime2: "",
    endTime2: "",
    hasWeeklyHoliday: false,
    weeklyHolidayRow: 2,
    weeklyHolidayWeekday: 0,
  };
}

export function createEmptyWitness(id?: string): DonemselHaftalikWitness {
  return {
    id: id ?? newLocalId(),
    name: "",
    dateIn: "",
    dateOut: "",
    summerPattern: {
      ...createDefaultSummerPattern(),
      months: [6, 7, 8],
    },
    winterPattern: {
      ...createDefaultWinterPattern(),
      months: [1, 2, 12],
    },
  };
}

export function createEmptyDonemselHaftalikForm(): DonemselHaftalikFormSnapshot {
  return {
    dateIn: "",
    dateOut: "",
    summerPattern: createDefaultSummerPattern(),
    winterPattern: createDefaultWinterPattern(),
    witnessesSeasons: [],
    exclusions: [],
    katSayi: "1",
    mode270: "none",
    zamanasimi: null,
    mahsup: "",
    notes: "",
    rowOverrides: {},
    manualRows: [],
  };
}
