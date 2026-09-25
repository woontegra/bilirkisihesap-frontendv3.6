import { calculateGunlukOlmayanIzin, computeYillikBasinGunlukOlmayanResult } from "./engine";
import { createEmptyForm } from "./model";

const izin = calculateGunlukOlmayanIzin("2018-01-01", "2023-07-01");
if (izin.devre !== 11 || izin.izinGun !== 154) {
  throw new Error(`yillik-basin-go engine.test: izin failed ${JSON.stringify(izin)}`);
}

const r = computeYillikBasinGunlukOlmayanResult({
  ...createEmptyForm(),
  meslegeBaslangic: "2018-01-01",
  endDate: "2023-07-01",
  brut: "30.000",
});
if (r.totalEntitlement !== 154) {
  throw new Error(`yillik-basin-go engine.test: entitlement ${r.totalEntitlement}`);
}
if (!(r.brutIzin > 0)) {
  throw new Error(`yillik-basin-go engine.test: brutIzin ${r.brutIzin}`);
}

console.log("yillik-basin-go engine.test: 2 test geçti ✔");
