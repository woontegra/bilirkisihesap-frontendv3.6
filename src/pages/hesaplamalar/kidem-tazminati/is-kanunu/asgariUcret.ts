/**
 * Çıplak brüt uyarısı. Eşik ortak tarihsel asgari tablosundan, ölçeklenmiş TL olarak okunur.
 */
import { warningAsgariBrut } from "../../shared/historical/asgariUcret";

export function getAsgariUcretByDate(isoDate: string): number | null {
  return warningAsgariBrut(isoDate);
}
