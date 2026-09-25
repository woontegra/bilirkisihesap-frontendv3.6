/**
 * Davacı Ücreti — sayfaya özel veri modeli.
 * Hesaplama motoru ve form state %100 lokal/izole.
 * Kaydedilmiş ekstra setler backend'de tenant kapsamında tutulur.
 */

export type ExtraItem = {
  id: string;
  name: string;
  value: string;
};

export type Period = 1 | 2;

export type NetFromGrossData = {
  gross: number;
  sgk: number;
  issizlik: number;
  gelirVergisi: number;
  gelirVergisiDilimleri: string;
  damgaVergisi: number;
  net: number;
  gelirVergisiBrut: number;
  gelirVergisiIstisna: number;
  damgaVergisiBrut: number;
  damgaVergisiIstisna: number;
};

export type DavaciFormSnapshot = {
  ciplakBrut: string;
  extraItems: Array<{ id: string; name: string; value: string }>;
  selectedYear: number;
  selectedPeriod: Period;
  notes: string;
};

export type SavedCase = {
  id: string;
  name: string;
  version: 1;
  updatedAt: string;
  form: DavaciFormSnapshot;
  results: {
    totalBrut: number;
    net: number;
  };
};

/**
 * Backend `extra_calculations_sets` satırının V3.5 görünümü.
 * id sayısal (backend); kalemler `data` alanından gelir.
 */
export type SavedExtraSet = {
  id: number;
  name: string;
  data: ExtraItem[];
  createdAt?: string;
  updatedAt?: string;
};

export function newLocalId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `du-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function createDefaultExtraItems(): ExtraItem[] {
  return [
    { id: newLocalId(), name: "Prim", value: "" },
    { id: newLocalId(), name: "İkramiye", value: "" },
    { id: newLocalId(), name: "Yol", value: "" },
    { id: newLocalId(), name: "Yemek", value: "" },
  ];
}
