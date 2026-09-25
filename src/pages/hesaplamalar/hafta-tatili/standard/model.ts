/**
 * Hafta Tatili — Standart varyant modeli.
 */

import { newLocalId } from "../lib/money";
import type { DateRange, ExcludedDay, TableRow } from "../lib/types";

export type StandardForm = {
  dateRanges: DateRange[];
  excludedDays: ExcludedDay[];
  expiryStart: string | null;
  kullanimBaslangic: string;
  kullanimBitis: string;
  kullanimGunSayisi: 1 | 2 | 3 | 4;
  selectedHolidayIds: string[];
  rows: TableRow[];
  settleAmount: string;
  globalCoefficient: number;
};

export type StandardResult = {
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
  form: StandardForm;
  results: { totalBrut: number; netAmount: number };
};

export const NOTE_BLOCKS = [
  "İş Kanunu'nun 46. maddesi gereğince, işçiye işe başladığı günden itibaren 7 günlük çalışma süresi için 1 günlük hafta tatili ücreti ödenir.",
  "Hafta tatili ücreti çıplak günlük ücretin %50 fazlası olarak hesaplanır.",
  "Zamanaşımı süresi 5 yıldır.",
];

export function createEmptyForm(): StandardForm {
  return {
    dateRanges: [{ id: newLocalId("dr"), start: "", end: "" }],
    excludedDays: [],
    expiryStart: null,
    kullanimBaslangic: "",
    kullanimBitis: "",
    kullanimGunSayisi: 4,
    selectedHolidayIds: [],
    rows: [],
    settleAmount: "",
    globalCoefficient: 1,
  };
}

export function snapshotKey(form: StandardForm): string {
  return JSON.stringify({
    dr: form.dateRanges,
    ex: form.excludedDays,
    exp: form.expiryStart,
    kb: form.kullanimBaslangic,
    ke: form.kullanimBitis,
    kg: form.kullanimGunSayisi,
    sh: form.selectedHolidayIds,
    rows: form.rows,
    st: form.settleAmount,
    gc: form.globalCoefficient,
  });
}
