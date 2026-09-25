/**
 * FM / UBGT — manuel brüt override birleştirme ve temizleme.
 * V3 fmManualWageRowOverrides davranışının V3.5 sadeleştirilmiş hali
 * (satır id + brutManual; asgari/dönem anahtarları yok).
 */

export type ManualBrutCapableOverride = {
  brut?: number;
  brutManual?: boolean;
  wage?: string;
  wageManual?: boolean;
  [key: string]: unknown;
};

export function isManualBrutActiveInOverrides(
  overrides: Record<string, ManualBrutCapableOverride | undefined> | null | undefined,
): boolean {
  if (!overrides) return false;
  return Object.values(overrides).some(
    (v) =>
      v &&
      typeof v === "object" &&
      ((v.brutManual === true && typeof v.brut === "number" && v.brut > 0) ||
        (v.wageManual === true && typeof v.wage === "string" && v.wage.trim() !== "")),
  );
}

/** Şablon brütlerini satır override map’ine yazar (brut + brutManual). */
export function mergeManualWageBrutsIntoRowOverrides<T extends ManualBrutCapableOverride>(
  prev: Record<string, T>,
  brutById: Record<string, number>,
): Record<string, T> {
  const next: Record<string, T> = { ...prev };
  for (const [rowId, brut] of Object.entries(brutById)) {
    if (!(brut > 0)) continue;
    next[rowId] = { ...(next[rowId] ?? ({} as T)), brut, brutManual: true };
  }
  return next;
}

/** Manuel brüt işaretli satırlardan brut alanını kaldırır; diğer override’lar korunur. */
export function clearAllManualBrutFromRowOverrides<T extends ManualBrutCapableOverride>(
  prev: Record<string, T>,
): Record<string, T> {
  const next: Record<string, T> = {};
  for (const [k, v] of Object.entries(prev)) {
    if (!v || typeof v !== "object") continue;
    const ov = { ...v };
    if (ov.brutManual) {
      delete ov.brutManual;
      delete ov.brut;
    }
    if (Object.keys(ov).length > 0) {
      next[k] = ov;
    }
  }
  return next;
}

/** UBGT periodOverrides: şablon ücretlerini index anahtarına yazar. */
export function mergeManualWageBrutsIntoPeriodOverrides(
  prev: Record<string, ManualBrutCapableOverride>,
  brutById: Record<string, number>,
  formatWage: (n: number) => string,
): Record<string, ManualBrutCapableOverride> {
  const next: Record<string, ManualBrutCapableOverride> = { ...prev };
  for (const [rowId, brut] of Object.entries(brutById)) {
    if (!(brut > 0)) continue;
    next[rowId] = {
      ...(next[rowId] ?? {}),
      wage: formatWage(brut),
      wageManual: true,
    };
  }
  return next;
}

/** UBGT: şablondan gelen ücret override’larını kaldırır. */
export function clearManualWageFromPeriodOverrides(
  prev: Record<string, ManualBrutCapableOverride>,
): Record<string, ManualBrutCapableOverride> {
  const next: Record<string, ManualBrutCapableOverride> = {};
  for (const [k, v] of Object.entries(prev)) {
    if (!v || typeof v !== "object") continue;
    const ov = { ...v };
    if (ov.wageManual) {
      delete ov.wageManual;
      delete ov.wage;
    }
    if (Object.keys(ov).length > 0) {
      next[k] = ov;
    }
  }
  return next;
}
