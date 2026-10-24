/**
 * Boşta Geçen Süre Ücreti — sayfaya özel veri modeli.
 * %100 lokal ve diğer hesaplama sayfalarından izole.
 */

import type { EklentiGunEsasi } from "../shared/eklentiGunEsasi";
import { eklentiDokumleriAnahtari, type EklentiDokumleri } from "../shared/eklentiDokumu";

export type ExtraItem = { id: string; label: string; value: string };

export type BostaForm = {
  /** Gelir vergisi yılı için (opsiyonel). */
  endDate: string;
  brut: string;
  prim: string;
  ikramiye: string;
  yol: string;
  yemek: string;
  extras: ExtraItem[];
  /** 12 aylık eklenti hesabının gün esası; eski kayıtlarda yoksa 360 */
  eklentiGunEsasi: EklentiGunEsasi;
  /** Kalem başına uygulanmış 12 aylık eklenti dökümü; eski kayıtlarda yok */
  eklentiDokumleri?: EklentiDokumleri;
};

export type BostaResult = {
  toplamBrut: number;
  year: number;
  brutAmount: number;
  sgk: number;
  issizlik: number;
  gelirVergisi: number;
  gelirVergisiDilimleri: string;
  damgaVergisi: number;
  netAmount: number;
};

export type SavedCase = {
  id: string;
  name: string;
  version: 1;
  updatedAt: string;
  form: BostaForm;
  results: {
    toplamBrut: number;
    brutAmount: number;
    netAmount: number;
  };
};

export function newLocalId(prefix = "bg"): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function createEmptyForm(): BostaForm {
  return {
    endDate: "",
    brut: "",
    prim: "",
    ikramiye: "",
    yol: "",
    yemek: "",
    extras: [],
    eklentiGunEsasi: 360,
  };
}

export function snapshotKey(form: BostaForm): string {
  return JSON.stringify({
    e: form.endDate,
    c: form.brut,
    p: form.prim,
    i: form.ikramiye,
    y: form.yol,
    m: form.yemek,
    x: form.extras.map((it) => [it.label, it.value]),
    g: form.eklentiGunEsasi,
    d: eklentiDokumleriAnahtari(form.eklentiDokumleri, form.extras),
  });
}

/** V3 `NOTE_TEXT` — yalnızca bu metin. */
export const NOTE_TEXT =
  "Yargıtay 9 HD. 2022/548E, 2022/1762 Karar sayılı kararında ki hesaplama kriteri bakımından; yol ücreti giydirilmiş brüt ücret hesaplamasına eklenmemiştir.";
