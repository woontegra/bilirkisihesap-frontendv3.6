/**
 * Kıdem Tazminatı — İş Kanununa Göre — sayfaya özel veri modeli.
 *
 * Hesaplama modeli ve motoru lokaldir. Yalnızca ekstra hesaplama setlerinin
 * kullanıcı hesabında saklanması ayrı API katmanı üzerinden yapılır.
 */

export type ExtraItem = {
  id: string;
  name: string;
  value: string;
};

export type SavedExtraSet = {
  id: number;
  name: string;
  data: ExtraItem[];
  createdAt?: string;
  updatedAt?: string;
};

export type IsKanunuFormSnapshot = {
  iseGirisTarihi: string;
  istenCikisTarihi: string;
  ciplakBrut: string;
  prim: string;
  ikramiye: string;
  yol: string;
  yemek: string;
  extras: ExtraItem[];
  notes: string;
};

export type DurationParts = {
  years: number;
  months: number;
  days: number;
};

export type IsKanunuResult = {
  duration: DurationParts | null;
  durationLabel: string;
  giydirilmisAylik: number;
  tavan: number | null;
  tavanApplied: boolean;
  esasAylik: number;
  brutKidem: number;
  damgaVergisi: number;
  netKidem: number;
  shortTenureWarning: boolean;
};

export type SavedCase = {
  id: string;
  name: string;
  version: 1;
  updatedAt: string;
  form: IsKanunuFormSnapshot;
  result: {
    brutKidem: number;
    netKidem: number;
    durationLabel: string;
  };
};

export function newLocalId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `ik-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function createEmptyForm(): IsKanunuFormSnapshot {
  return {
    iseGirisTarihi: "",
    istenCikisTarihi: "",
    ciplakBrut: "",
    prim: "",
    ikramiye: "",
    yol: "",
    yemek: "",
    extras: [],
    notes: "",
  };
}

export function cloneExtraItems(items: ExtraItem[]): ExtraItem[] {
  return items.map((item) => ({ ...item }));
}
