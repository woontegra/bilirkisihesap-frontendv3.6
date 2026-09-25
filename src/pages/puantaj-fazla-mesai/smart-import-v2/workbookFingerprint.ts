import { normalizeText } from "../utils";
import type { LayoutSegment, SmartFieldRole, SmartImportAnalysis } from "./types";
import { groupLogicalColumns } from "./groupLogicalColumns";

export type WorkbookFingerprintProfile = {
  headerRowIndex: number;
  normalizedHeaders: string[];
  logicalGroupSizes: number[];
  physicalColumnCount: number;
  segmentCount: number;
  segmentSignatures: string[];
  dateRatio: number;
  timeRatio: number;
  textRatio: number;
  shiftSamples: string[];
  leaveSamples: string[];
  duplicatePairs: { primary: number; duplicate: number; segmentIndex: number }[];
  roleByGroup: { segmentIndex: number; groupIndex: number; role: SmartFieldRole; confidence: number }[];
  hash: string;
};

function isDateLike(v: string): boolean {
  return /^\d{1,2}[./-]\d{1,2}[./-]\d{2,4}$/.test(v) || /^\d{4}-\d{2}-\d{2}/.test(v);
}

function isTimeLike(v: string): boolean {
  return /^\d{1,2}[:.,]\d{2}/.test(v);
}

function sampleProfile(grid: string[][], headerRowIndex: number) {
  let date = 0;
  let time = 0;
  let text = 0;
  let total = 0;
  const shiftSamples: string[] = [];
  const leaveSamples: string[] = [];

  for (let r = headerRowIndex + 1; r < Math.min(grid.length, headerRowIndex + 80); r++) {
    for (const cell of grid[r] ?? []) {
      const s = (cell ?? "").toString().trim();
      if (!s) continue;
      total += 1;
      if (isDateLike(s)) date += 1;
      else if (isTimeLike(s)) time += 1;
      else text += 1;
      const norm = normalizeText(s);
      if (norm.includes("off") || norm.includes("hafta tatili") || /\d{1,2}[:.]\d{2}/.test(norm)) {
        if (shiftSamples.length < 6) shiftSamples.push(s);
      }
      if (norm.includes("izin") || norm.includes("rapor")) {
        if (leaveSamples.length < 6) leaveSamples.push(s);
      }
    }
  }

  const denom = Math.max(1, total);
  return {
    dateRatio: date / denom,
    timeRatio: time / denom,
    textRatio: text / denom,
    shiftSamples,
    leaveSamples,
  };
}

function hashParts(parts: string[]): string {
  let h = 0;
  const s = parts.join("|");
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h.toString(16);
}

export function buildWorkbookFingerprint(
  grid: string[][],
  analysis: SmartImportAnalysis,
): WorkbookFingerprintProfile {
  const headerRow = grid[analysis.headerRowIndex] ?? [];
  const normalizedHeaders = headerRow.map((h) => normalizeText(h));
  const groups = groupLogicalColumns(headerRow, 0);
  const profile = sampleProfile(grid, analysis.headerRowIndex);

  const roleByGroup: WorkbookFingerprintProfile["roleByGroup"] = [];
  for (const seg of analysis.segments) {
    for (const g of seg.logicalColumns) {
      const cls = seg.classifications[g.index];
      if (!cls) continue;
      roleByGroup.push({
        segmentIndex: seg.index,
        groupIndex: g.index,
        role: cls.role,
        confidence: cls.confidence,
      });
    }
  }

  const hash = hashParts([
    String(analysis.headerRowIndex),
    normalizedHeaders.join(","),
    groups.map((g) => g.physicalIndices.length).join("."),
    String(analysis.segmentCount),
    analysis.segments.map((s) => s.signature).join(";"),
    profile.dateRatio.toFixed(2),
    profile.timeRatio.toFixed(2),
    roleByGroup.map((r) => `${r.role}:${r.confidence}`).join(","),
  ]);

  return {
    headerRowIndex: analysis.headerRowIndex,
    normalizedHeaders,
    logicalGroupSizes: groups.map((g) => g.physicalIndices.length),
    physicalColumnCount: headerRow.length,
    segmentCount: analysis.segmentCount,
    segmentSignatures: analysis.segments.map((s) => s.signature),
    dateRatio: profile.dateRatio,
    timeRatio: profile.timeRatio,
    textRatio: profile.textRatio,
    shiftSamples: profile.shiftSamples,
    leaveSamples: profile.leaveSamples,
    duplicatePairs: analysis.duplicateColumns,
    roleByGroup,
    hash,
  };
}

export function fingerprintSimilarity(a: WorkbookFingerprintProfile, b: WorkbookFingerprintProfile): number {
  let score = 0;
  if (a.headerRowIndex === b.headerRowIndex) score += 10;
  if (a.physicalColumnCount === b.physicalColumnCount) score += 10;
  if (a.segmentCount === b.segmentCount) score += 15;

  const headerA = new Set(a.normalizedHeaders.filter(Boolean));
  const headerB = new Set(b.normalizedHeaders.filter(Boolean));
  let inter = 0;
  for (const h of headerA) if (headerB.has(h)) inter += 1;
  const union = new Set([...headerA, ...headerB]).size || 1;
  score += (inter / union) * 35;

  score += (1 - Math.min(1, Math.abs(a.dateRatio - b.dateRatio))) * 10;
  score += (1 - Math.min(1, Math.abs(a.timeRatio - b.timeRatio))) * 10;

  if (a.hash === b.hash) score += 10;
  return Math.round(Math.min(100, score));
}

export function segmentsMatchFingerprint(a: LayoutSegment[], b: LayoutSegment[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].signature !== b[i].signature) return false;
  }
  return true;
}
