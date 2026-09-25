/**
 * API kök URL.
 * - Dev: boş → Vite `/api` proxy (localhost:4000)
 * - Prod: yalnızca VITE_API_URL (eksikse açık hata)
 */
export function resolveApiBaseUrl(): string {
  const configured = (import.meta.env.VITE_API_URL ?? "").trim().replace(/\/$/, "");
  if (configured) return configured;
  if (import.meta.env.DEV) return "";
  throw new Error(
    "[API] VITE_API_URL tanımlı değil. Production build için VITE_API_URL ortam değişkenini ayarlayın."
  );
}

export const API_BASE_URL = resolveApiBaseUrl();
