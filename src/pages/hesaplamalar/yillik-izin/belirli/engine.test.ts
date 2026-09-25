import { computeYillikBelirliResult } from "./engine";
import { createEmptyForm } from "./model";

const r = computeYillikBelirliResult({
  ...createEmptyForm(),
  workPeriods: [{ id: "1", iseGiris: "2016-03-01", istenCikis: "2021-08-15" }],
  startDate: "2016-03-01",
  endDate: "2021-08-15",
  brut: "28.000",
});
if (!(r.totalEntitlement > 0)) {
  throw new Error(`yillik-belirli engine.test: entitlement ${r.totalEntitlement}`);
}
if (!(r.brutIzin > 0)) {
  throw new Error(`yillik-belirli engine.test: brutIzin ${r.brutIzin}`);
}

console.log("yillik-belirli engine.test: 2 test geçti ✔");
