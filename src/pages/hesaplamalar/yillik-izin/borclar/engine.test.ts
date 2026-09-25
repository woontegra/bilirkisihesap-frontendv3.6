import { calculateYillikIzin } from "../lib/core";
import { calcWorkPeriodBilirKisi } from "../lib/dates";
import { computeYillikBorclarResult } from "./engine";
import { createEmptyForm } from "./model";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`yillik-borclar engine.test: ${msg}`);
}

const form = {
  ...createEmptyForm(),
  startDate: "2018-01-01",
  endDate: "2023-06-01",
  brut: "25.000",
};

const r = computeYillikBorclarResult(form);
const wp = calcWorkPeriodBilirKisi(form.startDate, form.endDate);
assert(r.totalEntitlement === wp.years * 14, `standart borçlar ${r.totalEntitlement}`);

const r21 = computeYillikBorclarResult({ ...form, is18Or50: true });
assert(r21.totalEntitlement === wp.years * 21, `18/50 borçlar ${r21.totalEntitlement}`);

const core = calculateYillikIzin({
  years: wp.years,
  brutUcret: form.brut,
  usedRows: [],
  exitYear: 2023,
  isBorclarKanunu: true,
});
assert(core.totalEntitlement === wp.years * 14, "core borçlar entitlement");

console.log("yillik-borclar engine.test: tüm kontroller geçti ✔");
