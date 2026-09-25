import { calculateBreakdown, calculateYillikIzin } from "../lib/core";
import { calcWorkPeriodBilirKisi } from "../lib/dates";
import { computeYillikStandartResult } from "./engine";
import { createEmptyForm } from "./model";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`yillik-standart engine.test: ${msg}`);
}

// Kıdem dilimleri (backend yillikIzin.service.js)
assert(calculateBreakdown(3).total === 42, "3 yıl standart = 42");
assert(calculateBreakdown(6).total === 90, "6 yıl = 5×14 + 1×20");
assert(calculateBreakdown(15).total === 276, "15 yıl = 70+180+26");
assert(calculateBreakdown(3, true).total === 60, "18-/50+ min 20 gün");
assert(calculateBreakdown(3, false, true).total === 54, "yeraltı +4 gün");

const wp = calcWorkPeriodBilirKisi("2015-03-01", "2022-08-15");
assert(wp.years === 7, `7 yıl kapsayıcı süre (${wp.years})`);

const form = {
  ...createEmptyForm(),
  startDate: "2015-03-01",
  endDate: "2022-08-15",
  brut: "30.000,00",
  usedRows: [{ id: "1", start: "", end: "", days: "10" }],
};

const page = computeYillikStandartResult(form);
assert(page.totalEntitlement === 110, `7 yıl entitlement ${page.totalEntitlement}`);
assert(page.remainingDays === 100, `kalan gün ${page.remainingDays}`);

const core = calculateYillikIzin({
  years: wp.years,
  brutUcret: form.brut,
  usedRows: form.usedRows,
  exitYear: 2022,
  is18Or50: false,
  isUnderground: false,
});
assert(core.brutIzin > 0 && core.netIzin > 0, "brüt/net pozitif");
assert(core.netIzin < core.brutIzin, "net < brüt");

console.log("yillik-standart engine.test: tüm kontroller geçti ✔");
