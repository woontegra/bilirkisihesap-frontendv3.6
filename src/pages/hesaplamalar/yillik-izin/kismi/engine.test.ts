import { computeYillikKismiResult } from "./engine";
import { createEmptyForm } from "./model";

const r = computeYillikKismiResult({
  ...createEmptyForm(),
  workPeriods: [{ id: "1", iseGiris: "2015-01-01", istenCikis: "2020-06-01" }],
  startDate: "2015-01-01",
  endDate: "2020-06-01",
  brut: "30.000",
});
if (!(r.totalEntitlement > 0)) {
  throw new Error(`yillik-kismi engine.test: entitlement ${r.totalEntitlement}`);
}
if (!(r.brutIzin > 0)) {
  throw new Error(`yillik-kismi engine.test: brutIzin ${r.brutIzin}`);
}

console.log("yillik-kismi engine.test: 2 test geçti ✔");
