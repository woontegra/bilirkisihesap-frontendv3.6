/**
 * İhbar uyarısı. Eşik ortak tarihsel asgari tablosundan, ölçeklenmiş TL olarak okunur.
 */
import { warningAsgariBrut } from "../../shared/historical/asgariUcret";

export function getAsgariUcretByDate(dateString: string): number | null {
  return warningAsgariBrut(dateString);
}
