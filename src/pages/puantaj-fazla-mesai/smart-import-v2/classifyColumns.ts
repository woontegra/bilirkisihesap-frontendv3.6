import { normalizeText } from "../utils";
import { HEADER_SYNONYMS, type ColumnClassification, type LogicalColumnGroup, type SmartFieldRole } from "./types";

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
  if (/^\d{1,2}[:.,]\d{2}(?::\d{2})?$/.test(s)) return true;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 && n < 1;
}

function isShiftText(val: string): boolean {
  const raw = (val ?? "").toString().trim();
  if (!raw) return false;
  if (/^\*?off$/i.test(raw)) return true;
  if (/hafta\s*tatil/i.test(raw)) return true;
  if (/^\*?\d{1,2}[:.,]\d{2}\s*[-/]\s*\d{1,2}[:.,]\d{2}/i.test(raw)) return true;
  const norm = normalizeText(val);
  if (!norm) return false;
  if (norm === "off" || norm === "*off") return true;
  if (norm.includes("hafta tatili")) return true;
  return false;
}

function isLeaveText(val: string): boolean {
  const norm = normalizeText(val);
  if (!norm) return false;
  const keys = [
    "fazla mesai izni",
    "fm izni",
    "fazla calisma izni",
    "yillik izin",
    "rapor",
    "ucretsiz izin",
    "mazeret izni",
  ];
  return keys.some((k) => norm.includes(k));
}

function scoreHeaderForRole(header: string, role: SmartFieldRole): number {
  const norm = normalizeText(header);
  if (!norm) return 0;
  const synonyms = HEADER_SYNONYMS[role] ?? [];
  let best = 0;
  for (const syn of synonyms) {
    if (norm === syn) best = Math.max(best, 1);
    else if (norm.includes(syn) || syn.includes(norm)) best = Math.max(best, 0.75);
  }
  return best;
}

function scoreContentForRole(samples: string[], role: SmartFieldRole): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  if (samples.length === 0) return { score: 0, reasons };

  const nonEmpty = samples.filter((s) => (s ?? "").toString().trim());
  if (nonEmpty.length === 0) return { score: 0, reasons };

  if (role === "workDate") {
    const hits = nonEmpty.filter(isLikelyDate).length;
    const ratio = hits / nonEmpty.length;
    if (ratio > 0.6) reasons.push("tarih yoğunluğu");
    return { score: ratio, reasons };
  }

  if (role === "actualEntry" || role === "actualExit" || role === "plannedEntry" || role === "plannedExit") {
    const hits = nonEmpty.filter(isLikelyTime).length;
    const ratio = hits / nonEmpty.length;
    if (ratio > 0.5) reasons.push("saat biçimi");
    return { score: ratio, reasons };
  }

  if (role === "plannedShiftText") {
    const hits = nonEmpty.filter(isShiftText).length;
    const ratio = hits / nonEmpty.length;
    if (ratio > 0.3) reasons.push("vardiya/mesai metni");
    return { score: ratio, reasons };
  }

  if (role === "leaveText") {
    const hits = nonEmpty.filter(isLeaveText).length;
    const ratio = hits / nonEmpty.length;
    if (ratio > 0.2) reasons.push("izin açıklaması");
    return { score: ratio, reasons };
  }

  if (role === "employeeName" || role === "department" || role === "position") {
    const hits = nonEmpty.filter((s) => /[a-zA-ZğüşöçıİĞÜŞÖÇ]{2,}/.test(s)).length;
    const ratio = hits / nonEmpty.length;
    if (ratio > 0.7) reasons.push("metin kimlik alanı");
    return { score: ratio * 0.85, reasons };
  }

  return { score: 0, reasons };
}

export function classifyColumn(
  group: LogicalColumnGroup,
  samples: string[],
  neighborRoles: SmartFieldRole[],
): ColumnClassification {
  const roles: SmartFieldRole[] = [
    "employeeName",
    "department",
    "position",
    "workDate",
    "actualEntry",
    "actualExit",
    "plannedShiftText",
    "leaveText",
    "plannedEntry",
    "plannedExit",
    "employeeId",
    "breakMinutes",
  ];

  let bestRole: SmartFieldRole = "unknown";
  let bestScore = 0;
  let bestHeader = 0;
  let bestContent = 0;
  let bestNeighbor = 0;
  const reasons: string[] = [];

  for (const role of roles) {
    const headerScore = scoreHeaderForRole(group.headerText, role);
    const { score: contentScore, reasons: contentReasons } = scoreContentForRole(samples, role);
    let neighborScore = 0;
    if (role === "actualExit" && neighborRoles.includes("actualEntry")) neighborScore = 0.8;
    if (role === "actualEntry" && neighborRoles.includes("workDate")) neighborScore = 0.6;
    if (role === "leaveText" && neighborRoles.includes("plannedShiftText")) neighborScore = 0.5;

    const total = headerScore * 0.35 + contentScore * 0.4 + neighborScore * 0.15;
    if (total > bestScore) {
      bestScore = total;
      bestRole = role;
      bestHeader = headerScore;
      bestContent = contentScore;
      bestNeighbor = neighborScore;
      reasons.length = 0;
      if (headerScore > 0.5) reasons.push("başlık benzerliği");
      reasons.push(...contentReasons);
      if (neighborScore > 0.4) reasons.push("komşu alan ilişkisi");
    }
  }

  const confidence = Math.round(Math.min(100, bestScore * 100));
  let tier: ColumnClassification["tier"] = "manual";
  if (confidence >= 85) tier = "auto";
  else if (confidence >= 60) tier = "review";

  return {
    role: bestRole,
    confidence,
    tier,
    reasons: [...new Set(reasons)],
    headerScore: bestHeader,
    contentScore: bestContent,
    neighborScore: bestNeighbor,
    continuityScore: 0,
  };
}

export function classifyColumns(
  groups: LogicalColumnGroup[],
  samplesByGroup: Map<number, string[]>,
): ColumnClassification[] {
  const results: ColumnClassification[] = [];
  const assignedRoles: SmartFieldRole[] = [];

  for (const g of groups) {
    const samples = samplesByGroup.get(g.index) ?? [];
    const cls = classifyColumn(g, samples, assignedRoles);
    results.push(cls);
    if (cls.role !== "unknown") assignedRoles.push(cls.role);
  }

  return results;
}

export function resolveAmbiguousClassifications(classifications: ColumnClassification[]): ColumnClassification[] {
  const byRole = new Map<SmartFieldRole, number[]>();
  classifications.forEach((c, idx) => {
    if (c.role === "unknown") return;
    const list = byRole.get(c.role) ?? [];
    list.push(idx);
    byRole.set(c.role, list);
  });

  const next = classifications.map((c) => ({ ...c }));
  for (const [, indices] of byRole) {
    if (indices.length < 2) continue;
    const ranked = indices
      .map((i) => ({ i, confidence: next[i].confidence }))
      .sort((a, b) => b.confidence - a.confidence);
    const top = ranked[0];
    const second = ranked[1];
    if (top && second && top.confidence - second.confidence < 8) {
      for (const r of ranked) {
        next[r.i] = { ...next[r.i], tier: "manual", confidence: Math.min(next[r.i].confidence, 59) };
        next[r.i].reasons = [...next[r.i].reasons, "yakın aday skoru — otomatik karar verilmedi"];
      }
    }
  }
  return next;
}
