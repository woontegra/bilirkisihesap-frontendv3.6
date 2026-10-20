/**
 * Gemi Adamları Kıdem Tazminatı — sayfaya özel veri modeli.
 * Bu modül tamamen izoledir: başka kıdem türleri veya hesap modülleriyle
 * hiçbir tip/kod paylaşımı yoktur. Kıdem hesabı ve dosya kayıtları lokaldir;
 * ekstra hesaplama setleri ayrı API katmanındadır (engine dokunmaz).
 */

import type { EklentiDokumleri } from "../../shared/eklentiDokumu";

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

export type GemiFormSnapshot = {
  startDate: string;
  endDate: string;
  ciplakBrut: string;
  prim: string;
  ikramiye: string;
  yol: string;
  yemek: string;
  diger: string;
  extras: ExtraItem[];
  notes: string;
  /** 12 aylık eklenti hesabının gün esası; eski kayıtlarda yoksa 360 */
  eklentiGunEsasi: 360 | 365;
  /** Kalem başına uygulanmış 12 aylık eklenti dökümü; eski kayıtlarda yok */
  eklentiDokumleri?: EklentiDokumleri;
};

export type GemiResultSummary = {
  toplamAylikBrut: number;
  kullanilacakBrut: number;
  tavanUygulandi: boolean;
  brutKidem: number;
  damgaVergisi: number;
  muafiyetTutari: number;
  gelirVergisiMatrahi: number;
  gelirVergisi: number;
  netKidem: number;
};

export type SavedGemiCase = {
  id: string;
  name: string;
  version: 1;
  updatedAt: string;
  form: GemiFormSnapshot;
  results: {
    brutKidem: number;
    netKidem: number;
  };
};

export function newLocalId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `gemi-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function createEmptyGemiForm(): GemiFormSnapshot {
  return {
    startDate: "",
    endDate: "",
    ciplakBrut: "",
    prim: "",
    ikramiye: "",
    yol: "",
    yemek: "",
    diger: "",
    extras: [],
    notes: "",
    eklentiGunEsasi: 360,
  };
}
