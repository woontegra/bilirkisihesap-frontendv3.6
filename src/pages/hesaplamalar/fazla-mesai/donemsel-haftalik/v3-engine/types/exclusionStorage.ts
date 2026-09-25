/** V3 exclusionStorage.ts — yalnızca hesap motorunun ihtiyaç duyduğu tip. */
export interface ExcludedDay {
  id: string;
  type: string;
  start: string;
  end: string;
  days: number;
}
