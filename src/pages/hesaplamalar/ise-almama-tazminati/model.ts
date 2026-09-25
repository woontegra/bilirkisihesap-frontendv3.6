/**
 * İşe Başlatmama Tazminatı — sayfaya özel veri modeli.
 * %100 lokal ve diğer hesaplama sayfalarından izole.
 */

export type CoefRow = {
  k: number;
  label: string;
  value: number;
};

export type WorkPeriod = {
  years: number;
  months: number;
  days: number;
  label: string;
};

export type IseAlmamaResult = {
  coefRows: CoefRow[];
  brutVal: number;
  selectedKatsayi: number;
  brutForNet: number;
  damgaVergisi: number;
  netTazminat: number;
  workPeriod: WorkPeriod | null;
  asgariUcretHatasi: string | null;
};

export type IseAlmamaForm = {
  startDate: string;
  endDate: string;
  brut: string;
  /** Net dönüşümde kullanılacak opsiyonel brüt; boşsa seçili katsayı satırı. */
  brutInputForNet: string;
  /** Kullanıcı seçimli katsayı (4–8). V3 varsayılanı son satır (=8). */
  selectedKatsayi: number;
};

export type SavedCase = {
  id: string;
  name: string;
  version: 1;
  updatedAt: string;
  form: IseAlmamaForm;
  results: {
    brutForNet: number;
    netTazminat: number;
    selectedKatsayi: number;
  };
};

export function createEmptyForm(): IseAlmamaForm {
  return {
    startDate: "",
    endDate: "",
    brut: "",
    brutInputForNet: "",
    selectedKatsayi: 8,
  };
}

export function newLocalId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `ia-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function snapshotKey(form: IseAlmamaForm): string {
  return [
    form.startDate,
    form.endDate,
    form.brut,
    form.brutInputForNet,
    String(form.selectedKatsayi),
  ].join("|");
}

/** Hukuki not blokları (boş bırakılabilir). */
export const NOTE_BLOCKS: Array<{ text: string; emphasis?: "warning" }> = [];
