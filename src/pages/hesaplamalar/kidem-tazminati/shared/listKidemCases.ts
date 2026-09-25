/**
 * Kıdem sayfaları — backend kayıt listeleme yardımcısı.
 */

import { listSavedCases, type SavedCaseRecord } from "@/api/savedCases";

export async function listKidemSavedCases<T>(
  recordType: string,
  mapRecord: (record: SavedCaseRecord) => T | null,
): Promise<T[]> {
  const all = await listSavedCases();
  return all
    .filter((r) => (r.type ?? r.hesaplama_tipi) === recordType)
    .map(mapRecord)
    .filter((item): item is T => item != null);
}
