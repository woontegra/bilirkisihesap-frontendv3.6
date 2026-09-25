/**
 * Kıdem Tazminatı — Kısmi Süreli / Part Time — kaydedilmiş ekstra hesaplama setleri.
 *
 * V3 ile aynı sözleşme; mevcut endpointler değiştirilmez:
 *   GET    /api/extra-calculations-sets
 *   POST   /api/extra-calculations-sets  { name, data }  — aynı isimdeyse günceller
 *   DELETE /api/extra-calculations-sets/:id
 *
 * Network YALNIZCA set CRUD içindir; kıdem hesaplaması %100 lokaldir ve
 * engine.ts bu dosyayı import etmez (izolasyon kuralı).
 */

import { ApiError, apiClient } from "@/api/client";
import { newLocalId } from "./model";

const ENDPOINT = "/api/extra-calculations-sets";

/** Set içindeki tek kalem (V3 sözleşmesindeki { id, name, value }). */
export type ExtraSetItem = {
  id: string;
  name: string;
  value: string;
};

export type SavedExtraSet = {
  id: number;
  name: string;
  data: ExtraSetItem[];
  createdAt?: string;
  updatedAt?: string;
};

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

function normalizeItems(data: unknown): ExtraSetItem[] {
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
      name: toText(entry.name),
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

/** Ağ/yetki hatalarını kullanıcıya gösterilecek Türkçe mesaja çevirir. */
export function describeSetsError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return "Oturum süresi doldu. Lütfen tekrar giriş yapın.";
    if (error.status === 403) return "Bu setlere erişim yetkiniz yok.";
    if (error.status >= 500) return "Sunucu hatası. Setler yüklenemedi, tekrar deneyin.";
    return error.message || "Setler yüklenemedi, tekrar deneyin.";
  }
  if (error instanceof TypeError) {
    return "Bağlantı kurulamadı. Setler yüklenemedi, tekrar deneyin.";
  }
  if (error instanceof Error && error.message) return error.message;
  return "Setler yüklenemedi, tekrar deneyin.";
}

/** Tenant kapsamındaki tüm setleri listeler (V3 ile aynı GET). */
export async function listExtraSets(): Promise<SavedExtraSet[]> {
  const raw = await apiClient<RawSet[]>(ENDPOINT, { method: "GET" });
  if (!Array.isArray(raw)) return [];
  return raw.map(normalizeSet).filter((s): s is SavedExtraSet => s !== null);
}

/** Set oluşturur veya aynı isimdeyse günceller (V3 POST sözleşmesi; ayrı PUT yok). */
export async function upsertExtraSet(name: string, items: ExtraSetItem[]): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Lütfen bir isim girin");
  if (!items.length) throw new Error("Kaydedilecek ekstra hesaplama bulunamadı");

  const data = items.map((item) => ({
    id: item.id || newLocalId(),
    name: String(item.name || ""),
    value: item.value === undefined || item.value === null ? "" : String(item.value),
  }));

  await apiClient<RawSet>(ENDPOINT, {
    method: "POST",
    body: { name: trimmed, data },
  });
}

/** Seti siler (V3 DELETE). */
export async function removeExtraSet(id: number): Promise<void> {
  if (!Number.isFinite(id) || id <= 0) throw new Error("Geçersiz set");
  await apiClient(`${ENDPOINT}/${id}`, { method: "DELETE" });
}
