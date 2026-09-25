export type WorkDay = {
  date: string;
  isWork: boolean;
};

export type GenerateWorkDays48Input = {
  startDate: string;
  endDate: string;
  /** İşe giriş — 24/48 fazı bu tarihten itibaren sayılır */
  anchorStartDate: string;
  anchorIsWorkDay: boolean;
};

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseISODateLocal(iso: string): Date | null {
  const s = String(iso || "").slice(0, 10);
  if (!s) return null;
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d) return null;
  const dt = new Date(y, m - 1, d);
  if (Number.isNaN(+dt)) return null;
  return dt;
}

function daySerialUTC(d: Date): number {
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
}

function diffCalendarDays(a: Date, b: Date): number {
  return daySerialUTC(a) - daySerialUTC(b);
}

/**
 * 24/48: 1 çalışma, 2 dinlenme (3 günlük döngü).
 * anchorStartDate günü için anchorIsWorkDay=true ise o gün çalışma; false ise ilk çalışma 3. gündür.
 */
export function generateWorkDays48(input: GenerateWorkDays48Input): WorkDay[] {
  const emp = parseISODateLocal(input.anchorStartDate);
  const start = parseISODateLocal(input.startDate);
  const end = parseISODateLocal(input.endDate);
  if (!emp || !start || !end || end < start) return [];

  const out: WorkDay[] = [];
  const cur = new Date(start);
  while (cur <= end) {
    const dayIndex = diffCalendarDays(cur, emp);
    const isWork = input.anchorIsWorkDay ? dayIndex % 3 === 0 : (dayIndex + 1) % 3 === 0;
    out.push({ date: toISODate(cur), isWork });
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

export function dedupeWorkDaysByDate(days: WorkDay[]): WorkDay[] {
  const m = new Map<string, WorkDay>();
  days.forEach((d) => m.set(d.date, d));
  return [...m.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([, v]) => v);
}
