/**
 * Hesap motorundan çıkan hata sonucu üretmez.
 * 1995 tamamlanmış günü dahil, hata metni korunur; React ağacı düşmez.
 */
export function runUserCalc<T>(compute: () => T): { result: T | null; error: string | null } {
  try {
    return { result: compute(), error: null };
  } catch (error) {
    if (error instanceof Error) return { result: null, error: error.message };
    throw error;
  }
}
