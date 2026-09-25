/**
 * V3 ortak 270 saat kuralı:
 * - `simple` → Yargıtay: haftalık FM saatinden 5 saat 12 dakika (5,2) düşüm
 * - `detailed` → Şirket: işe giriş yılı bazlı 270 saat muafiyeti, hafta yeniden dağıtımı
 */

export type Mode270 = "none" | "simple" | "detailed";

/** Yargıtay: 5 saat 12 dakika = 5,2 saat */
export const MODE270_SIMPLE_REDUCTION_HOURS = 5 + 12 / 60;

/** Şirket: yıllık dahil edilen fazla mesai saati */
export const MODE270_INCLUDED_HOURS = 270;

export const MODE270_SELECT_OPTIONS = [
  { value: "none" as const, label: "Kapalı" },
  { value: "simple" as const, label: "Yargıtay Uygulaması" },
  { value: "detailed" as const, label: "Şirket Uygulaması" },
] as const;

export type Mode270Row = {
  id: string;
  startISO: string;
  endISO: string;
  weeks: number;
  fmHours: number;
  originalWeekCount?: number;
  isManual?: boolean;
};

export function isValidIsoDate(iso: string): boolean {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

/** V3 `fmHoursAfterYargitay270Simple` — IEEE yuvarlama düzeltmesi. */
export function fmHoursAfterYargitay270Simple(haftalikFmSaat: number): number {
  const raw = Math.max(0, (Number(haftalikFmSaat) || 0) - MODE270_SIMPLE_REDUCTION_HOURS);
  return Math.round(raw * 1e4) / 1e4;
}

export type HireYearWindow = {
  fmStartMs: number;
  fmEndMs: number;
  fmWeeks: number;
};

function parseIsoDateLikeV3(iso: string): Date {
  return new Date(iso);
}

/** V3 `calculateOvertimeWith270AndLimitation` hire-year pencereleri. */
export function buildHireYearWindows(
  iseGirisISO: string,
  istenCikisISO: string,
  weeklyFmHours: number,
  zamanasimiISO: string | null,
): HireYearWindow[] {
  if (!(weeklyFmHours > 0) || !isValidIsoDate(iseGirisISO) || !isValidIsoDate(istenCikisISO)) return [];

  const GUN = 86400000;
  const HAFTA = 7 * GUN;
  const iseGirisTarihi = parseIsoDateLikeV3(iseGirisISO);
  const istenCikisTarihi = parseIsoDateLikeV3(istenCikisISO);
  if (iseGirisTarihi > istenCikisTarihi) return [];

  const zamanaSimiTarihi =
    zamanasimiISO && isValidIsoDate(zamanasimiISO) ? parseIsoDateLikeV3(zamanasimiISO) : null;
  const dusulecekHafta = Math.round(MODE270_INCLUDED_HOURS / weeklyFmHours);

  const windows: HireYearWindow[] = [];
  let yilBaslangic = new Date(iseGirisTarihi);

  while (yilBaslangic <= istenCikisTarihi) {
    const yilBitis = new Date(yilBaslangic);
    yilBitis.setFullYear(yilBitis.getFullYear() + 1);
    yilBitis.setDate(yilBitis.getDate() - 1);

    const fiiliYilBitis = yilBitis > istenCikisTarihi ? istenCikisTarihi : yilBitis;

    const toplamHafta = Math.floor((fiiliYilBitis.getTime() - yilBaslangic.getTime() + GUN) / HAFTA);
    const hireYearFM = Math.max(0, toplamHafta - dusulecekHafta);
    const fmBaslangic = new Date(fiiliYilBitis.getTime() - hireYearFM * HAFTA);

    let fmFiiliBaslangic = fmBaslangic;
    const fmFiiliBitis = fiiliYilBitis;
    let fmFiiliHafta = hireYearFM;

    if (zamanaSimiTarihi) {
      if (zamanaSimiTarihi > fiiliYilBitis) {
        fmFiiliHafta = 0;
      } else if (zamanaSimiTarihi > fmBaslangic) {
        fmFiiliBaslangic = zamanaSimiTarihi;
        fmFiiliHafta = Math.floor((fmFiiliBitis.getTime() - fmFiiliBaslangic.getTime() + GUN) / HAFTA);
        fmFiiliHafta = Math.max(0, Math.min(fmFiiliHafta, hireYearFM));
      }
    }

    if (fmFiiliHafta > 0) {
      windows.push({
        fmStartMs: fmFiiliBaslangic.getTime(),
        fmEndMs: fmFiiliBitis.getTime(),
        fmWeeks: fmFiiliHafta,
      });
    }

    yilBaslangic.setFullYear(yilBaslangic.getFullYear() + 1);
  }
  return windows;
}

/** Şirket (detailed): hire-year hafta yeniden dağıtımı — V3 `computeDisplayRows` sırası. */
export function applyMode270DetailedHireYear<T extends Mode270Row>(
  rows: T[],
  iseGirisISO: string,
  istenCikisISO: string,
  weeklyFmHours: number,
  zamanasimiISO: string | null,
): T[] {
  const valid = rows.filter((r) => r.startISO && r.endISO);
  const weeklyFm = valid[0]?.fmHours ?? weeklyFmHours;
  const windows = buildHireYearWindows(iseGirisISO, istenCikisISO, weeklyFm, zamanasimiISO);
  if (rows.length === 0) return rows;
  if (windows.length === 0) return rows;

  const nextWeeks = new Map<string, number>();
  for (const row of valid) nextWeeks.set(row.id, 0);

  const spans = valid.map((r) => ({
    id: r.id,
    start: parseIsoDateLikeV3(r.startISO).getTime(),
    end: parseIsoDateLikeV3(r.endISO).getTime(),
  }));

  for (const win of windows) {
    let yazilan = 0;
    const hireYearGun = win.fmEndMs - win.fmStartMs;
    for (let i = 0; i < valid.length; i++) {
      if (yazilan >= win.fmWeeks) break;
      const span = spans[i];
      const kesisimBas = Math.max(win.fmStartMs, span.start);
      const kesisimBit = Math.min(win.fmEndMs, span.end);
      if (kesisimBas > kesisimBit) continue;
      const satirGun = kesisimBit - kesisimBas;
      if (satirGun > 0 && hireYearGun > 0) {
        const oran = satirGun / hireYearGun;
        let eklenecek = Math.round(win.fmWeeks * oran);
        eklenecek = Math.min(eklenecek, win.fmWeeks - yazilan);
        if (eklenecek > 0) {
          nextWeeks.set(span.id, (nextWeeks.get(span.id) ?? 0) + eklenecek);
          yazilan += eklenecek;
        }
      }
    }
  }

  return rows.map((r) => {
    if (!r.startISO || !r.endISO) return r;
    const rawWeeks = r.originalWeekCount ?? r.weeks;
    const adjusted = nextWeeks.get(r.id) ?? 0;
    const isManual = !!r.isManual;
    const weeks = Number.isFinite(adjusted)
      ? isManual && adjusted <= 0
        ? Math.max(1, rawWeeks)
        : adjusted > 0
          ? adjusted
          : rawWeeks
      : rawWeeks;
    return { ...r, weeks: weeks > 0 ? weeks : rawWeeks };
  });
}

/** Yargıtay (simple): satır FM saatinden 5,2 düşüm. */
export function applyMode270SimpleToRows<T extends Mode270Row>(
  rows: T[],
  baselineWeeklyFmHours: number,
): T[] {
  return rows.map((r) => {
    const fmHours = fmHoursAfterYargitay270Simple(r.fmHours ?? baselineWeeklyFmHours);
    return { ...r, fmHours };
  });
}

/**
 * Dönemsel Haftalık detailed: takvim yılı başına 270 saat bütçesi (V3 `apply270RuleFrontend`).
 */
export function apply270RuleFrontend<T extends Mode270Row>(periods: T[]): T[] {
  if (!periods?.length) return [];
  const periodsByYear = new Map<number, { p: T; idx: number }[]>();
  periods.forEach((p, idx) => {
    if (!p.startISO) return;
    const year = new Date(p.startISO).getFullYear();
    if (!periodsByYear.has(year)) periodsByYear.set(year, []);
    periodsByYear.get(year)!.push({ p, idx });
  });
  const adjustedMap = new Map<number, { weeks: number; originalWeekCount: number }>();
  const sortedYears = Array.from(periodsByYear.keys()).sort((a, b) => a - b);
  for (const year of sortedYears) {
    const list = [...(periodsByYear.get(year)!)].sort(
      (a, b) =>
        (a.p.startISO ? new Date(a.p.startISO).getTime() : 0) -
        (b.p.startISO ? new Date(b.p.startISO).getTime() : 0),
    );
    let kalanSaat = MODE270_INCLUDED_HOURS;
    for (const { p, idx } of list) {
      const originalWeeks = p.originalWeekCount ?? p.weeks ?? 0;
      const fmHours = p.fmHours ?? 0;
      if (!fmHours || originalWeeks <= 0 || kalanSaat <= 0) {
        adjustedMap.set(idx, { weeks: originalWeeks, originalWeekCount: originalWeeks });
        continue;
      }
      const teorikHafta = kalanSaat / fmHours;
      const dusulecekHafta = Math.min(Math.round(teorikHafta), originalWeeks);
      const dusulenSaat = dusulecekHafta * fmHours;
      kalanSaat = Math.max(0, kalanSaat - dusulenSaat);
      const adjustedWeeks = Math.max(0, originalWeeks - dusulecekHafta);
      adjustedMap.set(idx, { weeks: adjustedWeeks, originalWeekCount: originalWeeks });
    }
  }
  return periods.map((p, idx) => {
    const adj = adjustedMap.get(idx);
    if (adj) {
      const weeks = p.isManual && adj.weeks <= 0 ? (p.originalWeekCount ?? p.weeks ?? 1) : adj.weeks;
      return { ...p, weeks, originalWeekCount: adj.originalWeekCount };
    }
    return { ...p, originalWeekCount: p.originalWeekCount ?? p.weeks };
  });
}
