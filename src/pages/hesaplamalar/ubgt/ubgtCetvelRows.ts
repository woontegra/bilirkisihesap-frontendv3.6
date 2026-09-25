/**
 * UBGT ücret-dönemi cetveli — motor dışı satır birleştirme (V3 ubgtRows +/-).
 * Hesap formülüne dokunmaz; yalnızca görünür satır listesini üretir.
 */
import { formatCoef, formatMoney, parseCoef, parseNum, round2, round6, type UbgtPeriodRow } from "./engine";
import { newLocalId, type PeriodOverride } from "./model";

export type ManualPeriodRow = {
  id: string;
  /** Bu satırın hemen altına eklenir (auto:N veya başka manuel id). */
  insertAfterId: string;
  startISO: string;
  endISO: string;
  wage: string;
  coefficient: string;
  ubgtDays: string;
};

export type ManualDayRow = {
  id: string;
  insertAfterKey: string;
  date: string;
  holidayLabel: string;
  /** 1 = tam, 0.5 = yarım */
  days: number;
};

export type CetvelDisplayRow = {
  id: string;
  source: "auto" | "manual";
  engineIndex?: number;
  period: string;
  startISO: string;
  endISO: string;
  wage: number;
  wageDisplay: string;
  coefficient: number;
  coefficientDisplay: string;
  ubgtDays: number;
  ubgtDaysDisplay: string;
  dailyWage: number;
  ubgtTotal: number;
  persons?: string[];
};

export function autoPeriodId(engineIndex: number): string {
  return `auto:${engineIndex}`;
}

/** Engine period metni "dd.MM.yyyy - dd.MM.yyyy" → bitiş ISO. */
export function parsePeriodEndIso(period: string, fallbackStart: string): string {
  const parts = String(period || "").split(/\s*-\s*/);
  if (parts.length >= 2) {
    const endPart = parts[parts.length - 1]!.trim();
    const m = endPart.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
    if (m) {
      return `${m[3]}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}`;
    }
  }
  return fallbackStart;
}

export function formatPeriodLabel(startISO: string, endISO: string, fallback = ""): string {
  if (!startISO || !endISO) return fallback;
  try {
    const a = new Date(startISO).toLocaleDateString("tr-TR");
    const b = new Date(endISO).toLocaleDateString("tr-TR");
    return `${a}-${b}`;
  } catch {
    return fallback || `${startISO} - ${endISO}`;
  }
}

export function recalcPeriodAmounts(wage: number, coefficient: number, ubgtDays: number) {
  const dailyWage = round6(round6(wage * (coefficient || 1)) / 30);
  const ubgtTotal = round2(round6(dailyWage * (ubgtDays || 0)));
  return { dailyWage, ubgtTotal };
}

export function createEmptyManualPeriod(insertAfterId: string): ManualPeriodRow {
  return {
    id: newLocalId("period"),
    insertAfterId,
    startISO: "",
    endISO: "",
    wage: "0",
    coefficient: "1",
    ubgtDays: "0",
  };
}

export function createEmptyManualDay(insertAfterKey: string): ManualDayRow {
  return {
    id: newLocalId("day"),
    insertAfterKey,
    date: "",
    holidayLabel: "Manuel",
    days: 1,
  };
}

function autoRowFromEngine(
  p: UbgtPeriodRow,
  engineIndex: number,
  ov: PeriodOverride | undefined,
): CetvelDisplayRow {
  const wage = ov?.wage !== undefined && ov.wage !== "" ? parseNum(ov.wage) : p.wage;
  const coefficient =
    ov?.coefficient !== undefined && ov.coefficient !== ""
      ? parseCoef(ov.coefficient)
      : p.coefficient || 1;
  const ubgtDays =
    ov?.ubgtDays !== undefined && ov.ubgtDays !== "" ? parseCoef(ov.ubgtDays) : p.ubgtDays;
  const { dailyWage, ubgtTotal } = recalcPeriodAmounts(wage, coefficient, ubgtDays);
  const startISO = p.startISO ?? "";
  const endISO = parsePeriodEndIso(p.period, startISO);
  return {
    id: autoPeriodId(engineIndex),
    source: "auto",
    engineIndex,
    period: p.period,
    startISO,
    endISO,
    wage,
    wageDisplay: ov?.wage ?? formatMoney(p.wage),
    coefficient,
    coefficientDisplay: ov?.coefficient ?? formatCoef(p.coefficient ?? 1),
    ubgtDays,
    ubgtDaysDisplay: ov?.ubgtDays ?? String(p.ubgtDays),
    dailyWage,
    ubgtTotal,
    persons: p.persons,
  };
}

function manualRowToDisplay(m: ManualPeriodRow): CetvelDisplayRow {
  const wage = parseNum(m.wage);
  const coefficient = parseCoef(m.coefficient);
  const ubgtDays = parseNum(m.ubgtDays);
  const { dailyWage, ubgtTotal } = recalcPeriodAmounts(wage, coefficient, ubgtDays);
  return {
    id: m.id,
    source: "manual",
    period: formatPeriodLabel(m.startISO, m.endISO),
    startISO: m.startISO,
    endISO: m.endISO,
    wage,
    wageDisplay: m.wage,
    coefficient,
    coefficientDisplay: m.coefficient,
    ubgtDays,
    ubgtDaysDisplay: m.ubgtDays,
    dailyWage,
    ubgtTotal,
  };
}

/** Engine dönemleri + gizlenenler + manuel ekler → görünür cetvel. */
export function buildCetvelDisplayRows(
  enginePeriods: UbgtPeriodRow[],
  periodOverrides: Record<string, PeriodOverride>,
  manualPeriodRows: ManualPeriodRow[],
  hiddenPeriodIds: string[],
): CetvelDisplayRow[] {
  const hidden = new Set(hiddenPeriodIds);
  const autos = enginePeriods
    .map((p, i) => autoRowFromEngine(p, i, periodOverrides[String(i)]))
    .filter((r) => !hidden.has(r.id));

  const out: CetvelDisplayRow[] = [...autos];
  for (const m of manualPeriodRows) {
    const disp = manualRowToDisplay(m);
    const idx = out.findIndex((r) => r.id === m.insertAfterId);
    const at = idx >= 0 ? idx + 1 : out.length;
    out.splice(at, 0, disp);
  }
  return out;
}

export function sumCetvelTotals(rows: CetvelDisplayRow[]) {
  return {
    totalDays: round2(rows.reduce((s, r) => s + (r.ubgtDays || 0), 0)),
    totalBrut: round2(rows.reduce((s, r) => s + (r.ubgtTotal || 0), 0)),
  };
}

/** V3 kayıt periods[] içindeki manual:true satırlarını lokal forma aktar. */
export function manualPeriodsFromLegacy(periods: unknown): ManualPeriodRow[] {
  if (!Array.isArray(periods)) return [];
  const out: ManualPeriodRow[] = [];
  let lastAutoOrManualId = "";
  periods.forEach((raw, i) => {
    if (!raw || typeof raw !== "object") return;
    const p = raw as Record<string, unknown>;
    const isManual = Boolean(p.manual || p.wageManual);
    if (!isManual) {
      lastAutoOrManualId = autoPeriodId(i);
      return;
    }
    const id = String(p.id || newLocalId("period"));
    const startISO = String(p.startISO ?? "");
    const endISO = String(p.endISO ?? "");
    out.push({
      id,
      insertAfterId: lastAutoOrManualId || autoPeriodId(Math.max(0, i - 1)),
      startISO,
      endISO,
      wage: p.wage != null ? (typeof p.wage === "number" ? formatMoney(Number(p.wage)) : String(p.wage)) : "0",
      coefficient: p.coefficient != null ? String(p.coefficient) : "1",
      ubgtDays: p.ubgtDays != null ? String(p.ubgtDays) : "0",
    });
    lastAutoOrManualId = id;
  });
  return out;
}

export function dayRowKey(date: string, holidayId: string, manualId?: string): string {
  if (manualId) return `manual:${manualId}`;
  return `auto:${date}|${holidayId}`;
}

export function dateInAnyRange(
  date: string,
  ranges: Array<{ start: string; end: string }>,
): boolean {
  if (!date) return false;
  return ranges.some((r) => r.start && r.end && date >= r.start && date <= r.end);
}
