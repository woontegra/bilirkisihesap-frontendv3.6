/**
 * İhbar Tazminatı — Kısmi Süreli İş Sözleşmesi. Form/not/kayıt modelleri.
 * Yalnızca bu varyant klasörü içinde kullanılır.
 */

import { newLocalId, type SavedIhbarCase } from "../lib/caseStorage";
import type { ExtraItem, IhbarResultSnapshot } from "../lib/types";

export type { ExtraItem };

export type IhbarKismiForm = {
  startDate: string;
  endDate: string;
  brut: string;
  prim: string;
  ikramiye: string;
  yol: string;
  yemek: string;
  extras: ExtraItem[];
};

export type SavedCase = SavedIhbarCase<IhbarKismiForm, IhbarResultSnapshot>;

export function createEmptyForm(): IhbarKismiForm {
  return { startDate: "", endDate: "", brut: "", prim: "", ikramiye: "", yol: "", yemek: "", extras: [] };
}

export function normalizeForm(raw: Partial<IhbarKismiForm> | undefined | null): IhbarKismiForm {
  const empty = createEmptyForm();
  if (!raw || typeof raw !== "object") return empty;
  return {
    startDate: String(raw.startDate ?? empty.startDate),
    endDate: String(raw.endDate ?? empty.endDate),
    brut: String(raw.brut ?? empty.brut),
    prim: String(raw.prim ?? empty.prim),
    ikramiye: String(raw.ikramiye ?? empty.ikramiye),
    yol: String(raw.yol ?? empty.yol),
    yemek: String(raw.yemek ?? empty.yemek),
    extras: Array.isArray(raw.extras)
      ? raw.extras.map((x) => ({
          id: String(x?.id || newLocalId("extra")),
          label: String(x?.label ?? ""),
          value: String(x?.value ?? ""),
        }))
      : [],
  };
}

export function normalizeResults(raw: Partial<IhbarResultSnapshot> | undefined | null): IhbarResultSnapshot {
  return {
    toplamBrut: Number(raw?.toplamBrut) || 0,
    brut: Number(raw?.brut) || 0,
    gelirVergisi: Number(raw?.gelirVergisi) || 0,
    damgaVergisi: Number(raw?.damgaVergisi) || 0,
    net: Number(raw?.net) || 0,
  };
}

export function snapshotKey(form: IhbarKismiForm): string {
  return JSON.stringify({
    a: form.startDate,
    b: form.endDate,
    c: form.brut,
    p: form.prim,
    i: form.ikramiye,
    y: form.yol,
    m: form.yemek,
    e: form.extras.map((x) => [x.label, x.value]),
  });
}
