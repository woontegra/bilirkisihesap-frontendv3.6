/**
 * Kıdem Tazminatı — Basın İş — sayfaya özel veri modeli.
 * Bu modül izole çalışır: başka kıdem alt türleriyle hesaplama motoru paylaşmaz.
 */

export type ExtraItem = {
  id: string;
  name: string;
  value: string;
};

/** Sunucudaki ekstra hesaplama seti (yalnızca set CRUD; kıdem hesabına karışmaz). */
export type SavedExtraSet = {
  id: number;
  name: string;
  data: ExtraItem[];
  createdAt?: string;
  updatedAt?: string;
};

export type BasinFormSnapshot = {
  meslegeBaslangic: string;
  iseGiris: string;
  istenCikis: string;
  denemeSuresiGun: string;
  ciplakBrut: string;
  prim: string;
  ikramiye: string;
  yol: string;
  yemek: string;
  diger: string;
  extras: ExtraItem[];
  notes: string;
};

export type SavedCase = {
  id: string;
  name: string;
  version: 1;
  updatedAt: string;
  form: BasinFormSnapshot;
  results: {
    brut: number;
    net: number;
  };
};

export function newLocalId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `kb-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function emptyForm(): BasinFormSnapshot {
  return {
    meslegeBaslangic: "",
    iseGiris: "",
    istenCikis: "",
    denemeSuresiGun: "",
    ciplakBrut: "",
    prim: "",
    ikramiye: "",
    yol: "",
    yemek: "",
    diger: "",
    extras: [],
    notes: "",
  };
}
