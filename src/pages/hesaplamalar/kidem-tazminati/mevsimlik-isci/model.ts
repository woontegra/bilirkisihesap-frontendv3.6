/**
 * Mevsimlik İşçi Kıdem Tazminatı — sayfaya özel veri modeli.
 * Bu modül tamamen izoledir: başka kıdem türleri veya hesap modülleriyle
 * hiçbir tip/kod paylaşımı yoktur. Hesaplama ve depolama %100 lokaldir.
 */

export type ExtraItem = {
  id: string;
  name: string;
  value: string;
};

/** Backend ekstra hesaplama seti (yalnızca set CRUD; hesaplama lokal kalır). */
export type SavedExtraSet = {
  id: number;
  name: string;
  data: ExtraItem[];
  createdAt?: string;
  updatedAt?: string;
};

/** Tek bir mevsimlik çalışma dönemi; gün sayısı tarihlerden türetilir. */
export type WorkPeriod = {
  id: string;
  start: string;
  end: string;
  days: number;
};

export type MevsimlikFormSnapshot = {
  periods: WorkPeriod[];
  manualTotalDaysOverride: string;
  ciplakBrut: string;
  prim: string;
  ikramiye: string;
  yol: string;
  yemek: string;
  diger: string;
  extras: ExtraItem[];
  notes: string;
};

export type MevsimlikResultSummary = {
  toplamGun: number;
  manualOverrideActive: boolean;
  yil: number;
  ay: number;
  gun: number;
  toplamAylikBrut: number;
  kullanilacakBrut: number;
  tavan: number | null;
  tavanUygulandi: boolean;
  yilTutar: number;
  ayTutar: number;
  gunTutar: number;
  brutKidem: number;
  damgaVergisi: number;
  netKidem: number;
};

export type SavedMevsimlikCase = {
  id: string;
  name: string;
  version: 1;
  updatedAt: string;
  form: MevsimlikFormSnapshot;
  results: {
    brutKidem: number;
    netKidem: number;
  };
};

export function newLocalId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `mev-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function createEmptyPeriod(): WorkPeriod {
  return { id: newLocalId(), start: "", end: "", days: 0 };
}

export function createEmptyMevsimlikForm(): MevsimlikFormSnapshot {
  return {
    periods: [createEmptyPeriod()],
    manualTotalDaysOverride: "",
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
