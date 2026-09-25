import { computeYillikMevsimResult } from "./engine";
import { createEmptyForm } from "./model";

const form = createEmptyForm();
form.workPeriods[0].iseGiris = "2018-01-01";
form.workPeriods[0].istenCikis = "2023-01-01";
form.brut = "25.000";

const r = computeYillikMevsimResult(form);
if (r.totalEntitlement !== 70) {
  throw new Error(`yillik-mevsim engine.test: expected 70 got ${r.totalEntitlement}`);
}
console.log("yillik-mevsim engine.test: 1 test geçti ✔");
