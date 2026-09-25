import { classifyColumns, resolveAmbiguousClassifications } from "./classifyColumns";
import { applyContinuityBonus } from "./confidenceScore";
import { detectHeaderRow } from "./detectHeaderRows";
import { detectSegments, findDuplicateColumns, type DetectedSegment } from "./detectSegments";
import { formatColumnRange, groupLogicalColumns, readLogicalCell } from "./groupLogicalColumns";
import type {
  CanonicalAttendanceRow,
  LayoutSegment,
  LogicalColumnGroup,
  SmartFieldRole,
  SmartImportAnalysis,
  SmartImportProposal,
} from "./types";
import { ROLE_LABELS, ROLE_TO_MAPPABLE } from "./types";
import { fieldLabel } from "../fieldCatalog";
import { normalizeSegmentRows } from "./normalizeRows";
import { buildWorkbookFingerprint } from "./workbookFingerprint";

function collectSamples(
  grid: string[][],
  segment: DetectedSegment,
  group: LogicalColumnGroup,
  limit = 12,
): string[] {
  const out: string[] = [];
  for (let r = segment.startRow; r <= segment.endRow && out.length < limit; r++) {
    const val = readLogicalCell(grid[r] ?? [], group);
    if (val) out.push(val);
  }
  return out;
}

function buildProposals(
  segments: LayoutSegment[],
  samplesByGroup: Map<string, string>,
): SmartImportProposal[] {
  const proposals: SmartImportProposal[] = [];
  for (const seg of segments) {
    for (const g of seg.logicalColumns) {
      const cls = seg.classifications[g.index];
      if (!cls || cls.duplicateOf != null) continue;
      const mappable = ROLE_TO_MAPPABLE[cls.role] ?? null;
      proposals.push({
        logicalColumnIndex: g.index,
        sampleValue: samplesByGroup.get(`${seg.index}:${g.index}`) ?? "",
        targetField: mappable,
        targetLabel: mappable ? fieldLabel(mappable) : ROLE_LABELS[cls.role],
        physicalColumns: formatColumnRange(g.physicalIndices),
        segmentIndex: seg.index,
        confidence: cls.confidence,
        tier: cls.tier,
        reasons: cls.reasons,
        headerText: g.headerText,
      });
    }
  }
  return proposals;
}

export type AnalyzeWorkbookInput = {
  grid: string[][];
  sheetName: string;
};

export function analyzeWorkbook(input: AnalyzeWorkbookInput): SmartImportAnalysis {
  const { grid, sheetName } = input;
  if (!grid || grid.length === 0) {
    return {
      ok: false,
      error: "Boş sayfa",
      headerRowIndex: 0,
      segmentCount: 0,
      dataRowCount: 0,
      proposals: [],
      canonicalRows: [],
      segments: [],
      stats: { autoMatched: 0, needsReview: 0, lowConfidence: 0 },
      fingerprint: "",
      duplicateColumns: [],
    };
  }

  const headerDetection = detectHeaderRow(grid);
  const headerRowIndex = headerDetection.headerRowIndex;
  const headerRow = grid[headerRowIndex] ?? [];
  const baseGroups = groupLogicalColumns(headerRow, 0);
  const detectedSegments = detectSegments(grid, headerRowIndex, baseGroups);

  const layoutSegments: LayoutSegment[] = [];
  const allRows: CanonicalAttendanceRow[] = [];
  const duplicateColumns: SmartImportAnalysis["duplicateColumns"] = [];
  const samplesByGroup = new Map<string, string>();
  const segmentRoleSet = new Set<SmartFieldRole>();

  for (const seg of detectedSegments) {
    const dupes = findDuplicateColumns(grid, seg);
    for (const d of dupes) {
      duplicateColumns.push({ primary: d.primary, duplicate: d.duplicate, segmentIndex: seg.index });
    }

    const samplesMap = new Map<number, string[]>();
    for (const g of seg.groups) {
      const samples = collectSamples(grid, seg, g);
      samplesMap.set(g.index, samples);
      if (samples[0]) samplesByGroup.set(`${seg.index}:${g.index}`, samples[0]);
    }

    let classifications = classifyColumns(seg.groups, samplesMap);
    for (const d of dupes) {
      const primaryCls = classifications[d.primary];
      classifications[d.duplicate] = {
        ...classifications[d.duplicate],
        duplicateOf: d.primary,
        tier: "manual",
        confidence: Math.min(classifications[d.duplicate]?.confidence ?? 0, 40),
        reasons: [...(classifications[d.duplicate]?.reasons ?? []), "mükerrer sütun"],
      };
      if (primaryCls && classifications[d.duplicate].confidence < primaryCls.confidence) {
        classifications[d.duplicate].role = "unknown";
      }
    }

    classifications = resolveAmbiguousClassifications(classifications);
    classifications = applyContinuityBonus(classifications, segmentRoleSet);
    for (const c of classifications) {
      if (c.role !== "unknown") segmentRoleSet.add(c.role);
    }

    layoutSegments.push({
      index: seg.index,
      startRow: seg.startRow,
      endRow: seg.endRow,
      signature: seg.signature,
      logicalColumns: seg.groups,
      classifications,
    });

    allRows.push(...normalizeSegmentRows(grid, seg, classifications, sheetName));
  }

  const proposals = buildProposals(layoutSegments, samplesByGroup);
  const stats = {
    autoMatched: proposals.filter((p) => p.tier === "auto" && p.targetField).length,
    needsReview: proposals.filter((p) => p.tier === "review").length,
    lowConfidence: proposals.filter((p) => p.tier === "manual").length,
  };

  const partialAnalysis: SmartImportAnalysis = {
    ok: true,
    headerRowIndex,
    segmentCount: layoutSegments.length,
    dataRowCount: allRows.length,
    proposals,
    canonicalRows: allRows,
    segments: layoutSegments,
    stats,
    fingerprint: "",
    duplicateColumns,
  };
  const fp = buildWorkbookFingerprint(grid, partialAnalysis);

  return {
    ...partialAnalysis,
    fingerprint: fp.hash,
  };
}

export function analyzeDocumentSheets(
  sheets: { name: string; grid: string[][] }[],
): SmartImportAnalysis {
  const merged: CanonicalAttendanceRow[] = [];
  const allProposals: SmartImportProposal[] = [];
  const allSegments: LayoutSegment[] = [];
  const allDupes: SmartImportAnalysis["duplicateColumns"] = [];
  let headerRowIndex = 0;
  let segOffset = 0;

  for (const sheet of sheets) {
    const result = analyzeWorkbook({ grid: sheet.grid, sheetName: sheet.name });
    if (!result.ok) continue;
    headerRowIndex = result.headerRowIndex;
    merged.push(...result.canonicalRows);
    allProposals.push(...result.proposals);
    for (const s of result.segments) {
      allSegments.push({ ...s, index: s.index + segOffset });
    }
    segOffset += result.segments.length;
    allDupes.push(...result.duplicateColumns);
  }

  const stats = {
    autoMatched: allProposals.filter((p) => p.tier === "auto" && p.targetField).length,
    needsReview: allProposals.filter((p) => p.tier === "review").length,
    lowConfidence: allProposals.filter((p) => p.tier === "manual").length,
  };

  const firstSheet = sheets[0];
  const partial: SmartImportAnalysis = {
    ok: merged.length > 0,
    headerRowIndex,
    segmentCount: allSegments.length,
    dataRowCount: merged.length,
    proposals: allProposals,
    canonicalRows: merged,
    segments: allSegments,
    stats,
    fingerprint: "",
    duplicateColumns: allDupes,
  };
  const fp = firstSheet ? buildWorkbookFingerprint(firstSheet.grid, partial) : { hash: "" };
  return { ...partial, fingerprint: fp.hash };
}
