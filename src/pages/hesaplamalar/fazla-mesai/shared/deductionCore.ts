/**
 * UBGT / yıllık izin düşüm motoru — V3 `deductionPeriodEngine` + `weeklyOffExclusionFilter`
 * + `expandStandartRowsForDeductions` ile birebir uyumlu (date-fns bağımlılığı yok).
 */

export type DeductionKind = "UBGT" | "YILLIK_IZIN";

export type DeductionExclusion = {
  id: string;
  type: string;
  start: string;
  end: string;
  days: number;
};

export type NormalizedDeductionOnDate = {
  dateISO: string;
  kind: DeductionKind;
  originalType: string;
  /** Aynı tarihte birden fazla kayıt varsa en yüksek gün değeri (0.5 veya 1). */
  dayWeight: number;
  sourceIds: string[];
};

export type DeductionWindow = {
  startISO: string;
  endISO: string;
  deductions: NormalizedDeductionOnDate[];
  totalDeductionDayUnits: number;
  caption: string;
};

const UBGT_ALIASES = new Set(["UBGT", "ubgt"]);
const YILLIK_IZIN_ALIASES = new Set([
  "Yıllık İzin",
  "Yillik Izin",
  "YILLIK_IZIN",
  "yillik_izin",
]);

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addLocalDays(d: Date, amount: number): Date {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  out.setDate(out.getDate() + amount);
  return out;
}

/** yyyy-MM-dd veya dd.MM.yyyy — yerel takvim günü (timezone kayması yok). */
export function parseFmDate(value: string): Date | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  const tr = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(raw);
  if (tr) {
    const d = Number(tr[1]);
    const m = Number(tr[2]);
    const y = Number(tr[3]);
    const dt = new Date(y, m - 1, d);
    if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
    return dt;
  }

  const head = raw.slice(0, 10);
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(head);
  if (iso) {
    const y = Number(iso[1]);
    const m = Number(iso[2]);
    const d = Number(iso[3]);
    const dt = new Date(y, m - 1, d);
    if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
    return dt;
  }

  const fallback = new Date(raw);
  if (Number.isNaN(fallback.getTime())) return null;
  return new Date(fallback.getFullYear(), fallback.getMonth(), fallback.getDate());
}

function classifyDeductionKind(type: string): DeductionKind | null {
  const t = String(type ?? "").trim();
  if (UBGT_ALIASES.has(t) || t.toUpperCase() === "UBGT") return "UBGT";
  if (YILLIK_IZIN_ALIASES.has(t)) return "YILLIK_IZIN";
  if (/yıllık\s*izin/i.test(t) || /yillik\s*izin/i.test(t)) return "YILLIK_IZIN";
  return null;
}

function isFmDeductionExclusionType(type: string): boolean {
  return classifyDeductionKind(type) != null;
}

export function exclusionDayWeight(ex: DeductionExclusion): number {
  const explicit = Number(ex.days);
  if (Number.isFinite(explicit) && explicit > 0) {
    return explicit >= 1 ? 1 : 0.5;
  }
  return 1;
}

/** 0=Pazar … 5=Cuma — hafta tatili seçilmemişse tüm günler sayılır. */
export function shouldCountExclusionAnchorDay(date: Date, weeklyOffDay: number | null): boolean {
  if (weeklyOffDay == null || !Number.isInteger(weeklyOffDay)) return true;
  return date.getDay() !== weeklyOffDay;
}

function anchorDaysForOneExclusion(ex: DeductionExclusion, weeklyOffDay: number): Date[] {
  const exStart = parseFmDate(ex.start ?? "");
  const exEnd = parseFmDate(ex.end ?? "");
  if (!exStart || !exEnd || exStart > exEnd) return [];

  const explicitCap =
    Number(ex.days) > 0 && Number.isFinite(Number(ex.days)) ? Math.floor(Number(ex.days)) : null;

  const anchors: Date[] = [];
  let used = 0;
  let cur = exStart;
  while (cur <= exEnd) {
    if (explicitCap != null && used >= explicitCap) break;
    if (shouldCountExclusionAnchorDay(cur, weeklyOffDay)) {
      anchors.push(cur);
    }
    used += 1;
    cur = addLocalDays(cur, 1);
  }
  return anchors;
}

/**
 * Motora gidecek exclusion listesi — hafta tatiline denk günler çıkarılır; diğer günler tek günlük kayıt olarak kalır.
 */
export function filterExclusionsForWeeklyOff<T extends DeductionExclusion>(
  exclusions: T[],
  weeklyOffDay: number | null | undefined,
): T[] {
  if (weeklyOffDay == null || !Number.isInteger(weeklyOffDay)) {
    return exclusions;
  }

  const out: T[] = [];

  for (const ex of exclusions) {
    if (!isFmDeductionExclusionType(String(ex.type ?? ""))) {
      out.push(ex);
      continue;
    }

    const anchors = anchorDaysForOneExclusion(ex, weeklyOffDay);
    const weight = exclusionDayWeight(ex);
    for (const d of anchors) {
      const iso = toISODate(d);
      out.push({
        ...ex,
        start: iso,
        end: iso,
        days: weight,
      });
    }
  }

  return out;
}

/**
 * ExcludedDay kayıtlarını takvim günlerine açar; aynı tarihte en yüksek dayWeight kalır.
 */
export function normalizeDeductionDays(exclusions: DeductionExclusion[]): NormalizedDeductionOnDate[] {
  const byDate = new Map<string, NormalizedDeductionOnDate>();

  for (const ex of exclusions) {
    const kind = classifyDeductionKind(ex.type ?? "");
    if (!kind) continue;

    const exStart = parseFmDate(ex.start);
    const exEnd = parseFmDate(ex.end);
    if (!exStart || !exEnd || exStart > exEnd) continue;

    const weight = exclusionDayWeight(ex);
    const explicitCap =
      Number(ex.days) > 0 && Number.isFinite(Number(ex.days)) ? Math.floor(Number(ex.days)) : null;

    let used = 0;
    let cur = exStart;
    while (cur <= exEnd) {
      if (explicitCap != null && used >= explicitCap) break;

      const dateISO = toISODate(cur);
      const existing = byDate.get(dateISO);
      if (!existing) {
        byDate.set(dateISO, {
          dateISO,
          kind,
          originalType: ex.type ?? kind,
          dayWeight: weight,
          sourceIds: [ex.id],
        });
      } else {
        existing.dayWeight = Math.max(existing.dayWeight, weight);
        existing.sourceIds.push(ex.id);
        if (existing.kind !== kind) {
          existing.originalType = `${existing.originalType} + ${ex.type ?? kind}`;
        } else if (!existing.originalType.includes(ex.type ?? "")) {
          existing.originalType = `${existing.originalType} + ${ex.type}`;
        }
      }
      used += 1;
      cur = addLocalDays(cur, 1);
    }
  }

  return Array.from(byDate.values()).sort((a, b) => a.dateISO.localeCompare(b.dateISO));
}

function formatDayUnits(n: number): string {
  if (Math.abs(n - 0.5) < 1e-6) return "0,5";
  if (Math.abs(n - Math.round(n)) < 1e-6) return String(Math.round(n));
  return String(n).replace(".", ",");
}

function formatWindowCaption(deductions: NormalizedDeductionOnDate[]): string {
  if (deductions.length === 0) return "";
  const ubgtUnits = deductions.filter((d) => d.kind === "UBGT").reduce((s, d) => s + d.dayWeight, 0);
  const izinUnits = deductions.filter((d) => d.kind === "YILLIK_IZIN").reduce((s, d) => s + d.dayWeight, 0);
  const parts: string[] = [];
  if (ubgtUnits > 0) parts.push(`${formatDayUnits(ubgtUnits)} gün UBGT`);
  if (izinUnits > 0) parts.push(`${formatDayUnits(izinUnits)} gün yıllık izin`);
  if (parts.length === 0) return "";
  if (parts.length === 1) return `(${parts[0]} düşülmüştür)`;
  return `(${parts.join(" + ")} düşülmüştür)`;
}

/** Düşüm günlerini 7 günlük pencerelere böler; bitişik pencereler birleştirilmez. */
export function buildSevenDayDeductionWindows(
  normalizedDays: NormalizedDeductionOnDate[],
  periodEnd: Date,
): DeductionWindow[] {
  if (normalizedDays.length === 0) return [];
  const sorted = [...normalizedDays].sort((a, b) => a.dateISO.localeCompare(b.dateISO));
  const windows: DeductionWindow[] = [];
  let i = 0;
  while (i < sorted.length) {
    const firstDay = parseFmDate(sorted[i].dateISO);
    if (!firstDay) {
      i++;
      continue;
    }
    const windowEnd = addLocalDays(firstDay, 6);
    const group: NormalizedDeductionOnDate[] = [];
    while (i < sorted.length) {
      const d = parseFmDate(sorted[i].dateISO);
      if (!d || d > windowEnd) break;
      group.push(sorted[i]);
      i++;
    }
    const clippedEnd = windowEnd > periodEnd ? periodEnd : windowEnd;
    windows.push({
      startISO: toISODate(firstDay),
      endISO: toISODate(clippedEnd),
      deductions: group,
      totalDeductionDayUnits: group.reduce((s, d) => s + d.dayWeight, 0),
      caption: formatWindowCaption(group),
    });
  }
  return windows;
}

/** V3 `expandStandartRowsForDeductions` ile aynı tam/yarım yıl hafta tavanı. */
export function normalizeWeeksForStandard(startISO: string, endISO: string, rawWeeks: number): number {
  const s = (startISO || "").slice(0, 10);
  const e = (endISO || "").slice(0, 10);
  if (!s || !e) return rawWeeks;
  const sy = s.slice(0, 4);
  const ey = e.slice(0, 4);
  const w = Number(rawWeeks);
  const safeW = Number.isFinite(w) && w > 0 ? w : NaN;
  if (sy === ey && s.slice(5) === "01-01" && e.slice(5) === "12-31") {
    return Number.isFinite(safeW) ? Math.min(52, safeW) : 52;
  }
  if (sy === ey && s.slice(5) === "01-01" && e.slice(5) === "06-30") {
    return Number.isFinite(safeW) ? Math.min(26, safeW) : 26;
  }
  if (sy === ey && s.slice(5) === "07-01" && e.slice(5) === "12-31") {
    return Number.isFinite(safeW) ? Math.min(26, safeW) : 26;
  }
  return rawWeeks;
}

/** Hafta tatili filtresi + gün normalizasyonu + dönem içi günler. */
export function prepareDeductionDaysInPeriod(
  exclusions: DeductionExclusion[],
  periodStartISO: string,
  periodEndISO: string,
  weeklyOffDay: number | null,
): NormalizedDeductionOnDate[] {
  const exclusionsForMotor = filterExclusionsForWeeklyOff(exclusions, weeklyOffDay);
  const allNormalized = normalizeDeductionDays(exclusionsForMotor);
  const periodStart = parseFmDate(periodStartISO);
  const periodEnd = parseFmDate(periodEndISO);
  if (!periodStart || !periodEnd || periodEnd < periodStart) return [];

  return allNormalized.filter((d) => {
    const dd = parseFmDate(d.dateISO);
    return dd && dd >= periodStart && dd <= periodEnd;
  });
}

/** Motor satırları için hafif düşüm günü (hafta tatili filtresi dahil). */
export type FmDeductionDayLite = {
  dateISO: string;
  dayWeight: number;
  kind: DeductionKind;
};

export function normalizeFmDeductionDays(
  exclusions: DeductionExclusion[],
  weeklyOffDay: number | null,
): FmDeductionDayLite[] {
  const exclusionsForMotor = filterExclusionsForWeeklyOff(exclusions, weeklyOffDay);
  return normalizeDeductionDays(exclusionsForMotor).map((d) => ({
    dateISO: d.dateISO,
    dayWeight: d.dayWeight,
    kind: d.kind,
  }));
}

/** Önceden filtrelenmiş düşüm listesini günlere açar (hafta tatili tekrar uygulanmaz). */
export function normalizeFmDeductionDaysFiltered(exclusions: DeductionExclusion[]): FmDeductionDayLite[] {
  return normalizeDeductionDays(exclusions).map((d) => ({
    dateISO: d.dateISO,
    dayWeight: d.dayWeight,
    kind: d.kind,
  }));
}

/** Dönem için 7 günlük düşüm pencereleri (V3 expandStandartRowsForDeductions). */
export function buildDeductionWindowsForPeriod(
  exclusions: DeductionExclusion[],
  periodStartISO: string,
  periodEndISO: string,
  weeklyOffDay: number | null,
): DeductionWindow[] {
  const periodEnd = parseFmDate(periodEndISO);
  if (!periodEnd) return [];
  const days = prepareDeductionDaysInPeriod(exclusions, periodStartISO, periodEndISO, weeklyOffDay);
  return buildSevenDayDeductionWindows(days, periodEnd);
}
