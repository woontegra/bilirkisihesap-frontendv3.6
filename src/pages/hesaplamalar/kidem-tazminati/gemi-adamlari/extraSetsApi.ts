/**
 * Gemi Adamları — kaydedilmiş ekstra hesaplama setleri API katmanı.
 *
 * V3 ile aynı sözleşme; yalnızca set CRUD için ağ kullanılır.
 *   GET    /api/extra-calculations-sets
 *   POST   /api/extra-calculations-sets  { name, data }
 *   DELETE /api/extra-calculations-sets/:id
 *
 * Hesaplama motoru (engine.ts) bu dosyayı asla import etmez.
 */

import { ApiError, apiClient } from "@/api/client";
import type { ExtraItem, SavedExtraSet } from "./model";
import { newLocalId } from "./model";

const ENDPOINT = "/api/extra-calculations-sets";

type RawSet = {
  id?: unknown;
  name?: unknown;
  data?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
};

function text(value: unknown): string {
  return value == null ? "" : String(value);
}

function normalizeItems(value: unknown): ExtraItem[] {
  let source = value;
  if (typeof source === "string") {
    try {
      source = JSON.parse(source);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(source)) return [];
  return source
    .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
    .map((item) => ({
      id: text(item.id) || newLocalId(),
      name: text(item.name ?? item.label),
      value: text(item.value),
    }));
}

function normalizeSet(raw: RawSet): SavedExtraSet | null {
  const id = Number(raw.id);
  const name = text(raw.name).trim();
  if (!Number.isFinite(id) || id <= 0 || !name) return null;
  return {
    id,
    name,
    data: normalizeItems(raw.data),
    createdAt: raw.createdAt ? text(raw.createdAt) : undefined,
    updatedAt: raw.updatedAt ? text(raw.updatedAt) : undefined,
  };
}

export function describeSetsError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return "Oturum süresi doldu. Lütfen tekrar giriş yapın.";
    if (error.status === 403) return "Ekstra hesaplama setlerine erişim yetkiniz yok.";
    if (error.status >= 500) return "Sunucu hatası. Lütfen daha sonra tekrar deneyin.";
    return error.message || "İşlem tamamlanamadı. Lütfen tekrar deneyin.";
  }
  if (error instanceof TypeError) return "Bağlantı kurulamadı. İnternet bağlantınızı kontrol edin.";
  if (error instanceof Error && error.message) return error.message;
  return "İşlem tamamlanamadı. Lütfen tekrar deneyin.";
}

export async function listExtraSets(): Promise<SavedExtraSet[]> {
  const raw = await apiClient<RawSet[]>(ENDPOINT, { method: "GET" });
  if (!Array.isArray(raw)) return [];
  return raw.map(normalizeSet).filter((item): item is SavedExtraSet => item !== null);
}

export async function saveExtraSet(name: string, data: ExtraItem[]): Promise<void> {
  await apiClient(ENDPOINT, {
    method: "POST",
    body: { name: name.trim(), data },
  });
}

export async function deleteExtraSet(id: number): Promise<void> {
  await apiClient(`${ENDPOINT}/${id}`, { method: "DELETE" });
}
