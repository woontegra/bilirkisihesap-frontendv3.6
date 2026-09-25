import { newLocalId } from "../lib/money";
import type { DateRange, ExcludedDay, TableRow } from "../lib/types";

export type GemiForm = {
  dateRanges: DateRange[];
  excludedDays: ExcludedDay[];
  expiryStart: string | null;
  selectedHolidayIds: string[];
  rows: TableRow[];
  settleAmount: string;
  globalCoefficient: number;
};

export type GemiResult = {
  rows: TableRow[];
  totalBrut: number;
  year: number;
  net: import("../lib/types").NetBreakdown;
  hakkaniyet: number;
  mahsupSonuc: number;
};

export type SavedCase = {
  id: string;
  name: string;
  version: 1;
  updatedAt: string;
  form: GemiForm;
  results: { totalBrut: number; netAmount: number };
};

export const NOTE_BLOCKS = [
  "Deniz İş Kanunu kapsamında gemi adamlarına hafta tatili ücreti, günlük ücretin %50 fazlası üzerinden hesaplanır.",
  "Hafta tatili ücreti, çalışılan her 7 günlük süre için 1 günlük tatil karşılığıdır.",
  "Zamanaşımı süresi 5 yıldır.",
];

export function createEmptyForm(): GemiForm {
  return {
    dateRanges: [{ id: newLocalId("dr"), start: "", end: "" }],
    excludedDays: [],
    expiryStart: null,
    selectedHolidayIds: [],
    rows: [],
    settleAmount: "",
    globalCoefficient: 1,
  };
}

export function snapshotKey(form: GemiForm): string {
  return JSON.stringify({
    dr: form.dateRanges,
    ex: form.excludedDays,
    exp: form.expiryStart,
    sh: form.selectedHolidayIds,
    rows: form.rows,
    st: form.settleAmount,
    gc: form.globalCoefficient,
  });
}
