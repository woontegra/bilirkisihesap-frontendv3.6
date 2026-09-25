/** Backend `dateHelpers.js` — yerel takvim günü. */

export function normalizeDate(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;
  const s = String(dateStr).trim();
  if (s.includes(".")) {
    const [gun, ay, yil] = s.split(".");
    return `${yil}-${String(ay).padStart(2, "0")}-${String(gun).padStart(2, "0")}`;
  }
  return s.length >= 10 ? s.slice(0, 10) : s;
}

export function normalizeLocalDate(dateStr: string | null | undefined): Date | null {
  if (!dateStr || typeof dateStr !== "string") return null;
  try {
    const trimmed = dateStr.trim();
    if (!trimmed || trimmed.length < 10) return null;
    let normalized = trimmed;
    if (trimmed.includes(".")) {
      const parts = trimmed.split(".");
      if (parts.length !== 3) return null;
      const [d, m, y] = parts;
      if (!d || !m || !y) return null;
      normalized = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    }
    const [ys, ms, ds] = normalized.slice(0, 10).split("-").map(Number);
    if (!Number.isFinite(ys) || !Number.isFinite(ms) || !Number.isFinite(ds)) return null;
    const dt = new Date(ys, ms - 1, ds);
    if (dt.getFullYear() !== ys || dt.getMonth() !== ms - 1 || dt.getDate() !== ds) return null;
    return dt;
  } catch {
    return null;
  }
}

export function toISODateLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}
