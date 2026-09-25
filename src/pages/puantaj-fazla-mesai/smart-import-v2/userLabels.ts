/** Excel sayfasında sütun yerleşimi değişen bölüm — kullanıcı arayüzünde "segment" denmez. */
export function layoutSectionOrdinal(index: number): string {
  return `${index + 1}. tablo düzeni`;
}

export const LAYOUT_SECTION_COUNT_LABEL = "Tablo düzeni sayısı";
export const LAYOUT_SECTION_COLUMN_LABEL = "Tablo düzeni";
