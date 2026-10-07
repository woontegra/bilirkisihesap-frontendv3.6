/** Tek kaynak. Abonelik sayfası ve masaüstü sürüm bilgisi buradan okunur. */
export const PRODUCT_VERSION = "3.6.2";

export const PRODUCT_VERSION_NOTES = [
  "Hakkaniyet indirimi ve mahsuplaşma sonrası brütten nete hesaplama eklendi.",
  "UYAP Doküman Editörü ile uyumlu UDF rapor indirme eklendi.",
  "Önizleme tablolarında sayı ve tutar hizalamaları geliştirildi.",
  "Fazla mesai raporlarında dönem gösterimi sadeleştirildi.",
] as const;

export const PRODUCT_VERSION_NOTE = PRODUCT_VERSION_NOTES.join(" ");
