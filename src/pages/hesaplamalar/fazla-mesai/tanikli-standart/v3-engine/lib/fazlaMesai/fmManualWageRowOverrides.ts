// @ts-nocheck
import type { FazlaMesaiRowBase } from "../fazlaMesaiShared";
import { getAsgariUcretByDate } from "../fazlaMesaiShared";
import { fmAsgariManualBrutOverrideKeyForStartISO, FM_ASGARI_MANUAL_BRUT_PREFIX } from "./fmAsgariManualBrutKeys";
import { isFmLeaveDeductionRow } from "./fmLeaveDeductionRow";
import { findAsgariPeriodForStartISO, periodStorageKey } from "../manualWageTemplateStorage";
import { FM_MANUAL_BRUT_PERIOD_PREFIX, fmManualBrutPeriodOverrideKey } from "./tableDisplayPipeline";

type RowOv = Partial<FazlaMesaiRowBase> & { brutManual?: boolean };

function writeManualBrutStableKeys(
  out: Record<string, Partial<FazlaMesaiRowBase>>,
  rowId: string,
  startISO: string | undefined,
  endISO: string | undefined,
  brut: number,
): void {
  const patch: RowOv = { brut, brutManual: true };
  out[rowId] = { ...(out[rowId] as RowOv), ...patch };
  const start = String(startISO ?? "").slice(0, 10);
  const end = String(endISO ?? "").slice(0, 10);
  const asgariKey = start.length >= 10 ? fmAsgariManualBrutOverrideKeyForStartISO(start) : null;
  if (asgariKey) {
    out[asgariKey] = patch;
  }
  if (start.length >= 10 && end.length >= 10) {
    out[fmManualBrutPeriodOverrideKey(start, end)] = patch;
  }
}

export function mergeManualWageBrutsIntoRowOverrides(
  prev: Record<string, Partial<FazlaMesaiRowBase>>,
  brutById: Record<string, number>,
  rows?: FazlaMesaiRowBase[],
): Record<string, Partial<FazlaMesaiRowBase>> {
  const next = { ...prev };
  for (const [rowId, brut] of Object.entries(brutById)) {
    if (!(brut > 0)) {
      continue;
    }
    const row = rows?.find((r) => r.id === rowId);
    if (!row) {
      continue;
    }
    writeManualBrutStableKeys(next, rowId, row.startISO, row.endISO, brut);
  }
  return next;
}

export function reduceRowOverridesWithManualBrut(
  prev: Record<string, Partial<FazlaMesaiRowBase>>,
  rowId: string,
  updates: Partial<FazlaMesaiRowBase>,
): Record<string, Partial<FazlaMesaiRowBase>> {
  const cur = (prev[rowId] || {}) as RowOv;
  const next: RowOv = { ...cur, ...updates };

  if (updates.brut !== undefined) {
    next.brutManual = true;
  }

  if (updates.startISO !== undefined || updates.endISO !== undefined) {
    const iso = String((updates.startISO ?? next.startISO ?? "") as string)
      .trim()
      .slice(0, 10);
    if (iso.length >= 10) {
      const brut = getAsgariUcretByDate(iso);
      if (brut != null) {
        next.brut = brut;
        next.brutManual = false;
      }
    }
  }

  const out: Record<string, Partial<FazlaMesaiRowBase>> = { ...prev, [rowId]: next };

  if (updates.startISO !== undefined || updates.endISO !== undefined) {
    const oldS = cur.startISO;
    const oldE = cur.endISO;
    if (oldS && oldE && String(oldS).trim().length >= 10 && String(oldE).trim().length >= 10) {
      const oldPk = fmManualBrutPeriodOverrideKey(String(oldS), String(oldE));
      if (out[oldPk]) {
        delete out[oldPk];
      }
    }
  }

  if (next.brutManual && typeof next.brut === "number" && next.brut > 0) {
    writeManualBrutStableKeys(
      out,
      rowId,
      String((next.startISO ?? cur.startISO ?? "") as string),
      String((next.endISO ?? cur.endISO ?? "") as string),
      next.brut,
    );
  }

  return out;
}

export function resolveStoredManualBrutForStartISO(
  startISO: string,
  overrides: Record<string, Partial<FazlaMesaiRowBase>>,
  defaultBrut: number,
): { brut: number; brutManual: boolean } {
  const asgariKey = fmAsgariManualBrutOverrideKeyForStartISO(String(startISO || "").slice(0, 10));
  if (asgariKey) {
    const fromAsgari = overrides[asgariKey] as RowOv | undefined;
    if (fromAsgari?.brutManual && typeof fromAsgari.brut === "number" && fromAsgari.brut > 0) {
      return { brut: fromAsgari.brut, brutManual: true };
    }
  }
  return { brut: defaultBrut, brutManual: false };
}

export function applyResolvedManualBrutToRows(
  rows: FazlaMesaiRowBase[],
  overrides: Record<string, Partial<FazlaMesaiRowBase>>,
): FazlaMesaiRowBase[] {
  return rows.map((row) => {
    const cur = overrides[row.id] as RowOv | undefined;
    if (cur?.brutManual && typeof cur.brut === "number" && cur.brut > 0) {
      return { ...row, brut: cur.brut, wage: cur.brut, brutManual: true };
    }
    const start = String(row.startISO || "").slice(0, 10);
    const defaultBrut = row.brut ?? (start ? getAsgariUcretByDate(start) || 0 : 0);
    const resolved = resolveStoredManualBrutForStartISO(start, overrides, defaultBrut);
    if (!resolved.brutManual) {
      return row;
    }
    return { ...row, brut: resolved.brut, wage: resolved.brut, brutManual: true };
  });
}

export function applyStoredManualBrutOverridesToRows(
  out: Record<string, Partial<FazlaMesaiRowBase>>,
  rows: FazlaMesaiRowBase[],
): Record<string, Partial<FazlaMesaiRowBase>> {
  const next = { ...out };
  for (const row of rows) {
    const cur = { ...(next[row.id] || {}) } as RowOv;
    if (cur.brutManual) {
      next[row.id] = cur;
      continue;
    }
    const asgariKey = row.startISO ? fmAsgariManualBrutOverrideKeyForStartISO(String(row.startISO)) : null;
    const periodKey =
      row.startISO && row.endISO
        ? fmManualBrutPeriodOverrideKey(String(row.startISO), String(row.endISO))
        : null;
    const fromAsgari = asgariKey ? (next[asgariKey] as RowOv | undefined) : undefined;
    const fromPeriod = periodKey ? (next[periodKey] as RowOv | undefined) : undefined;
    const source =
      fromAsgari?.brutManual && typeof fromAsgari.brut === "number"
        ? fromAsgari
        : fromPeriod?.brutManual && typeof fromPeriod.brut === "number"
          ? fromPeriod
          : null;
    if (source) {
      next[row.id] = { ...cur, brut: source.brut, brutManual: true };
    }
  }
  return next;
}

/** Manuel brüt (satır + dönem + asgari anahtarları) kaldırılır; diğer override alanları korunur. */
export function clearAllManualBrutFromRowOverrides(
  prev: Record<string, Partial<FazlaMesaiRowBase>>,
): Record<string, Partial<FazlaMesaiRowBase>> {
  const next: Record<string, Partial<FazlaMesaiRowBase>> = {};
  for (const [k, v] of Object.entries(prev)) {
    if (k.startsWith(FM_MANUAL_BRUT_PERIOD_PREFIX) || k.startsWith(FM_ASGARI_MANUAL_BRUT_PREFIX)) {
      continue;
    }
    if (!v || typeof v !== "object") continue;
    const ov = { ...(v as RowOv) };
    if (ov.brutManual) {
      delete ov.brutManual;
      delete ov.brut;
      delete (ov as { wage?: number }).wage;
    }
    if (Object.keys(ov).length > 0) {
      next[k] = ov as Partial<FazlaMesaiRowBase>;
    }
  }
  return next;
}

export function fmPeriodKey(startISO?: string, endISO?: string): string {
  return `${(startISO || "").slice(0, 10)}_${(endISO || "").slice(0, 10)}`;
}

export function resolveRegeneratedBrutFromPrevious<
  T extends { startISO?: string; endISO?: string; brut?: number; brutManual?: boolean },
>(startISO: string, endISO: string, defaultBrut: number, prevApi: T[]): { brut: number; brutManual: boolean } {
  const asgari = findAsgariPeriodForStartISO(startISO);
  if (asgari) {
    const asgariKey = periodStorageKey(asgari);
    const prev = prevApi.find((r) => {
      if (isFmLeaveDeductionRow(r as FazlaMesaiRowBase)) {
        return false;
      }
      const rowPeriod = findAsgariPeriodForStartISO(String(r.startISO || "").slice(0, 10));
      if (!rowPeriod || periodStorageKey(rowPeriod) !== asgariKey) {
        return false;
      }
      return r.brutManual && typeof r.brut === "number" && r.brut > 0;
    });
    if (prev) {
      return { brut: prev.brut, brutManual: true };
    }
  }

  const key = fmPeriodKey(startISO, endISO);
  const prev = prevApi.find(
    (r) => fmPeriodKey(r.startISO, r.endISO) === key && !isFmLeaveDeductionRow(r as FazlaMesaiRowBase),
  );
  if (prev?.brutManual && typeof prev.brut === "number" && prev.brut > 0) {
    return { brut: prev.brut, brutManual: true };
  }
  return { brut: defaultBrut, brutManual: false };
}
