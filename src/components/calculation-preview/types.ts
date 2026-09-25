/** Ortak hesaplama önizleme bölüm modeli (bütün hesaplama sayfalarında aynı). */

export type PreviewRowTone = "blue" | "green";

export type PreviewSection = {
  id: string;
  title: string;
  headers: string[];
  rows: string[][];
  /** Son satır vurgusu (Toplam / Net vb.) */
  lastRowTone?: PreviewRowTone;
};
