/**
 * Kıdem Tazminatı — Kısmi Süreli / Part Time — sayfaya özel veri modeli.
 * Bu modül izole çalışır: başka kıdem alt türleriyle hesaplama motoru paylaşmaz.
 * Backend/API çağrısı yoktur; SSK 360 gün kuralları tamamen bu modül içinde uygulanır.
 */

export type WorkPeriod = {
  id: string;
  start: string;
  end: string;
  days: number;
};

export type ExtraItem = {
  id: string;
  name: string;
  value: string;
};

export type KismiFormSnapshot = {
  periods: WorkPeriod[];
  totalDaysManual: string;
  isManualOverride: boolean;
  exitDateOverride: string;
  ciplakBrut: string;
  prim: string;
  ikramiye: string;
  yemek: string;
  yol: string;
  diger: string;
  extras: ExtraItem[];
  notes: string;
};

export type SavedCase = {
  id: string;
  name: string;
  version: 1;
  updatedAt: string;
  form: KismiFormSnapshot;
  results: {
    brut: number;
    net: number;
  };
};

export function newLocalId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `kk-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function emptyPeriod(): WorkPeriod {
  return { id: newLocalId(), start: "", end: "", days: 0 };
}

export function emptyForm(): KismiFormSnapshot {
  return {
    periods: [emptyPeriod()],
    totalDaysManual: "",
    isManualOverride: false,
    exitDateOverride: "",
    ciplakBrut: "",
    prim: "",
    ikramiye: "",
    yemek: "",
    yol: "",
    diger: "",
    extras: [],
    notes: "",
  };
}
