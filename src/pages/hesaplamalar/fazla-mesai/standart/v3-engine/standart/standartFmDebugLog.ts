// @ts-nocheck — V3'ten birebir kopya; yalnız import yolları güncellendi.
/**
 * Standart fazla mesai — satır / hafta / düşüm hata ayıklama logları.
 *
 * Açmak: localStorage.setItem('STANDART_FM_DEBUG', '1') veya ?fmDebug=1
 * Dev'de varsayılan kapalı (spam önlemek için); açmak için yukarıdaki flag.
 * Kapatmak: localStorage.setItem('STANDART_FM_DEBUG', '0')
 */

import type { ExcludedDay } from "../types/exclusionStorage";
import type { FazlaMesaiRowBase } from "../lib/fazlaMesaiShared";

const LOG_PREFIX = "[StandartFM]";

let lastPipelineFingerprint = "";

export function isStandartFmDebugEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const q = new URLSearchParams(window.location.search);
    if (q.get("fmDebug") === "1" || q.get("fmDebug") === "true") return true;
    const stored = localStorage.getItem("STANDART_FM_DEBUG");
    if (stored === "1" || stored === "true") return true;
    if (stored === "0" || stored === "false") return false;
  } catch {
    /* ignore */
  }
  return false;
}

function stamp(): string {
  return new Date().toISOString().slice(11, 23);
}

export function standartFmDebugEndGroup(): void {
  if (!isStandartFmDebugEnabled()) return;
  console.groupEnd();
}

export type StandartFmExclusionSummary = {
  total: number;
  yillikIzin: number;
  ubgt: number;
  rapor: number;
  diger: number;
  samples: Array<{ type: string; start: string; end: string; days?: number }>;
};

export function summarizeExclusions(exclusions: ExcludedDay[]): StandartFmExclusionSummary {
  const samples: StandartFmExclusionSummary["samples"] = [];
  let yillikIzin = 0;
  let ubgt = 0;
  let rapor = 0;
  let diger = 0;
  exclusions.forEach((ex, i) => {
    const t = ex.type ?? "Diğer";
    const days = Number(ex.days) > 0 ? Number(ex.days) : undefined;
    if (t === "Yıllık İzin") yillikIzin += 1;
    else if (t === "UBGT") ubgt += 1;
    else if (t === "Rapor") rapor += 1;
    else diger += 1;
    if (i < 12) {
      samples.push({
        type: t,
        start: String(ex.start ?? "").slice(0, 10),
        end: String(ex.end ?? "").slice(0, 10),
        days,
      });
    }
  });
  return { total: exclusions.length, yillikIzin, ubgt, rapor, diger, samples };
}

function rowFingerprint(rows: FazlaMesaiRowBase[]): string {
  return rows
    .map(
      (r) =>
        `${r.id}|${r.startISO}|${r.endISO}|${r.weeks}|${r.fmHours}|${(r as { yillikIzinAciklama?: string }).yillikIzinAciklama ?? ""}`,
    )
    .join(";");
}

export type StandartFmPipelineInput = {
  iseGiris: string;
  istenCikis: string;
  weeklyDays: string | number;
  dailyWorkingHours: number;
  weeklyFMSaat: number;
  haftaTatiliGunu: number | "" | null | undefined;
  activeTab: string;
  exclusions: ExcludedDay[];
  splitPath: "none" | "sixDay" | "fiveDay" | "sevenDay";
  baseSegmentCount: number;
  rawRowCount: number;
  displayRowCount: number;
  skipAnnualLeaveExclusions: boolean;
};

export function logStandartFmPipeline(
  input: StandartFmPipelineInput,
  rawRows: FazlaMesaiRowBase[],
  displayRows: FazlaMesaiRowBase[],
): void {
  if (!isStandartFmDebugEnabled()) return;

  const fp = [
    input.iseGiris,
    input.istenCikis,
    input.weeklyDays,
    input.dailyWorkingHours,
    input.weeklyFMSaat,
    input.activeTab,
    input.splitPath,
    input.exclusions.length,
    rowFingerprint(rawRows),
    rowFingerprint(displayRows),
  ].join("::");
  if (fp === lastPipelineFingerprint) return;
  lastPipelineFingerprint = fp;

  console.groupCollapsed(`${LOG_PREFIX} ${stamp()} ═══ Pipeline özeti ═══`);
  console.log("Girdiler", {
    ...input,
    exclusionOzeti: summarizeExclusions(input.exclusions),
  });

  const toTable = (rows: FazlaMesaiRowBase[]) =>
    rows.map((r, i) => ({
      "#": i + 1,
      aralik: r.rangeLabel ?? `${r.startISO} – ${r.endISO}`,
      hafta: r.weeks,
      fmSaat: r.fmHours,
      gunlukNet: (r as { dailyNet?: number }).dailyNet,
      calisma: (r as { workedDays?: number }).workedDays,
      dislama: (r as { excludedDays?: number }).excludedDays,
      aciklama: (r as { yillikIzinAciklama?: string }).yillikIzinAciklama ?? "",
    }));

  console.log(`Ham satırlar (${rawRows.length})`);
  console.table(toTable(rawRows));
  console.log(`Cetvel satırları (${displayRows.length})`);
  console.table(toTable(displayRows));

  const sumWeighted = (rows: FazlaMesaiRowBase[]) =>
    rows.reduce((s, r) => s + (Number(r.weeks) || 0) * (Number(r.fmHours) || 0), 0);
  const rawW = sumWeighted(rawRows);
  const dispW = sumWeighted(displayRows);
  console.log("Ağırlıklı FM saat (hafta × fmSaat)", {
    ham: Number(rawW.toFixed(4)),
    cetvel: Number(dispW.toFixed(4)),
    fark: Number((dispW - rawW).toFixed(4)),
  });

  const deductionRows = rawRows.filter((r) => (r as { yillikIzinAciklama?: string }).yillikIzinAciklama);
  const baseRows = rawRows.filter((r) => !(r as { yillikIzinAciklama?: string }).yillikIzinAciklama);
  console.log("V2/split dağılımı", {
    bazSatir: baseRows.length,
    dusumSatir: deductionRows.length,
  });
  if (deductionRows.length === 0 && input.exclusions.length > 0 && input.splitPath !== "none") {
    console.warn(
      `${LOG_PREFIX} UYARI: exclusion var, split=${input.splitPath} ama düşüm satırı yok — tüm düşüm baz haftadan mı kesildi?`,
    );
  }

  displayRows.forEach((r, i) => {
    const raw = rawRows.find((x) => x.id === r.id);
    if (!raw || raw.fmHours === r.fmHours) return;
    console.warn(`${LOG_PREFIX} FM saat değişti (pipeline)`, {
      satir: i + 1,
      aralik: r.rangeLabel,
      hamFmSaat: raw.fmHours,
      cetvelFmSaat: r.fmHours,
      aciklama: (r as { yillikIzinAciklama?: string }).yillikIzinAciklama,
    });
  });

  console.groupEnd();
}

export type AnnualLeaveV2Log = {
  rowIndex: number;
  startISO: string;
  endISO: string;
  hgSafe: number;
  davaciSevenDay: string;
  W0: number;
  dailyNet: number;
  baselineFm: number;
  excludedBlocks: number;
  weeklyClipDeductionWeeks: number;
  excludedWeekCount: number;
  baseWeeks: number;
  scopedExclusionDays: number;
  leaveRowCount: number;
  leaveRows: Array<{
    aralik: string;
    weeks: number;
    fmHours: number;
    workedDays?: number;
    excludedDays?: number;
    aciklama?: string;
  }>;
};

export function logAnnualLeaveV2Expand(payload: AnnualLeaveV2Log): void {
  if (!isStandartFmDebugEnabled()) return;

  const overClip =
    payload.weeklyClipDeductionWeeks > payload.excludedBlocks.length
      ? payload.weeklyClipDeductionWeeks - payload.excludedBlocks.length
      : 0;

  console.log(
    `${LOG_PREFIX} [V2 hg=${payload.hgSafe} ${payload.davaciSevenDay}] #${payload.rowIndex + 1} ${payload.startISO}–${payload.endISO}`,
    {
      W0: payload.W0,
      baseWeeks: payload.baseWeeks,
      baselineFm: payload.baselineFm,
      excludedBlocks: payload.excludedBlocks,
      weeklyClipHafta: payload.weeklyClipDeductionWeeks,
      excludedWeekCount: payload.excludedWeekCount,
      fazlaKesilenHafta: overClip > 0 ? overClip : undefined,
      scopedGun: payload.scopedExclusionDays,
      dusumSatir: payload.leaveRowCount,
    },
  );

  if (payload.leaveRowCount > 0) {
    console.table(payload.leaveRows);
  } else if (payload.excludedBlocks > 0) {
    console.warn(`${LOG_PREFIX} [V2] excludedBlocks=${payload.excludedBlocks} ama düşüm satırı üretilmedi`);
  }

  if (overClip > 0) {
    console.warn(
      `${LOG_PREFIX} [V2] Hafta kesimi: takvim klipsi (${payload.weeklyClipDeductionWeeks}) > blok sayısı (${payload.excludedBlocks}) — baz hafta ${overClip} fazla düşülmüş olabilir`,
    );
  }
}

export type SixDayWeekChunkLog = {
  segmentIndex: number;
  clipStart: string;
  clipEnd: string;
  leaveDaysInt: number;
  nIzin: number;
  nUbgt: number;
  fmHours: number;
  affected: boolean;
};

/** Yalnızca düşümlü haftalar (NORMAL haftalar loglanmaz). */
export function logSixDayWeekChunk(payload: SixDayWeekChunkLog): void {
  if (!isStandartFmDebugEnabled() || !payload.affected) return;
  console.log(
    `${LOG_PREFIX} [6gün/DÜŞÜM] seg#${payload.segmentIndex} ${payload.clipStart}–${payload.clipEnd}`,
    { izin: payload.nIzin, ubgt: payload.nUbgt, leaveDays: payload.leaveDaysInt, fmHours: payload.fmHours },
  );
}

export type SixDayCollapseLog = {
  segmentIndex: number;
  originalWeeks: number;
  deductionWeeks: number;
  combinedNormalWeeks?: number;
  chunkCountAfter: number;
};

export function logSixDayCollapse(payload: SixDayCollapseLog): void {
  if (!isStandartFmDebugEnabled()) return;
  console.log(`${LOG_PREFIX} [6gün] seg#${payload.segmentIndex} birleştirme`, payload);
}
