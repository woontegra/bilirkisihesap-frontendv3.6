import { normalizeText } from "../utils";
import { mergeTextParts as mergeTextPartsCore } from "./mergeText";
import type { LogicalColumnGroup } from "./types";

export function columnLetter(index: number): string {
  let n = index;
  let s = "";
  while (n >= 0) {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  }
  return s;
}

export function formatColumnRange(indices: number[]): string {
  if (indices.length === 0) return "";
  if (indices.length === 1) return columnLetter(indices[0]);
  return `${columnLetter(indices[0])}:${columnLetter(indices[indices.length - 1])}`;
}

const TEXT_IDENTITY_HEADERS = new Set([
  "adi soyadi",
  "ad soyad",
  "personel",
  "birim",
  "bolum",
  "departman",
  "pozisyon",
  "gorev",
  "unvan",
]);

function isTextIdentityHeader(header: string): boolean {
  const norm = normalizeText(header);
  if (!norm) return false;
  for (const key of TEXT_IDENTITY_HEADERS) {
    if (norm.includes(key) || key.includes(norm)) return true;
  }
  return false;
}

/**
 * Boş başlıklı devam sütunlarını bir sonraki gerçek başlığa kadar gruplar.
 */
export function groupLogicalColumns(headerRow: string[], segmentIndex: number): LogicalColumnGroup[] {
  const groups: LogicalColumnGroup[] = [];
  let i = 0;
  let groupIndex = 0;

  while (i < headerRow.length) {
    const header = (headerRow[i] ?? "").toString().trim();
    const indices: number[] = [i];
    let j = i + 1;
    while (j < headerRow.length) {
      const nextHeader = (headerRow[j] ?? "").toString().trim();
      if (nextHeader) break;
      indices.push(j);
      j += 1;
    }
    const headerText = header || `Sütun ${i + 1}`;
    groups.push({
      index: groupIndex,
      physicalIndices: indices,
      headerText,
      segmentIndex,
      isTextIdentity: isTextIdentityHeader(headerText),
    });
    groupIndex += 1;
    i = j > i ? j : i + 1;
  }

  return groups;
}

/** @deprecated mergeText.ts kullanın */
export { mergeSplitWords, mergeTextParts } from "./mergeText";

export function mergeTextPartsValue(parts: string[], isTextIdentity: boolean): string {
  return mergeTextPartsCore(parts, isTextIdentity).value;
}

export function readLogicalCell(row: string[], group: LogicalColumnGroup): string {
  const parts = group.physicalIndices
    .map((ci) => (row[ci] ?? "").toString().trim())
    .filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0];
  if (!group.isTextIdentity) {
    return parts.join(" ").replace(/\s+/g, " ").trim();
  }
  return mergeTextPartsCore(parts, true).value;
}
