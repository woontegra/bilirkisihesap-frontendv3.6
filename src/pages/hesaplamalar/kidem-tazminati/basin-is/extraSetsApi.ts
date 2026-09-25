/**
 * Basın İş — Kaydedilmiş Ekstra Hesaplama Setleri API katmanı.
 *
 * V3 ile aynı sözleşme; mevcut endpointler değiştirilmez:
 *   GET    /api/extra-calculations-sets
 *   POST   /api/extra-calculations-sets  { name, data }
 *   DELETE /api/extra-calculations-sets/:id
 *
 * Yalnızca set CRUD için network kullanılır. Hesaplama motoru bu dosyayı çağırmaz.
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

function toText(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value);
}

function normalizeItems(data: unknown): ExtraItem[] {
  let source: unknown = data;
  if (typeof source === "string") {
    try {
      source = JSON.parse(source);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(source)) return [];
  return source
    .filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === "object")
    .map((entry) => ({
      id: toText(entry.id) || newLocalId(),
      name: toText(entry.name ?? entry.label),
      value: toText(entry.value),
    }));
}

function normalizeSet(raw: RawSet): SavedExtraSet | null {
  const id = Number(raw?.id);
  const name = toText(raw?.name).trim();
  if (!Number.isFinite(id) || id <= 0 || !name) return null;
  return {
    id,
    name,
    data: normalizeItems(raw?.data),
    createdAt: raw?.createdAt ? toText(raw.createdAt) : undefined,
    updatedAt: raw?.updatedAt ? toText(raw.updatedAt) : undefined,
  };
}

export function describeSetsError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return "Oturum süresi doldu. Lütfen tekrar giriş yapın.";
    if (error.status === 403) return "Ekstra hesaplama setlerine erişim yetkiniz yok.";
    if (error.status >= 500) return "Sunucu hatası. Setler yüklenemedi, tekrar deneyin.";
    return error.message || "Setler yüklenemedi, tekrar deneyin.";
  }
  if (error instanceof TypeError) {
    return "Bağlantı kurulamadı. Setler yüklenemedi, tekrar deneyin.";
  }
  if (error instanceof Error && error.message) return error.message;
  return "Setler yüklenemedi, tekrar deneyin.";
}

/** Tenant kapsamındaki tüm setleri listeler. */
export async function listExtraSets(): Promise<SavedExtraSet[]> {
  const raw = await apiClient<RawSet[]>(ENDPOINT, { method: "GET" });
  if (!Array.isArray(raw)) return [];
  return raw.map(normalizeSet).filter((s): s is SavedExtraSet => s !== null);
}

/**
 * Set oluşturur veya aynı isimdeyse günceller (V3 POST sözleşmesi; ayrı PUT yok).
 */
export async function saveExtraSet(name: string, items: ExtraItem[]): Promise<SavedExtraSet> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Lütfen bir isim girin");
  if (!items.length) throw new Error("Kaydedilecek ekstra hesaplama bulunamadı");

  const data = items.map((item) => ({
    id: item.id || newLocalId(),
    name: String(item.name || ""),
    value: item.value === undefined || item.value === null ? "" : String(item.value),
  }));

  const raw = await apiClient<RawSet>(ENDPOINT, {
    method: "POST",
    body: { name: trimmed, data },
  });
  const normalized = normalizeSet(raw);
  if (!normalized) {
    return { id: 0, name: trimmed, data };
  }
  return normalized;
}

/** Seti siler. */
export async function deleteExtraSet(id: number): Promise<void> {
  if (!Number.isFinite(id) || id <= 0) throw new Error("Geçersiz set");
  await apiClient(`${ENDPOINT}/${id}`, { method: "DELETE" });
}
