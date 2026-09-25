import type { UbgtDateRangeInput } from "./lib/dateSegmentation";
import type { UbgtDayEntry, UbgtExcludedDay } from "./lib/holidays";
import type { UbgtNetResult, UbgtPeriodRow } from "./engine";
import type { UbgtExclusionRule } from "./filterExcludedUbgtHolidays";
import type { UbgtMahsuplasamaMatrix } from "./mahsuplasama";
import type { ManualDayRow, ManualPeriodRow } from "./ubgtCetvelRows";

export const STORAGE_KEY = "bilirkisi-hesap-v35:ubgt:cases:v1" as const;

export function newLocalId(prefix = "id"): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export type DateRangeRow = UbgtDateRangeInput & { id: string };

export type WitnessRow = {
  id: string;
  name: string;
  start: string;
  end: string;
  selectedHolidayIds: string[];
};

export type PeriodOverride = {
  wage?: string;
  ubgtDays?: string;
  coefficient?: string;
  /** Manuel brüt şablonundan uygulandı (asgariye dönüş için). */
  wageManual?: boolean;
};

/** Dışlama listesi satırı (Kaydet/İçe aktar); motor yalnızca start/end kullanır. */
export type UbgtExcludedDayRow = UbgtExcludedDay & {
  id?: string;
  type?: "Yıllık İzin" | "Rapor" | "Diğer";
  days?: number;
};

export type UbgtForm = {
  mode: "standart" | "bilirkisi";
  dateRanges: DateRangeRow[];
  witnesses: WitnessRow[];
  selectedHolidayIds: string[];
  ubgtExcludedDays: UbgtExcludedDayRow[];
  ubgtExclusionRules: UbgtExclusionRule[];
  ubgtExpiryStart: string;
  excludedWeekdays: number[];
  year: number;
  settleAmount: string;
  mahsuplasamaData: UbgtMahsuplasamaMatrix;
  periodOverrides: Record<string, PeriodOverride>;
  /** V3 ubgtRows: motor dışı manuel dönem satırları. */
  manualPeriodRows: ManualPeriodRow[];
  /** Silinen otomatik dönem satır id’leri (`auto:N`). */
  hiddenPeriodIds: string[];
  /** Cetvelde manuel eklenen UBGT gün satırları. */
  manualDayRows: ManualDayRow[];
};

export type UbgtResults = {
  periods: UbgtPeriodRow[];
  ubgtDayEntries: UbgtDayEntry[];
  toplamBrut: number;
  toplamNet: UbgtNetResult;
  totalDays: number;
};

export type SavedCase = {
  id: string;
  name: string;
  savedAt: string;
  form: UbgtForm;
  results: UbgtResults;
};

export function createEmptyForm(mode: UbgtForm["mode"] = "standart"): UbgtForm {
  return {
    mode,
    dateRanges: [
      {
        id: newLocalId("range"),
        start: "",
        end: "",
        person: mode === "bilirkisi" ? "Davacı" : undefined,
        selectedHolidayIds: mode === "bilirkisi" ? [] : undefined,
      },
    ],
    witnesses:
      mode === "bilirkisi"
        ? [{ id: newLocalId("tanik"), name: "Tanık 1", start: "", end: "", selectedHolidayIds: [] }]
        : [],
    selectedHolidayIds: [],
    ubgtExcludedDays: [],
    ubgtExclusionRules: [],
    ubgtExpiryStart: "",
    excludedWeekdays: [],
    year: new Date().getFullYear(),
    settleAmount: "",
    mahsuplasamaData: {},
    periodOverrides: {},
    manualPeriodRows: [],
    hiddenPeriodIds: [],
    manualDayRows: [],
  };
}

export const snapshotKey = (form: UbgtForm) => JSON.stringify(form);

export const WEEKDAY_LABELS: Record<number, string> = {
  0: "Pazar",
  1: "Pazartesi",
  2: "Salı",
  3: "Çarşamba",
  4: "Perşembe",
  5: "Cuma",
  6: "Cumartesi",
};
