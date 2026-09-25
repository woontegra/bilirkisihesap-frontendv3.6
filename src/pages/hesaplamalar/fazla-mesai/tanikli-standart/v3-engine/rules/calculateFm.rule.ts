/**
 * Tanıklı Standart — FM saat: (dailyNet * workedDays) - 45, negatifse 0.
 * workedDays = segment çalışma günü − excludedDays (oranlama yok).
 * Uzun (>7 takvim günü) ve izin bloğu olmayan segmentlerde tanığın haftalık FM sabiti korunur.
 */

import { differenceInCalendarDays, startOfDay } from "date-fns";
import type { FazlaMesaiRowBase } from "../lib/fazlaMesaiShared";

export const TANIKLI_WEEKLY_WORK_LIMIT = 45;

export type TanikliRowWithSegmentFields = FazlaMesaiRowBase & {
  /** Haftalık tatil hariç, segment içindeki gün sayısı */
  segmentWorkDays?: number;
  excludedDays?: number;
  /** splitByExclusions: izin/UBGT kesişim bloğu */
  isExclusionBlock?: boolean;
};

/** YYYY-MM-DD → yerel takvim (ISO string UTC kayması yok). */
function parseLocalDay(iso: string): Date | null {
  const head = String(iso || "").trim().slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(head);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(y, mo - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  return startOfDay(dt);
}

function inclusiveCalendarSpan(row: TanikliRowWithSegmentFields): number {
  const s = String(row.startISO || "").slice(0, 10);
  const e = String(row.endISO || "").slice(0, 10);
  if (!s || !e) return 0;
  const a = parseLocalDay(s);
  const b = parseLocalDay(e);
  if (!a || !b || b < a) return 0;
  return differenceInCalendarDays(b, a) + 1;
}

function inferDailyNet(row: TanikliRowWithSegmentFields): number {
  const direct = Number(row.dailyNet);
  if (Number.isFinite(direct) && direct > 0) return direct;
  const hg = Math.max(1, Math.min(7, Math.floor(Number((row as FazlaMesaiRowBase).annualLeaveHg) || 6)));
  const baselineFm = Math.max(0, Number(row.fmHours) || 0);
  return hg > 0 ? (baselineFm + TANIKLI_WEEKLY_WORK_LIMIT) / hg : 0;
}

/**
 * `segmentWorkDays` ve `excludedDays` split aşamasında yazılır.
 * Dışlama satırı: workedDays = haftalık çalışma günü (hg) − excludedDays; FM = dailyNet × workedDays − 45.
 */
export function calculateFm<T extends TanikliRowWithSegmentFields>(row: T): T {
  const dailyNet = inferDailyNet(row);
  const seg = Math.max(0, Math.floor(Number(row.segmentWorkDays) || 0));
  const excl = Math.max(0, Math.floor(Number(row.excludedDays) || 0));
  const span = inclusiveCalendarSpan(row);
  const isBlockRow = row.isExclusionBlock === true;
  const hasExclusionDeduction = excl > 0 || isBlockRow;
  const hg = Math.max(1, Math.min(7, Math.floor(Number((row as FazlaMesaiRowBase).annualLeaveHg) || 6)));
  const workedDays = isBlockRow ? Math.max(0, hg - excl) : Math.max(0, seg - excl);
  const baselineFm = Math.max(0, Number(row.fmHours) || 0);
  const raw = dailyNet * workedDays - TANIKLI_WEEKLY_WORK_LIMIT;
  /** Dışlama varsa veya kısa dönemde günlük formül; uzun dönem + dışlama yok → haftalık FM sabiti */
  const keepWeeklyFm = !hasExclusionDeduction && span > 7;
  const fmHours = keepWeeklyFm ? baselineFm : Math.max(0, raw);
  return {
    ...row,
    workedDays,
    excludedDays: excl,
    totalDays: seg,
    fmHours,
  } as T;
}

/**
 * Brüt fazla mesai tutarı ve net (Tanıklı cetvel formülü).
 * `katSayi` dışı sabitler bu modülde; tableDisplayPipeline kullanılmaz.
 */
export function calculateRowMoney<T extends FazlaMesaiRowBase>(row: T, katSayi: number): T {
  const DEN = 225;
  const KATS = 1.5;
  const DAMGA = 0.00759;
  const GELIR = 0.15;
  const b = Number(row.brut) || 0;
  const k = Number(row.katsayi ?? katSayi) || katSayi || 1;
  const w = Math.max(0, Math.floor(Number(row.weeks) || 0));
  const h = Math.max(0, Number(row.fmHours) || 0);
  const fm = Number((((b * k * w * h) / DEN) * KATS).toFixed(2));
  const net = Number((fm * (1 - DAMGA - GELIR)).toFixed(2));
  return {
    ...row,
    fm,
    net,
    wage: b,
    overtimeAmount: fm,
  } as T;
}
