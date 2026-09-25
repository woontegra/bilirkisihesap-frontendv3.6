/**
 * Lokal ekstra set yardımcıları — form ↔ LocalExtraSetItem dönüşümü
 * ve isteğe bağlı salt-okunur legacy GET birleştirme.
 */

import { apiClient } from "@/api/client";
import {
  clearLegacyImportedFlag,
  mergeLegacyExtraSets,
  type LocalExtraSetItem,
  wasLegacyImported,
} from "@/lib/localExtraSetsStore";

export type WageFieldKey = "prim" | "ikramiye" | "yol" | "yemek";

export const WAGE_FIELD_LABELS: Record<WageFieldKey, string> = {
  prim: "Prim",
  ikramiye: "İkramiye",
  yol: "Yol",
  yemek: "Yemek",
};

const FIXED_KEYS = new Set<string>(["prim", "ikramiye", "yol", "yemek"]);
const FIXED_LABELS_TR = new Map<string, WageFieldKey>(
  (Object.entries(WAGE_FIELD_LABELS) as [WageFieldKey, string][]).map(([k, label]) => [
    label.toLocaleLowerCase("tr"),
    k,
  ]),
);

function normName(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLocaleLowerCase("tr");
}

/** Sabit ücret alanı mı (id veya isim ile)? */
export function matchWageField(item: { id?: string; name?: string; label?: string }): WageFieldKey | null {
  const id = normName(item.id);
  if (FIXED_KEYS.has(id)) return id as WageFieldKey;
  const byName = FIXED_LABELS_TR.get(normName(item.name ?? item.label));
  return byName ?? null;
}

export type LabeledExtra = { id: string; label: string; value: string };

/** Kaydet: dolu sabit alanlar + tüm ekstra kalemler. */
export function collectExtraSetItems(
  wage: Record<WageFieldKey, string>,
  extras: Array<{ id: string; label?: string; name?: string; value: string }>,
): LocalExtraSetItem[] {
  const items: LocalExtraSetItem[] = [];
  (Object.keys(WAGE_FIELD_LABELS) as WageFieldKey[]).forEach((key) => {
    const value = String(wage[key] ?? "").trim();
    if (value) items.push({ id: key, name: WAGE_FIELD_LABELS[key], value });
  });
  extras.forEach((ex) => {
    items.push({
      id: ex.id || `item-${Math.random().toString(36).slice(2, 10)}`,
      name: String(ex.label ?? ex.name ?? ""),
      value: ex.value == null ? "" : String(ex.value),
    });
  });
  return items;
}

/** Yalnızca dinamik ekstra listesi olan formlar (ör. bakiye) için toplama. */
export function collectExtrasOnlyItems(
  extras: Array<{ id: string; label?: string; name?: string; value: string }>,
): LocalExtraSetItem[] {
  return extras
    .filter((ex) => String(ex.value ?? "").trim() !== "" || String(ex.label ?? ex.name ?? "").trim() !== "")
    .filter((ex) => String(ex.value ?? "").trim() !== "")
    .map((ex) => ({
      id: ex.id || `item-${Math.random().toString(36).slice(2, 10)}`,
      name: String(ex.label ?? ex.name ?? ""),
      value: String(ex.value ?? ""),
    }));
}

/**
 * İçe aktar: Prim/İkramiye/Yol/Yemek isim (veya id) eşleşmesi → wage;
 * kalanlar → extras (label alanı).
 */
export function applyExtraSetItems(items: LocalExtraSetItem[]): {
  wage: Record<WageFieldKey, string>;
  extras: LabeledExtra[];
} {
  const wage: Record<WageFieldKey, string> = { prim: "", ikramiye: "", yol: "", yemek: "" };
  const extras: LabeledExtra[] = [];
  for (const raw of items) {
    const field = matchWageField(raw);
    if (field) {
      wage[field] = raw.value == null ? "" : String(raw.value);
      continue;
    }
    extras.push({
      id: raw.id || `extra-${Math.random().toString(36).slice(2, 10)}`,
      label: String(raw.name || ""),
      value: raw.value == null ? "" : String(raw.value),
    });
  }
  return { wage, extras };
}

/**
 * Bakiye tarzı: sabit isimli kalemleri + diğerlerini tek extras dizisinde üretir.
 * Varsayılan dört kalem her zaman başta yer alır.
 */
export function applyExtraSetItemsAsExtrasList(items: LocalExtraSetItem[]): LabeledExtra[] {
  const { wage, extras } = applyExtraSetItems(items);
  const fixed: LabeledExtra[] = (Object.keys(WAGE_FIELD_LABELS) as WageFieldKey[]).map((key) => ({
    id: `fixed-${key}`,
    label: WAGE_FIELD_LABELS[key],
    value: wage[key],
  }));
  return [...fixed, ...extras];
}

/** Salt-okunur legacy GET; backend'e yazmaz. force=true → flag temizleyip yeniden tara. */
export async function tryMergeLegacyExtraSets(
  moduleId: string,
  options?: { force?: boolean },
): Promise<{ imported: number; skipped: number } | null> {
  if (!options?.force && wasLegacyImported(moduleId)) return null;
  if (options?.force) clearLegacyImportedFlag(moduleId);
  try {
    const raw = await apiClient<unknown>("/api/extra-calculations-sets", { method: "GET" });
    const list = Array.isArray(raw) ? raw : [];
    return mergeLegacyExtraSets(
      moduleId,
      list.filter((e): e is { id?: number; name?: string; data?: unknown } => !!e && typeof e === "object"),
    );
  } catch {
    return null;
  }
}
