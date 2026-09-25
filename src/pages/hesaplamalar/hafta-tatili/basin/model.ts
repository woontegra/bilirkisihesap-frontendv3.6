import { newLocalId } from "../lib/money";
import type { DateRange, ExcludedDay, TableRow } from "../lib/types";

export type BasinForm = {
  dateRanges: DateRange[];
  excludedDays: ExcludedDay[];
  expiryStart: string | null;
  selectedHolidayIds: string[];
  rows: TableRow[];
  settleAmount: string;
  globalCoefficient: number;
  geceCalisan: boolean;
};

export type BasinResult = {
  rows: TableRow[];
  totalBrut: number;
  year: number;
  net: import("../lib/types").NetBreakdown;
  hakkaniyet: number;
  mahsupSonuc: number;
  weekDayMultiplier: number;
};

export type SavedCase = {
  id: string;
  name: string;
  version: 1;
  updatedAt: string;
  form: BasinForm;
  results: { totalBrut: number; netAmount: number };
};

export const NOTE_BLOCKS = [
  "5953 sayılı Basın İş Kanunu kapsamında hafta tatili ücreti, günlük ücretin %50 fazlası üzerinden hesaplanır.",
  "Gece çalışan basın işçilerinde haftada 2 gün tatil hakkı vardır; hesap buna göre çarpılır.",
  "Zamanaşımı süresi 5 yıldır.",
];

export function createEmptyForm(): BasinForm {
  return {
    dateRanges: [{ id: newLocalId("dr"), start: "", end: "" }],
    excludedDays: [],
    expiryStart: null,
    selectedHolidayIds: [],
    rows: [],
    settleAmount: "",
    globalCoefficient: 1,
    geceCalisan: false,
  };
}

export function snapshotKey(form: BasinForm): string {
  return JSON.stringify({
    dr: form.dateRanges,
    ex: form.excludedDays,
    exp: form.expiryStart,
    sh: form.selectedHolidayIds,
    rows: form.rows,
    st: form.settleAmount,
    gc: form.globalCoefficient,
    gc2: form.geceCalisan,
  });
}

export function weekDayMultiplier(form: BasinForm): number {
  return form.geceCalisan ? 2 : 1;
}
