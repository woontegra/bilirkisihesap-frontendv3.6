import { normalizeText } from "../utils";
import { readLogicalCell } from "./groupLogicalColumns";
import type { LogicalColumnGroup } from "./types";

export type RowSignature = {
  filledMask: string;
  dateCols: number[];
  timeCols: number[];
  textCols: number[];
  hash: string;
};

function isLikelyDate(val: string): boolean {
  const s = (val ?? "").toString().trim();
  if (!s) return false;
  if (/^\d{1,2}[./-]\d{1,2}[./-]\d{2,4}$/.test(s)) return true;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return true;
  const n = Number(s);
  return Number.isFinite(n) && n > 30000 && n < 60000;
}

function isLikelyTime(val: string): boolean {
  const s = (val ?? "").toString().trim();
  if (!s) return false;
  if (/^\d{1,2}[:.,]\d{2}/.test(s)) return true;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 && n < 1;
}

function isShiftOrLeaveText(val: string): boolean {
  const raw = (val ?? "").toString().trim();
  if (!raw) return false;
  if (/^\*?off$/i.test(raw) || /hafta\s*tatil/i.test(raw)) return true;
  if (/^\*?\d{1,2}[:.,]\d{2}\s*[-/]\s*\d{1,2}[:.,]\d{2}/i.test(raw)) return true;
  const norm = normalizeText(val);
  if (!norm) return false;
  return (
    norm.includes("off") ||
    norm.includes("hafta tatili") ||
    norm.includes("izin") ||
    norm.includes("rapor")
  );
}

export function buildRowSignature(row: string[], groups: LogicalColumnGroup[]): RowSignature {
  const filled: number[] = [];
  const dateCols: number[] = [];
  const timeCols: number[] = [];
  const textCols: number[] = [];

  for (const g of groups) {
    const val = readLogicalCell(row, g);
    if (!val) continue;
    filled.push(g.index);
    if (isLikelyDate(val)) dateCols.push(g.index);
    else if (isLikelyTime(val)) timeCols.push(g.index);
    else if (isShiftOrLeaveText(val) || /[a-zA-ZğüşöçıİĞÜŞÖÇ]/.test(val)) textCols.push(g.index);
  }

  const filledMask = filled.join(",");
  const hash = `${filledMask}|d:${dateCols.join(".")}|t:${timeCols.join(".")}|x:${textCols.join(".")}`;
  return { filledMask, dateCols, timeCols, textCols, hash };
}

export type DetectedSegment = {
  index: number;
  startRow: number;
  endRow: number;
  signature: string;
  groups: LogicalColumnGroup[];
};

function signaturesCompatible(a: RowSignature, b: RowSignature): boolean {
  if (a.hash === b.hash) return true;
  if (a.filledMask === b.filledMask) return true;
  const aSet = new Set(a.filledMask.split(",").filter(Boolean));
  const bSet = new Set(b.filledMask.split(",").filter(Boolean));
  if (aSet.size === 0 || bSet.size === 0) return false;
  let inter = 0;
  for (const x of aSet) if (bSet.has(x)) inter += 1;
  const union = new Set([...aSet, ...bSet]).size;
  return inter / union >= 0.65;
}

/**
 * Ardışık satırların şema imzası kalıcı değişince yeni segment açar.
 */
export function detectSegments(
  grid: string[][],
  headerRowIndex: number,
  baseGroups: LogicalColumnGroup[],
  minRun = 3,
): DetectedSegment[] {
  const segments: DetectedSegment[] = [];
  let currentSig: RowSignature | null = null;
  let runCount = 0;
  let segStart = headerRowIndex + 1;
  let segIndex = 0;
  let pendingSig: RowSignature | null = null;
  let pendingRun = 0;
  let pendingStart = -1;

  const flush = (endRow: number, sig: string, groups: LogicalColumnGroup[]) => {
    if (endRow < segStart) return;
    segments.push({
      index: segIndex,
      startRow: segStart,
      endRow,
      signature: sig,
      groups,
    });
    segIndex += 1;
  };

  for (let r = headerRowIndex + 1; r < grid.length; r++) {
    const row = grid[r] ?? [];
    if (row.every((c) => !(c ?? "").toString().trim())) continue;

    const sig = buildRowSignature(row, baseGroups);
    if (!currentSig) {
      currentSig = sig;
      runCount = 1;
      segStart = r;
      continue;
    }

    if (signaturesCompatible(currentSig, sig)) {
      runCount += 1;
      pendingSig = null;
      pendingRun = 0;
      continue;
    }

    if (!pendingSig || !signaturesCompatible(pendingSig, sig)) {
      pendingSig = sig;
      pendingRun = 1;
      pendingStart = r;
      continue;
    }

    pendingRun += 1;
    if (pendingRun >= minRun) {
      flush(r - pendingRun, currentSig.hash, baseGroups);
      currentSig = pendingSig;
      runCount = pendingRun;
      segStart = pendingStart;
      pendingSig = null;
      pendingRun = 0;
    }
  }

  const lastRow = grid.length - 1;
  if (currentSig && segStart <= lastRow) {
    flush(lastRow, currentSig.hash, baseGroups);
  }

  if (segments.length === 0 && grid.length > headerRowIndex + 1) {
    segments.push({
      index: 0,
      startRow: headerRowIndex + 1,
      endRow: grid.length - 1,
      signature: "default",
      groups: baseGroups,
    });
  }

  return segments;
}

export function findDuplicateColumns(
  grid: string[][],
  segment: DetectedSegment,
  sampleLimit = 80,
): { primary: number; duplicate: number }[] {
  const rows: string[][] = [];
  for (let r = segment.startRow; r <= segment.endRow && rows.length < sampleLimit; r++) {
    const row = grid[r] ?? [];
    if (row.some((c) => (c ?? "").toString().trim())) rows.push(row);
  }
  const dupes: { primary: number; duplicate: number }[] = [];
  const groups = segment.groups;

  for (let a = 0; a < groups.length; a++) {
    for (let b = a + 1; b < groups.length; b++) {
      let same = 0;
      let compared = 0;
      let filledA = 0;
      let filledB = 0;
      for (const row of rows) {
        const va = readLogicalCell(row, groups[a]);
        const vb = readLogicalCell(row, groups[b]);
        if (va) filledA += 1;
        if (vb) filledB += 1;
        if (!va && !vb) continue;
        compared += 1;
        if (va === vb) same += 1;
      }
      const minFilled = Math.min(filledA, filledB);
      if (compared >= 5 && same / compared >= 0.9 && minFilled >= Math.max(5, rows.length * 0.2)) {
        dupes.push({ primary: a, duplicate: b });
      }
    }
  }
  return dupes;
}
