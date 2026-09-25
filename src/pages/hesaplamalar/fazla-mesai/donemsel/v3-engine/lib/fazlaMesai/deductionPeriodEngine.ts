// @ts-nocheck — V3'ten birebir kopya; yalnız import yolları güncellendi.
/**
 * Standart fazla mesai — UBGT / yıllık izin düşüm dönemi motoru (saf fonksiyon).
 * Şimdilik 7 günlük çalışma senaryosu: düşüm penceresi = tetikleyici tarihten itibaren 7 takvim günü.
 */

import { addDays, differenceInCalendarDays, isValid, startOfDay } from "date-fns";
import type { ExcludedDay } from "../../types/exclusionStorage";

export type DeductionKind = "UBGT" | "YILLIK_IZIN";

/** 7 günlük standart senaryo: düşüm satırı tetikleyici günden başlar, 7 takvim günü sürer. */
export const FM_DEDUCTION_WINDOW_DAYS = 7;

const UBGT_ALIASES = new Set(["UBGT", "ubgt"]);
const YILLIK_IZIN_ALIASES = new Set([
  "Yıllık İzin",
  "Yillik Izin",
  "YILLIK_IZIN",
  "yillik_izin",
]);

export interface NormalizedDeductionOnDate {
  dateISO: string;
  kind: DeductionKind;
  originalType: string;
  /** Aynı tarihte birden fazla kayıt varsa en yüksek gün değeri (0.5 veya 1). */
  dayWeight: number;
  sourceIds: string[];
}

export interface DeductionCluster {
  startISO: string;
  endISO: string;
  deductions: NormalizedDeductionOnDate[];
  /** Kümedeki benzersiz tarihlerin dayWeight toplamı (çift tarih yok). */
  totalDeductionDayUnits: number;
}

export interface FmPeriodSegment {
  startISO: string;
  endISO: string;
  containsDeduction: boolean;
  deductions: NormalizedDeductionOnDate[];
  /** Örn. "(2 gün UBGT düşülmüştür)" veya birleşik açıklama */
  caption: string;
  debug: {
    segmentKind: "normal" | "deduction";
    clusterIndex: number | null;
  };
}

export interface BuildDeductionPeriodsInput {
  periodStart: string;
  periodEnd: string;
  exclusions: ExcludedDay[];
  /** Haftalık çalışma günü; 7 = standart tam hafta penceresi. */
  weeklyWorkDays?: number;
}

export interface BuildDeductionPeriodsResult {
  segments: FmPeriodSegment[];
  clusters: DeductionCluster[];
  normalizedDeductions: NormalizedDeductionOnDate[];
  debug: {
    periodStartISO: string;
    periodEndISO: string;
    deductionWindowDays: number;
    rawExclusionCount: number;
    normalizedDayCount: number;
    clusterCount: number;
    segmentCount: number;
  };
}

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * yyyy-MM-dd veya dd.MM.yyyy — yerel takvim günü (timezone kayması yok).
 */
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
    return startOfDay(dt);
  }

  const head = raw.slice(0, 10);
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(head);
  if (iso) {
    const y = Number(iso[1]);
    const m = Number(iso[2]);
    const d = Number(iso[3]);
    const dt = new Date(y, m - 1, d);
    if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
    return startOfDay(dt);
  }

  const fallback = new Date(raw);
  if (!isValid(fallback)) return null;
  return startOfDay(fallback);
}

function classifyDeductionKind(type: string): DeductionKind | null {
  const t = String(type ?? "").trim();
  if (UBGT_ALIASES.has(t) || t.toUpperCase() === "UBGT") return "UBGT";
  if (YILLIK_IZIN_ALIASES.has(t)) return "YILLIK_IZIN";
  if (/yıllık\s*izin/i.test(t) || /yillik\s*izin/i.test(t)) return "YILLIK_IZIN";
  return null;
}

function exclusionDayWeight(ex: ExcludedDay): number {
  const explicit = Number(ex.days);
  if (Number.isFinite(explicit) && explicit > 0) {
    return explicit >= 1 ? 1 : 0.5;
  }
  return 1;
}

/**
 * ExcludedDay kayıtlarını takvim günlerine açar; aynı tarihte en yüksek dayWeight kalır.
 */
export function normalizeDeductionDays(exclusions: ExcludedDay[]): NormalizedDeductionOnDate[] {
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
      cur = addDays(cur, 1);
    }
  }

  return Array.from(byDate.values()).sort((a, b) => a.dateISO.localeCompare(b.dateISO));
}

function mergeDeductionIntoCluster(
  cluster: DeductionCluster,
  item: NormalizedDeductionOnDate,
): void {
  const idx = cluster.deductions.findIndex((d) => d.dateISO === item.dateISO);
  if (idx >= 0) {
    const prev = cluster.deductions[idx];
    const weight = Math.max(prev.dayWeight, item.dayWeight);
    cluster.deductions[idx] = {
      ...prev,
      dayWeight: weight,
      sourceIds: [...new Set([...prev.sourceIds, ...item.sourceIds])],
      originalType:
        prev.kind !== item.kind
          ? `${prev.originalType} + ${item.originalType}`
          : prev.originalType,
    };
  } else {
    cluster.deductions.push({ ...item });
  }
  cluster.deductions.sort((a, b) => a.dateISO.localeCompare(b.dateISO));
  cluster.totalDeductionDayUnits = cluster.deductions.reduce((s, d) => s + d.dayWeight, 0);
}

/**
 * Her düşüm günü için [gün, gün+window-1] penceresi; iç içe olanlar tek kümeye birleşir.
 */
export function buildDeductionClusters(
  normalizedDays: NormalizedDeductionOnDate[],
  windowDays: number,
): DeductionCluster[] {
  const win = Math.max(1, Math.floor(windowDays));
  const clusters: DeductionCluster[] = [];

  for (const item of normalizedDays) {
    const d = parseFmDate(item.dateISO);
    if (!d) continue;
    const end = addDays(d, win - 1);

    let target: DeductionCluster | undefined;
    for (const c of clusters) {
      const cStart = parseFmDate(c.startISO);
      const cEnd = parseFmDate(c.endISO);
      if (!cStart || !cEnd) continue;
      if (d >= cStart && d <= cEnd) {
        target = c;
        break;
      }
    }

    if (target) {
      mergeDeductionIntoCluster(target, item);
      continue;
    }

    const fresh: DeductionCluster = {
      startISO: toISODate(d),
      endISO: toISODate(end),
      deductions: [{ ...item }],
      totalDeductionDayUnits: item.dayWeight,
    };
    clusters.push(fresh);
  }

  clusters.sort((a, b) => a.startISO.localeCompare(b.startISO));

  const merged: DeductionCluster[] = [];
  for (const c of clusters) {
    const last = merged[merged.length - 1];
    if (!last) {
      merged.push(c);
      continue;
    }
    const lastEnd = parseFmDate(last.endISO);
    const curStart = parseFmDate(c.startISO);
    if (lastEnd && curStart && curStart <= addDays(lastEnd, 1)) {
      const newEnd =
        parseFmDate(c.endISO)! > lastEnd ? parseFmDate(c.endISO)! : lastEnd;
      last.endISO = toISODate(newEnd);
      for (const d of c.deductions) {
        mergeDeductionIntoCluster(last, d);
      }
    } else {
      merged.push(c);
    }
  }

  return merged;
}

function formatCaption(deductions: NormalizedDeductionOnDate[]): string {
  if (deductions.length === 0) return "";
  const ubgtUnits = deductions.filter((d) => d.kind === "UBGT").reduce((s, d) => s + d.dayWeight, 0);
  const izinUnits = deductions
    .filter((d) => d.kind === "YILLIK_IZIN")
    .reduce((s, d) => s + d.dayWeight, 0);

  const parts: string[] = [];
  if (ubgtUnits > 0) parts.push(`${formatUnits(ubgtUnits)} gün UBGT`);
  if (izinUnits > 0) parts.push(`${formatUnits(izinUnits)} gün yıllık izin`);

  if (parts.length === 1) return `(${parts[0]} düşülmüştür)`;
  return `(${parts.join(" + ")} düşülmüştür)`;
}

function formatUnits(n: number): string {
  if (Math.abs(n - 0.5) < 1e-6) return "0,5";
  if (Math.abs(n - Math.round(n)) < 1e-6) return String(Math.round(n));
  return String(n).replace(".", ",");
}

function buildCaptionForCluster(cluster: DeductionCluster): string {
  return formatCaption(cluster.deductions);
}

/**
 * Ana dönem + düşüm kümeleri → normal / düşümlü segment listesi.
 */
export function splitPeriodByDeductionClusters(
  periodStartISO: string,
  periodEndISO: string,
  clusters: DeductionCluster[],
): FmPeriodSegment[] {
  const pStart = parseFmDate(periodStartISO);
  const pEnd = parseFmDate(periodEndISO);
  if (!pStart || !pEnd || pEnd < pStart) return [];

  const segments: FmPeriodSegment[] = [];
  let cursor = pStart;

  clusters.forEach((cluster, clusterIndex) => {
    const cStart = parseFmDate(cluster.startISO);
    const cEnd = parseFmDate(cluster.endISO);
    if (!cStart || !cEnd) return;

    const clipStart = cStart < pStart ? pStart : cStart;
    const clipEnd = cEnd > pEnd ? pEnd : cEnd;
    if (clipEnd < pStart || clipStart > pEnd) return;

    if (cursor < clipStart) {
      const normalEnd = addDays(clipStart, -1);
      if (normalEnd >= cursor) {
        segments.push({
          startISO: toISODate(cursor),
          endISO: toISODate(normalEnd),
          containsDeduction: false,
          deductions: [],
          caption: "",
          debug: { segmentKind: "normal", clusterIndex: null },
        });
      }
    }

    segments.push({
      startISO: toISODate(clipStart),
      endISO: toISODate(clipEnd),
      containsDeduction: true,
      deductions: cluster.deductions.filter((d) => {
        const dd = parseFmDate(d.dateISO);
        return dd && dd >= clipStart && dd <= clipEnd;
      }),
      caption: buildCaptionForCluster(cluster),
      debug: { segmentKind: "deduction", clusterIndex },
    });

    cursor = addDays(clipEnd, 1);
  });

  if (cursor <= pEnd) {
    segments.push({
      startISO: toISODate(cursor),
      endISO: toISODate(pEnd),
      containsDeduction: false,
      deductions: [],
      caption: "",
      debug: { segmentKind: "normal", clusterIndex: null },
    });
  }

  return segments;
}

/**
 * Standart fazla mesai ana satırını UBGT / yıllık izin düşümlerine göre parçalar.
 */
export function buildDeductionPeriodsForFm(
  input: BuildDeductionPeriodsInput,
): BuildDeductionPeriodsResult {
  const periodStart = parseFmDate(input.periodStart);
  const periodEnd = parseFmDate(input.periodEnd);
  /** Satır bölme penceresi her zaman 7 takvim günü; weeklyWorkDays yalnızca FM saati köprüsünde kullanılır. */
  const windowDays = FM_DEDUCTION_WINDOW_DAYS;

  if (!periodStart || !periodEnd || periodEnd < periodStart) {
    return {
      segments: [],
      clusters: [],
      normalizedDeductions: [],
      debug: {
        periodStartISO: "",
        periodEndISO: "",
        deductionWindowDays: windowDays,
        rawExclusionCount: input.exclusions?.length ?? 0,
        normalizedDayCount: 0,
        clusterCount: 0,
        segmentCount: 0,
      },
    };
  }

  const periodStartISO = toISODate(periodStart);
  const periodEndISO = toISODate(periodEnd);

  const allNormalized = normalizeDeductionDays(input.exclusions ?? []);
  const normalizedDeductions = allNormalized.filter((d) => {
    const dd = parseFmDate(d.dateISO);
    return dd && dd >= periodStart && dd <= periodEnd;
  });

  const clusters = buildDeductionClusters(normalizedDeductions, windowDays);
  const segments = splitPeriodByDeductionClusters(periodStartISO, periodEndISO, clusters);

  return {
    segments,
    clusters,
    normalizedDeductions,
    debug: {
      periodStartISO,
      periodEndISO,
      deductionWindowDays: windowDays,
      rawExclusionCount: input.exclusions?.length ?? 0,
      normalizedDayCount: normalizedDeductions.length,
      clusterCount: clusters.length,
      segmentCount: segments.length,
    },
  };
}

/** Geliştirme / birim kontrolü için örnek senaryolar (saf). */
export function runDeductionPeriodEngineExamples(): {
  example1: BuildDeductionPeriodsResult;
  example2: BuildDeductionPeriodsResult;
  example3Units: number;
} {
  const example1 = buildDeductionPeriodsForFm({
    periodStart: "01.01.2021",
    periodEnd: "31.12.2021",
    exclusions: [
      {
        id: "ubgt-2304",
        type: "UBGT",
        start: "2021-04-23",
        end: "2021-04-23",
        days: 1,
      },
    ],
    weeklyWorkDays: 7,
  });

  const example2 = buildDeductionPeriodsForFm({
    periodStart: "01.01.2021",
    periodEnd: "31.12.2021",
    exclusions: [
      {
        id: "ubgt-2304",
        type: "UBGT",
        start: "2021-04-23",
        end: "2021-04-23",
        days: 1,
      },
      {
        id: "izin-2504",
        type: "Yıllık İzin",
        start: "2021-04-25",
        end: "2021-04-25",
        days: 1,
      },
    ],
    weeklyWorkDays: 7,
  });

  const example3 = buildDeductionPeriodsForFm({
    periodStart: "01.05.2022",
    periodEnd: "07.05.2022",
    exclusions: [
      {
        id: "ubgt-a",
        type: "UBGT",
        start: "2022-05-01",
        end: "2022-05-01",
        days: 1,
      },
      {
        id: "ubgt-b",
        type: "UBGT",
        start: "2022-05-01",
        end: "2022-05-01",
        days: 0.5,
      },
    ],
    weeklyWorkDays: 7,
  });

  const cluster = example3.clusters[0];
  const example3Units = cluster?.totalDeductionDayUnits ?? 0;

  return { example1, example2, example3Units };
}
