import { normalizeText } from "../utils";
import { HEADER_SYNONYMS, type SmartFieldRole } from "./types";

export type HeaderDetectionResult = {
  headerRowIndex: number;
  scores: { rowIndex: number; score: number; reasons: string[] }[];
};

function scoreHeaderSynonyms(row: string[]): { score: number; matches: number } {
  let score = 0;
  let matches = 0;
  for (const cell of row) {
    const norm = normalizeText(cell);
    if (!norm) continue;
    for (const [role, synonyms] of Object.entries(HEADER_SYNONYMS) as [SmartFieldRole, string[]][]) {
      if (role === "unknown") continue;
      for (const syn of synonyms) {
        if (norm === syn || norm.includes(syn) || syn.includes(norm)) {
          score += norm === syn ? 8 : 5;
          matches += 1;
          break;
        }
      }
    }
  }
  return { score, matches };
}

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

function scoreDataRowLikelihood(row: string[]): number {
  let filled = 0;
  let dates = 0;
  let times = 0;
  for (const cell of row) {
    const s = (cell ?? "").toString().trim();
    if (!s) continue;
    filled += 1;
    if (isLikelyDate(s)) dates += 1;
    if (isLikelyTime(s)) times += 1;
  }
  if (filled === 0) return 0;
  return dates * 4 + times * 3 + (filled > 3 ? 2 : 0);
}

function scoreContinuationHeaders(row: string[], prevRow: string[] | null): number {
  if (!prevRow) return 0;
  let bonus = 0;
  for (let i = 0; i < row.length; i++) {
    const h = (row[i] ?? "").toString().trim();
    const p = (prevRow[i] ?? "").toString().trim();
    if (!h && p) bonus += 0.5;
  }
  return bonus;
}

/**
 * Başlık satırını çoklu sinyalle puanlar; tek hücre veya ilk dolu satır kuralına düşmez.
 */
export function detectHeaderRow(grid: string[][], maxScan = 20): HeaderDetectionResult {
  const limit = Math.min(grid.length, maxScan);
  const scores: HeaderDetectionResult["scores"] = [];

  for (let i = 0; i < limit; i++) {
    const row = grid[i] ?? [];
    const reasons: string[] = [];
    let score = 0;

    const { score: synScore, matches } = scoreHeaderSynonyms(row);
    score += synScore;
    if (matches > 0) reasons.push(`${matches} başlık eşanlamı`);

    const meaningful = row.filter((c) => normalizeText(c).length >= 2).length;
    score += meaningful * 2;
    if (meaningful >= 3) reasons.push(`${meaningful} anlamlı başlık`);

    score += scoreContinuationHeaders(row, i > 0 ? grid[i - 1] : null);

    let belowData = 0;
    let belowSamples = 0;
    for (let r = i + 1; r < Math.min(i + 6, grid.length); r++) {
      belowData += scoreDataRowLikelihood(grid[r] ?? []);
      belowSamples += 1;
    }
    if (belowSamples > 0) {
      const avg = belowData / belowSamples;
      score += avg * 1.2;
      if (avg > 4) reasons.push("alt satırlarda veri tipi uyumu");
    }

    const dataPenalty = scoreDataRowLikelihood(row);
    if (dataPenalty > 8) {
      score -= dataPenalty * 0.6;
      reasons.push("veri satırı olma ihtimali (−)");
    }

    const emptyHeaders = row.filter((c, idx) => {
      const h = (c ?? "").toString().trim();
      if (h) return false;
      return row.slice(idx + 1).some((x) => (x ?? "").toString().trim() !== "");
    }).length;
    if (emptyHeaders > 0) {
      score += emptyHeaders * 0.8;
      reasons.push("boş başlıklı devam sütunları");
    }

    scores.push({ rowIndex: i, score, reasons });
  }

  let bestIdx = 0;
  let bestScore = -Infinity;
  for (const s of scores) {
    if (s.score > bestScore) {
      bestScore = s.score;
      bestIdx = s.rowIndex;
    }
  }

  return { headerRowIndex: bestIdx, scores };
}
