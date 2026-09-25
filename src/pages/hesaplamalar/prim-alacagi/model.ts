/**
 * Prim Alacağı — sayfaya özel veri modeli.
 * %100 lokal ve diğer hesaplama sayfalarından izole.
 */

export type PrimRow = {
  id: string;
  principal: string;
  percent: string;
};

export type PrimForm = {
  rows: PrimRow[];
  /** Brütten nete çevrimde kullanılacak opsiyonel brüt; boşsa toplam prim alacağı. */
  brutInputForNet: string;
};

export type PrimRowResult = {
  principal: number;
  percent: number;
  amount: number;
};

export type PrimResult = {
  rows: PrimRowResult[];
  total: number;
  brutForNetConversion: number;
  damgaVergisi: number;
  netTotal: number;
};

export type SavedCase = {
  id: string;
  name: string;
  version: 1;
  updatedAt: string;
  form: PrimForm;
  results: {
    total: number;
    netTotal: number;
  };
};

export function newLocalId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `pr-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function createEmptyRow(): PrimRow {
  return { id: newLocalId(), principal: "", percent: "" };
}

export function createEmptyForm(): PrimForm {
  return { rows: [createEmptyRow()], brutInputForNet: "" };
}

export function snapshotKey(form: PrimForm): string {
  return JSON.stringify({
    rows: form.rows.map((r) => [r.principal, r.percent]),
    b: form.brutInputForNet,
  });
}

/** V3 `NOTE_TEXT` — yalnızca bu metin. */
export const NOTE_TEXT =
  "İş sözleşmesinde veya toplu iş sözleşmesinde belirlenen prim ödemeleri, işçinin çalışması karşılığında kazanılan haklardan olup, ödenmemesi halinde alacak olarak talep edilebilir. Primler genellikle performansa, satış rakamlarına veya belirli hedeflere ulaşılmasına bağlı olarak ödenir.";
