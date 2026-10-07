/**
 * Çıplak brüt uyarısı. Eşik ortak tarihsel asgari tablosundan, ölçeklenmiş TL olarak okunur.
 * Uyarı bilgilendirme amaçlıdır; hesabı engellemez.
 */
import { warningAsgariBrut } from "../../shared/historical/asgariUcret";
import { parseNum } from "./engine";

export function getAsgariUcretByDate(dateISO: string): number | null {
  return warningAsgariBrut(dateISO);
}

/**
 * Çıplak brüt, çıkış tarihindeki dönem asgari brütünün altındaysa uyarı döndürür;
 * aksi halde null.
 */
export function deriveAsgariUcretError(ciplakBrut: string, exitDateISO: string): string | null {
  if (!exitDateISO || !ciplakBrut) return null;

  const minUcret = getAsgariUcretByDate(exitDateISO);
  if (!minUcret) return null;

  const brutValue = parseNum(ciplakBrut);
  if (!brutValue) return null;

  if (brutValue < minUcret) {
    const year = exitDateISO.slice(0, 4);
    const formattedMin = new Intl.NumberFormat("tr-TR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(minUcret);
    return `Girilen ücret, ${year} yılı asgari brüt ücretinden düşük olamaz (${formattedMin}₺).`;
  }

  return null;
}
