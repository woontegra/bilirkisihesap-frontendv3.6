import { computeYillikGemiResult } from "./engine";
import { createEmptyForm, createEmptyPeriod } from "./model";

const form = createEmptyForm();
form.workPeriods = [
  {
    ...createEmptyPeriod(),
    iseGiris: "2018-01-01",
    istenCikis: "2019-01-01",
  },
];
form.brut = "30.000";

const withBrut = computeYillikGemiResult(form);
if (withBrut.totalEntitlement !== 30) {
  throw new Error(`yillik-gemi engine.test: expected 30 entitlement got ${withBrut.totalEntitlement}`);
}
if (!(withBrut.brutIzin > 0)) {
  throw new Error(`yillik-gemi engine.test: expected positive brutIzin got ${withBrut.brutIzin}`);
}

form.brut = "";
const withoutBrut = computeYillikGemiResult(form);
if (withoutBrut.totalEntitlement !== 30) {
  throw new Error(`yillik-gemi engine.test: expected 30 without brut got ${withoutBrut.totalEntitlement}`);
}
if (withoutBrut.error) {
  throw new Error(`yillik-gemi engine.test: unexpected error without brut: ${withoutBrut.error}`);
}
if (withoutBrut.brutIzin !== 0) {
  throw new Error(`yillik-gemi engine.test: expected 0 brut without wage got ${withoutBrut.brutIzin}`);
}

console.log("yillik-gemi engine.test: 2 test geçti ✔");
