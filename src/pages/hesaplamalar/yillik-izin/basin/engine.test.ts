import { calculateGunlukGazeteIzin } from "../lib/basinGunlukGazete";
import { computeYillikBasinResult } from "./engine";
import { createEmptyForm } from "./model";

const izin = calculateGunlukGazeteIzin("2010-01-01", "2015-01-01", "2020-01-01");
if (izin.y1 !== 4 || izin.y2 !== 1 || izin.h1 !== 16 || izin.h2 !== 6 || izin.izinGun !== 154) {
  throw new Error(`yillik-basin engine.test: gunluk gazete failed ${JSON.stringify(izin)}`);
}
const r = computeYillikBasinResult({
  ...createEmptyForm(),
  meslegeBaslangic: "2010-01-01",
  startDate: "2015-01-01",
  endDate: "2020-01-01",
  brut: "30.000",
});
if (r.totalEntitlement !== 154) throw new Error(`yillik-basin engine.test: entitlement ${r.totalEntitlement}`);
console.log("yillik-basin engine.test: 2 test geçti ✔");
