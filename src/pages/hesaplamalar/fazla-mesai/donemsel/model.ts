/**
 * Dönemsel Fazla Mesai — V3 state hizalı model (klasik / simple variant).
 * İzolasyon: başka FM alt türüne import yok.
 */

import { DEFAULT_SUMMER_MONTHS } from "./constants";

export function newLocalId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `dn-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
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

export type SevenDayMode = "tatilli" | "tatilsiz";

/** Klasik dönemsel yaz/kış deseni (V3 SeasonalPattern simple). workDays UI string. */
export type SeasonalPattern = {
  months: number[];
  startTime: string;
  endTime: string;
  workDays: string;
  sevenDayMode: SevenDayMode;
  /** Date.getDay() — 0=Pazar … 6=Cumartesi. */
  weeklyHolidayWeekday: number;
};

export type DonemselWitness = {
  id: string;
  name: string;
  dateIn: string;
  dateOut: string;
  summerPattern: SeasonalPattern;
  winterPattern: SeasonalPattern;
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
};

export type DonemselFormSnapshot = {
  dateIn: string;
  dateOut: string;
  summerPattern: SeasonalPattern;
  winterPattern: SeasonalPattern;
  witnessesSeasons: DonemselWitness[];
  exclusions: ExclusionItem[];
  katSayi: string;
  mode270: Mode270;
  zamanasimi: ZamanasimiInfo;
  mahsup: string;
  notes: string;
  rowOverrides: Record<string, RowOverride>;
  manualRows: PeriodRow[];
};

export type DonemselResult = {
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

export type SavedDonemselCase = {
  id: string;
  name: string;
  version: 1;
  updatedAt: string;
  form: DonemselFormSnapshot;
  results: {
    totalMoney: number;
    sonNet: number;
  };
};

function winterMonthsFrom(summerMonths: number[]): number[] {
  const all = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  return all.filter((m) => !summerMonths.includes(m));
}

export function createDefaultSummerPattern(): SeasonalPattern {
  return {
    months: [...DEFAULT_SUMMER_MONTHS],
    startTime: "",
    endTime: "",
    workDays: "6",
    sevenDayMode: "tatilsiz",
    weeklyHolidayWeekday: 0,
  };
}

export function createDefaultWinterPattern(): SeasonalPattern {
  return {
    months: winterMonthsFrom(DEFAULT_SUMMER_MONTHS),
    startTime: "",
    endTime: "",
    workDays: "6",
    sevenDayMode: "tatilsiz",
    weeklyHolidayWeekday: 0,
  };
}

export function createEmptyWitness(): DonemselWitness {
  return {
    id: newLocalId(),
    name: "",
    dateIn: "",
    dateOut: "",
    summerPattern: createDefaultSummerPattern(),
    winterPattern: createDefaultWinterPattern(),
  };
}

export function createEmptyDonemselForm(): DonemselFormSnapshot {
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
