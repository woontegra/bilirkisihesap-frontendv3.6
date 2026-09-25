/**
 * Kayıtlı hesaplama listesi — başlangıç/bitiş tarihi çözümleme.
 * Farklı hesaplama türleri farklı payload alanları kullanır; eski kayıtlar da okunur.
 */

const START_KEYS = [
  "startDate",
  "baslangicTarihi",
  "employmentStartDate",
  "workStartDate",
  "iseGiris",
  "ise_giris",
  "start_date",
  "dateIn",
  "weeklyStartDateISO",
] as const;

const END_KEYS = [
  "endDate",
  "bitisTarihi",
  "employmentEndDate",
  "workEndDate",
  "istenCikis",
  "isten_cikis",
  "end_date",
  "dateOut",
  "weeklyEndDateISO",
] as const;

const PERIOD_ARRAY_KEYS = ["periods", "donemler", "workPeriods", "periodList", "donemListesi"] as const;

const PERIOD_START_KEYS = ["startDate", "baslangicTarihi", "fromDate", "start", "dateIn", "startISO"] as const;
const PERIOD_END_KEYS = ["endDate", "bitisTarihi", "toDate", "end", "dateOut", "endISO"] as const;

function parsePayload(item: unknown): Record<string, unknown> {
  if (!item || typeof item !== "object") return {};
  const record = item as Record<string, unknown>;
  const raw = record.data;
  if (!raw) return {};
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw) as unknown;
      return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
  return typeof raw === "object" ? (raw as Record<string, unknown>) : {};
}

function pickString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function pickFromObject(
  obj: Record<string, unknown> | undefined,
  keys: readonly string[],
): string | null {
  if (!obj) return null;
  for (const key of keys) {
    const found = pickString(obj[key]);
    if (found) return found;
  }
  return null;
}

function nestedObjects(pd: Record<string, unknown>): Record<string, unknown>[] {
  const inner = pd.data;
  const innerObj =
    inner && typeof inner === "object" && !Array.isArray(inner)
      ? (inner as Record<string, unknown>)
      : undefined;

  const form =
    pd.form && typeof pd.form === "object" && !Array.isArray(pd.form)
      ? (pd.form as Record<string, unknown>)
      : undefined;

  const formValues =
    pd.formValues && typeof pd.formValues === "object" && !Array.isArray(pd.formValues)
      ? (pd.formValues as Record<string, unknown>)
      : undefined;

  const calculationData =
    pd.calculationData && typeof pd.calculationData === "object" && !Array.isArray(pd.calculationData)
      ? (pd.calculationData as Record<string, unknown>)
      : undefined;

  const inputData =
    pd.inputData && typeof pd.inputData === "object" && !Array.isArray(pd.inputData)
      ? (pd.inputData as Record<string, unknown>)
      : undefined;

  return [pd, innerObj, form, formValues, calculationData, inputData].filter(
    (obj): obj is Record<string, unknown> => Boolean(obj),
  );
}

function pickStateDates(
  pd: Record<string, unknown>,
  stateKeys: string[],
): { start: string | null; end: string | null } {
  const states: Record<string, unknown>[] = [];
  for (const key of stateKeys) {
    const direct = pd[key];
    if (direct && typeof direct === "object" && !Array.isArray(direct)) {
      states.push(direct as Record<string, unknown>);
    }
    const form = pd.form as Record<string, unknown> | undefined;
    const formValues = pd.formValues as Record<string, unknown> | undefined;
    if (form?.[key] && typeof form[key] === "object" && !Array.isArray(form[key])) {
      states.push(form[key] as Record<string, unknown>);
    }
    if (
      formValues?.[key] &&
      typeof formValues[key] === "object" &&
      !Array.isArray(formValues[key])
    ) {
      states.push(formValues[key] as Record<string, unknown>);
    }
  }

  for (const state of states) {
    const start = pickFromObject(state, START_KEYS);
    const end = pickFromObject(state, END_KEYS);
    if (start || end) return { start, end };
  }
  return { start: null, end: null };
}

function pickPeriodBounds(pd: Record<string, unknown>): { start: string | null; end: string | null } {
  for (const obj of nestedObjects(pd)) {
    for (const arrayKey of PERIOD_ARRAY_KEYS) {
      const arr = obj[arrayKey];
      if (!Array.isArray(arr) || arr.length === 0) continue;

      const periods = arr.filter(
        (p): p is Record<string, unknown> => Boolean(p) && typeof p === "object" && !Array.isArray(p),
      );
      if (periods.length === 0) continue;

      const withStart = periods
        .map((p) => ({ start: pickFromObject(p, PERIOD_START_KEYS) }))
        .filter((x) => x.start)
        .sort((a, b) => new Date(a.start!).getTime() - new Date(b.start!).getTime());

      const withEnd = periods
        .map((p) => ({ end: pickFromObject(p, PERIOD_END_KEYS) }))
        .filter((x) => x.end)
        .sort((a, b) => new Date(b.end!).getTime() - new Date(a.end!).getTime());

      const start = withStart[0]?.start ?? null;
      const end = withEnd[0]?.end ?? null;
      if (start || end) return { start, end };
    }

    const legacyPeriods = obj.periods;
    if (Array.isArray(legacyPeriods) && legacyPeriods.length > 0) {
      const mapped = legacyPeriods.filter(
        (p): p is Record<string, unknown> => Boolean(p) && typeof p === "object",
      );
      const starts = mapped
        .map((p) => pickString(p.start, p.startDate, p.baslangicTarihi))
        .filter(Boolean) as string[];
      const ends = mapped
        .map((p) => pickString(p.end, p.endDate, p.bitisTarihi))
        .filter(Boolean) as string[];
      if (starts.length || ends.length) {
        starts.sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
        ends.sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
        return { start: starts[0] ?? null, end: ends[0] ?? null };
      }
    }
  }

  return { start: null, end: null };
}

function pickGenericEmploymentDates(
  item: Record<string, unknown>,
  pd: Record<string, unknown>,
): { start: string | null; end: string | null } {
  let start: string | null = pickFromObject(item, START_KEYS);
  let end: string | null = pickFromObject(item, END_KEYS);

  for (const obj of nestedObjects(pd)) {
    if (!start) start = pickFromObject(obj, START_KEYS);
    if (!end) end = pickFromObject(obj, END_KEYS);
    if (start && end) break;
  }

  return { start, end };
}

export function getCaseStartDate(item: unknown): string | null {
  if (!item || typeof item !== "object") return null;
  const record = item as Record<string, unknown>;
  const pd = parsePayload(item);

  const generic = pickGenericEmploymentDates(record, pd);
  if (generic.start) return generic.start;

  const donemsel = pickStateDates(pd, ["donemselState"]);
  if (donemsel.start) return donemsel.start;

  const karma = pickStateDates(pd, ["haftalikKarmaState"]);
  if (karma.start) return karma.start;

  return pickPeriodBounds(pd).start;
}

export function getCaseEndDate(item: unknown): string | null {
  if (!item || typeof item !== "object") return null;
  const record = item as Record<string, unknown>;
  const pd = parsePayload(item);

  const generic = pickGenericEmploymentDates(record, pd);
  if (generic.end) return generic.end;

  const donemsel = pickStateDates(pd, ["donemselState"]);
  if (donemsel.end) return donemsel.end;

  const karma = pickStateDates(pd, ["haftalikKarmaState"]);
  if (karma.end) return karma.end;

  return pickPeriodBounds(pd).end;
}
