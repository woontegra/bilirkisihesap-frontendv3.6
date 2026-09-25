/**
 * Günlük gazete basın işçisi — yıllık izin günü (4 hafta / 6 hafta kuralı).
 * FrontendV3/src/calculations/yillik-izin/basinGunlukGazeteCalculations.ts ile birebir.
 */

export type GunlukGazeteIzinSonuc = {
  izinGun: number;
  y1: number;
  y2: number;
  h1: number;
  h2: number;
  toplamHafta: number;
  aciklama: string;
};

export function calculateGunlukGazeteIzin(
  meslegeBaslangic: string,
  iseGiris: string,
  istenCikis: string,
): GunlukGazeteIzinSonuc {
  if (!iseGiris || !istenCikis) {
    return { izinGun: 0, y1: 0, y2: 0, h1: 0, h2: 0, toplamHafta: 0, aciklama: "Tarih bilgisi eksik" };
  }

  const workStart = new Date(iseGiris);
  const workEnd = new Date(istenCikis);

  if (Number.isNaN(workStart.getTime()) || Number.isNaN(workEnd.getTime())) {
    return { izinGun: 0, y1: 0, y2: 0, h1: 0, h2: 0, toplamHafta: 0, aciklama: "Geçersiz tarih" };
  }

  let totalYears = 0;
  const tempDate = new Date(workStart);
  while (true) {
    tempDate.setFullYear(tempDate.getFullYear() + 1);
    if (tempDate <= workEnd) totalYears++;
    else break;
  }

  if (totalYears < 1) {
    return {
      izinGun: 0,
      y1: 0,
      y2: 0,
      h1: 0,
      h2: 0,
      toplamHafta: 0,
      aciklama: "1 yıldan az çalışma - izin hakkı yok",
    };
  }

  const meslekStart = meslegeBaslangic ? new Date(meslegeBaslangic) : workStart;
  if (Number.isNaN(meslekStart.getTime())) {
    return { izinGun: 0, y1: 0, y2: 0, h1: 0, h2: 0, toplamHafta: 0, aciklama: "Geçersiz meslek başlangıç tarihi" };
  }

  const onYillikTarih = new Date(meslekStart);
  onYillikTarih.setFullYear(onYillikTarih.getFullYear() + 10);

  let y1 = 0;
  let y2 = 0;
  for (let year = 1; year <= totalYears; year++) {
    const yildonumu = new Date(workStart);
    yildonumu.setFullYear(yildonumu.getFullYear() + year);
    if (yildonumu >= onYillikTarih) y2++;
    else y1++;
  }

  const h1 = y1 * 4;
  const h2 = y2 * 6;
  const toplamHafta = h1 + h2;
  const izinGun = toplamHafta * 7;

  return { izinGun, y1, y2, h1, h2, toplamHafta, aciklama: "" };
}
