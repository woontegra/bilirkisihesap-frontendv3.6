import type { WorkDay } from "./generateWorkDays48";

export type Weekly48Row = {
  /** Hafta kovası için sabit anahtar (ISO Pazartesi veya kısmi son hafta birleştirmesi). */
  weekStartMonday: string;
  startDate: string;
  endDate: string;
  workDayCount: number;
  fazlaMesaiSaat: number;
};

function parseISODateLocal(iso: string): Date | null {
  const s = String(iso || "").slice(0, 10);
  if (!s) return null;
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d) return null;
  const dt = new Date(y, m - 1, d);
  if (Number.isNaN(+dt)) return null;
  return dt;
}

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getMonday(d: Date): Date {
  const day = d.getDay(); // pazar=0
  const diff = day === 0 ? -6 : 1 - day;
  const m = new Date(d);
  m.setDate(d.getDate() + diff);
  return m;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function daySerialUTC(d: Date): number {
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
}

function diffCalendarDays(a: Date, b: Date): number {
  // Yerel saat/DST kaymaları hafta kovasını kaydırmasın diye UTC gün serisi kullan.
  return daySerialUTC(a) - daySerialUTC(b);
}

/** İşe girişe hizalı 7 günlük kova anahtarı (groupWeeks48 ile aynı). Zorunlu düşüm gruplaması için. */
export function getAnchorWeekBucketKey(dateIso: string, anchorStartIso: string): string | null {
  const dt = parseISODateLocal(String(dateIso).slice(0, 10));
  const anchorStart = parseISODateLocal(String(anchorStartIso).slice(0, 10));
  if (!dt || !anchorStart) return null;
  const dayOffset = diffCalendarDays(dt, anchorStart);
  const cycleIndex = Math.floor(dayOffset / 7);
  return toISODate(addDays(anchorStart, cycleIndex * 7));
}

export type GroupWeeks48Options = {
  /** Dönem sonu: bu tarihten sonraki günler ISO haftasına dahil edilmez; son kısmi hafta bir önceki Pazartesi kovasında birleştirilir (yılda en fazla 52 tam blok). */
  periodStart?: string;
  periodEnd?: string;
};

/**
 * 24/48: haftalık çalışma günü × 3 = haftalık FM saati.
 * Dönem uçları verildiğinde, Pazar'ı dönem bitişinden sonraki son ISO haftası bir önceki haftayla birleştirilir (ör. 2018'de 53. Pazartesi sorunu).
 */
export function groupWeeks48(workDays: WorkDay[], opts?: GroupWeeks48Options): Weekly48Row[] {
  if (!workDays.length) return [];

  const ps = opts?.periodStart ? parseISODateLocal(String(opts.periodStart).slice(0, 10)) : null;
  const pe = opts?.periodEnd ? parseISODateLocal(String(opts.periodEnd).slice(0, 10)) : null;
  const anchorStart = ps;

  const weeklyMap = new Map<string, { weekStartMonday: string; startDate: string; endDate: string; workDayCount: number }>();
  workDays.forEach((d) => {
    const dt = parseISODateLocal(d.date);
    if (!dt) return;
    let bucketStart: Date;
    if (anchorStart) {
      // Dönem satırları Pazartesi bazlı değil, dönem başlangıcına göre 7 günlük döngüyle kurulur.
      const dayOffset = diffCalendarDays(dt, anchorStart);
      const cycleIndex = Math.floor(dayOffset / 7);
      bucketStart = addDays(anchorStart, cycleIndex * 7);
    } else {
      // Fallback: dönem başlangıcı verilmediyse ISO Pazartesi.
      bucketStart = getMonday(dt);
      if (pe) {
        const weekEnd = addDays(bucketStart, 6);
        if (weekEnd.getTime() > pe.getTime()) {
          bucketStart = addDays(bucketStart, -7);
        }
      }
    }
    const key = toISODate(bucketStart);
    const prev = weeklyMap.get(key);
    const cur = prev || { weekStartMonday: key, startDate: key, endDate: key, workDayCount: 0 };
    const next = { ...cur, weekStartMonday: key };
    if (d.date < next.startDate) next.startDate = d.date;
    if (d.date > next.endDate) next.endDate = d.date;
    if (d.isWork) next.workDayCount += 1;
    weeklyMap.set(key, next);
  });

  return [...weeklyMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([, w]) => {
      const fazlaMesaiSaat = Math.max(0, w.workDayCount) * 3;
      return {
        weekStartMonday: w.weekStartMonday,
        startDate: w.startDate,
        endDate: w.endDate,
        workDayCount: w.workDayCount,
        fazlaMesaiSaat,
      };
    })
    .filter((r) => r.workDayCount > 0);
}
