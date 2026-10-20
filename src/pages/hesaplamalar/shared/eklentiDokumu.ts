/**
 * 12 aylık eklenti penceresinin aylık dökümü — ücret kalemi başına form alanında saklanır.
 *
 * Anahtar, sayfanın kalem anahtarıdır ("field:prim", "fixed:prim", "extra:<id>").
 * Ay tutarları kullanıcının girdiği metin olarak tutulur; pencere aynı değerlerle açılır.
 * Bu alanı taşımayan eski kayıtlarda döküm yoktur; kalem tutarları olduğu gibi korunur.
 */

import { normalizeEklentiGunEsasi, type EklentiGunEsasi } from "./eklentiGunEsasi";

export const EKLENTI_AY_SAYISI = 12;

export type EklentiDokumu = { aylar: string[]; gunEsasi: EklentiGunEsasi };

export type EklentiDokumleri = Record<string, EklentiDokumu>;

export function bosEklentiAylari(): string[] {
  return Array.from({ length: EKLENTI_AY_SAYISI }, () => "");
}

function dokumBosMu(aylar: string[]): boolean {
  return aylar.every((ay) => !ay.trim());
}

export function normalizeEklentiDokumleri(raw: unknown): EklentiDokumleri {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: EklentiDokumleri = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const kaynak = (value as { aylar?: unknown }).aylar;
    if (!Array.isArray(kaynak)) continue;
    const aylar = bosEklentiAylari().map((_, i) => {
      const ay = kaynak[i];
      return typeof ay === "string" ? ay : typeof ay === "number" && Number.isFinite(ay) ? String(ay) : "";
    });
    if (dokumBosMu(aylar)) continue;
    out[key] = { aylar, gunEsasi: normalizeEklentiGunEsasi((value as { gunEsasi?: unknown }).gunEsasi) };
  }
  return out;
}

/** Uygulanan dökümü yazar; bütün aylar boşsa kalemin dökümünü kaldırır. */
export function eklentiDokumuYaz(
  dokumler: EklentiDokumleri | undefined,
  key: string,
  dokum: EklentiDokumu,
): EklentiDokumleri {
  const next = { ...(dokumler ?? {}) };
  if (dokumBosMu(dokum.aylar)) delete next[key];
  else next[key] = { aylar: [...dokum.aylar], gunEsasi: dokum.gunEsasi };
  return next;
}

/** Silinmiş ekstra kalemlere ait dökümleri ayıklar. */
export function eklentiDokumleriniBuda(
  dokumler: EklentiDokumleri | undefined,
  extras: ReadonlyArray<{ id: string }> | undefined,
): EklentiDokumleri {
  if (!dokumler) return {};
  const ids = new Set((extras ?? []).map((x) => `extra:${x.id}`));
  const keys = Object.keys(dokumler);
  if (keys.every((k) => !k.startsWith("extra:") || ids.has(k))) return dokumler;
  const out: EklentiDokumleri = {};
  for (const k of keys) if (!k.startsWith("extra:") || ids.has(k)) out[k] = dokumler[k];
  return out;
}

/** Kayıt verisi için: dökümler ayıklanır, döküm kalmazsa alan hiç yazılmaz. */
export function eklentiDokumleriniFormaYerlestir<TForm extends Record<string, unknown>>(form: TForm): TForm {
  if (!("eklentiDokumleri" in form)) return form;
  const { eklentiDokumleri, ...rest } = form;
  const extras = Array.isArray(form.extras) ? (form.extras as Array<{ id: string }>) : [];
  const buda = eklentiDokumleriniBuda(normalizeEklentiDokumleri(eklentiDokumleri), extras);
  return (Object.keys(buda).length ? { ...rest, eklentiDokumleri: buda } : rest) as TForm;
}

/** Değişiklik algılama anahtarına eklenecek kararlı gösterim; döküm yoksa undefined (eski anahtar değişmez). */
export function eklentiDokumleriAnahtari(
  dokumler: EklentiDokumleri | undefined,
  extras: ReadonlyArray<{ id: string }> | undefined,
): string | undefined {
  const buda = eklentiDokumleriniBuda(dokumler, extras);
  const keys = Object.keys(buda).sort();
  if (!keys.length) return undefined;
  return JSON.stringify(keys.map((k) => [k, buda[k].gunEsasi, buda[k].aylar]));
}
