/**
 * Fazla mesai "Kat Sayı Hesapla" sonucunun form alanındaki biçimi.
 */

/**
 * Pencere sonucunu form alanına yazar: virgüllü TR ondalık, binlik ayırıcısız, en çok 4 hane ("1,131").
 * Alanı okuyan `parseKatsayi` noktayı binlik ayırıcı sayar; "1.131" yazılırsa 1131 okunur.
 */
export function formatKatsayiForForm(k: number): string {
  if (!Number.isFinite(k) || k <= 0) return "1";
  return String(Number(k.toFixed(4))).replace(".", ",");
}

/**
 * Noktayı ondalık sayan katsayı okuyucusu. Gemi Adamı 7/24 katsayıyı V3'ten beri "1.131" biçiminde saklar
 * ve dönem satırlarını `Number` ile hesaplar; virgüllü TR girişi ("1,131", "1.234,5") de kabul edilir.
 */
export function parseDecimalKatsayi(value: unknown): number {
  const s = String(value ?? "").trim();
  const n = s.includes(",") ? Number(s.replace(/\./g, "").replace(",", ".")) : Number(s);
  return Number.isFinite(n) && n > 0 ? n : 1;
}
