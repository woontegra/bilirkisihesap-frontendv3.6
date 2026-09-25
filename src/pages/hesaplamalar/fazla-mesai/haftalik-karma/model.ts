/**
 * Haftalık Karma Fazla Mesai — sayfaya özel veri modeli (V3 state hizalı).
 * İzolasyon: başka FM alt türüne import yok.
 */

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

/** Davacı gün grubu — UI string; hesapta Number. */
export type DayGroup = {
  id: string;
  dayCount: string;
  startTime: string;
  endTime: string;
};

/** Tanık gün grubu — V3 `days` alanı map'te dayCount'a çevrilir. */
export type WitnessDayGroup = {
  id: string;
  dayCount: string;
  startTime: string;
  endTime: string;
};

export type Witness = {
  id: string;
  name: string;
  startISO: string;
  endISO: string;
  dayGroups: WitnessDayGroup[];
};

export type RowOverride = {
  weeks?: number;
  brut?: number;
  fmHours?: number;
  startISO?: string;
  endISO?: string;
  hidden?: boolean;
  brutManual?: boolean;
};

export type WeeklyKarmaFmContext = {
  dayGroups: Array<{ dayCount: number; startTime: string; endTime: string }>;
  hasWeeklyHoliday: boolean;
  weeklyHolidayGroup: number;
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
  karmaFmContext?: WeeklyKarmaFmContext;
  karmaDeductionDates?: Array<{ dateISO: string; dayWeight: number }>;
};

export type HaftalikKarmaFormSnapshot = {
  iseGiris: string;
  istenCikis: string;
  dayGroups: DayGroup[];
  hasWeeklyHoliday: boolean;
  /** 1-tabanlı grup indeksi (V3 weeklyHolidayGroup). */
  weeklyHolidayGroup: number;
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

export type EffectiveSegment = {
  startISO: string;
  endISO: string;
  fmHours: number;
  dailyNet?: number;
  annualLeaveHg?: number;
  annualLeaveSevenDay?: "tatilli" | "tatilsiz";
};

export type HaftalikKarmaResult = {
  segments: EffectiveSegment[];
  rows: PeriodRow[];
  davaciWeeklyFmHours: number;
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

export type SavedHaftalikKarmaCase = {
  id: string;
  name: string;
  version: 1;
  updatedAt: string;
  form: HaftalikKarmaFormSnapshot;
  results: {
    totalMoney: number;
    weeklyFmHours: number;
    sonNet: number;
  };
};

export function newLocalId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `hk-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function createEmptyDayGroup(): DayGroup {
  return { id: newLocalId(), dayCount: "", startTime: "", endTime: "" };
}

export function createEmptyWitnessDayGroup(): WitnessDayGroup {
  return { id: newLocalId(), dayCount: "", startTime: "", endTime: "" };
}

export function createEmptyWitness(): Witness {
  return {
    id: newLocalId(),
    name: "",
    startISO: "",
    endISO: "",
    dayGroups: [createEmptyWitnessDayGroup()],
  };
}

/** V3 DEFAULT_DAY_GROUPS: 2 boş grup. */
export function createEmptyHaftalikKarmaForm(): HaftalikKarmaFormSnapshot {
  return {
    iseGiris: "",
    istenCikis: "",
    dayGroups: [createEmptyDayGroup(), createEmptyDayGroup()],
    hasWeeklyHoliday: false,
    weeklyHolidayGroup: 1,
    witnesses: [],
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
