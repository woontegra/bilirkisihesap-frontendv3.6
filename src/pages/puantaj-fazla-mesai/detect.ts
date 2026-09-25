import { fieldLabel, MAPPABLE_FIELDS } from "./fieldCatalog";
import type { ColumnMapping, MappableFieldKey, ParsedSheet, TableView } from "./model";
import { buildTableFromGeometry, type GeomLine } from "./pdfLayout";
import { detectHeaderRow } from "./smart-import-v2/detectHeaderRows";
import { formatColumnRange, groupLogicalColumns } from "./smart-import-v2/groupLogicalColumns";
import type { LogicalColumnGroup } from "./smart-import-v2/types";
import { normalizeText } from "./utils";

/** "Sütun N" yer tutucularını ve yinelenen birleşik başlıkları mantıksal devam say. */
export function headersForGrouping(headers: string[]): string[] {
  const out: string[] = [];
  let prevNamed = "";
  for (const raw of headers) {
    const h = raw.trim();
    if (/^Sütun \d+$/.test(h)) {
      out.push("");
      continue;
    }
    if (h && h === prevNamed) {
      out.push("");
      continue;
    }
    out.push(h);
    if (h) prevNamed = h;
  }
  return out;
}

export function logicalGroupsFromHeaders(headers: string[]): LogicalColumnGroup[] {
  return groupLogicalColumns(headersForGrouping(headers), 0);
}

/**
 * Otomatik başlık satırı tespiti ve sütun → standart alan tahmini.
 * Tahminler yalnızca öneridir; kullanıcı onayı olmadan hesaplamaya geçilmez.
 *
 * PDF'de sütun şeması seçilen başlık satırının geometrisinden üretilir;
 * veri satırlarının x koordinatları yeni sütun açmaz.
 */

/** Başlık satırını çoklu sinyalle puanlar (eşanlam, veri satırı cezası, birleşik hücre). */
export function guessHeaderRowIndex(grid: string[][]): number {
  if (!grid.length) return 0;
  return detectHeaderRow(grid).headerRowIndex;
}

/**
 * Başlık satırından sütun sayısını türetir.
 * Birleştirilmiş başlıklardaki boş devam hücreleri boş bırakılır (mantıksal gruplama için).
 */
export function headersFromRow(headerRow: string[]): string[] {
  const raw = (headerRow ?? []).map((c) => (c ?? "").toString().trim());
  let end = raw.length;
  while (end > 0 && raw[end - 1] === "") end -= 1;
  const sliced = raw.slice(0, end);
  return sliced.map((h, i) => h || `Sütun ${i + 1}`);
}

/** ParsedSheet + başlık satırından normalize edilmiş TableView üretir. */
export function toTableView(sheet: ParsedSheet, headerRowIndex: number, pageNumber: number): TableView {
  if (sheet.geometry && sheet.geometry.length > 0) {
    const built = buildTableFromGeometry(sheet.geometry as GeomLine[], headerRowIndex);
    return {
      headers: built.headers,
      rows: built.rows,
      headerRowIndex: built.headerRowIndex,
      sheetName: sheet.name,
      pageNumber,
    };
  }

  const grid = sheet.grid;
  const headerRow = grid[headerRowIndex] ?? [];
  const headers = headersFromRow(headerRow);
  const colCount = Math.max(
    headers.length,
    ...grid.slice(headerRowIndex + 1, headerRowIndex + 20).map((r) => r?.length ?? 0),
  );

  const rows: string[][] = [];
  for (let r = headerRowIndex + 1; r < grid.length; r++) {
    const src = grid[r] ?? [];
    const normalized: string[] = [];
    for (let c = 0; c < colCount; c++) normalized.push((src[c] ?? "").toString().trim());
    if (isDuplicateHeader(normalized, headers)) continue;
    if (normalized.every((c) => c === "")) continue;
    rows.push(normalized);
  }

  return { headers, rows, headerRowIndex, sheetName: sheet.name, pageNumber };
}

function isDuplicateHeader(row: string[], headers: string[]): boolean {
  const hNorm = headers.map((h) => normalizeText(h)).filter(Boolean);
  if (hNorm.length < 3) return false;
  let matches = 0;
  for (let i = 0; i < hNorm.length; i++) {
    if (normalizeText(row[i] ?? "") === hNorm[i]) matches += 1;
  }
  return matches >= Math.max(3, Math.ceil(hNorm.length * 0.6));
}

type Candidate = { field: MappableFieldKey; score: number };

/**
 * Başlık skorlaması — daha uzun anahtar kelime eşleşmesine öncelik verir.
 */
export function scoreHeaderForMapping(header: string): Candidate | null {
  const norm = normalizeText(header);
  if (!norm) return null;

  if (norm === "mesai aciklama" || norm.includes("mesai aciklama")) {
    return { field: "esasCalismaSaatAraligi", score: 1.1 };
  }
  if (norm === "izin aciklama" || norm.includes("izin aciklama")) {
    return { field: "izinTatilKodu", score: 1.1 };
  }
  if (norm === "esas calisma saat araligi" || norm.includes("saat araligi")) {
    return { field: "esasCalismaSaatAraligi", score: 1.05 };
  }
  if (norm.includes("kart") && (norm.includes("aralik") || norm.includes("giris cikis"))) {
    return { field: "kartSaatAraligi", score: 1.05 };
  }

  let best: Candidate | null = null;
  for (const field of MAPPABLE_FIELDS) {
    for (const kw of field.keywords) {
      const nkw = normalizeText(kw);
      if (!nkw) continue;
      let score = 0;
      if (norm === nkw) score = 1;
      else if (norm.startsWith(nkw) || norm.endsWith(nkw)) score = 0.85;
      else if (norm.includes(nkw)) score = 0.7;
      else if (nkw.includes(norm) && norm.length >= 3) score = 0.55;
      if (score > 0) {
        score += Math.min(0.08, nkw.length * 0.004);
      }
      if (score > 0 && (!best || score > best.score)) {
        best = { field: field.key as MappableFieldKey, score };
      }
    }
  }
  return best;
}

/**
 * Mantıksal sütun başına tek eşleştirme satırı üretir (birleştirilmiş başlıklar tekrarlanmaz).
 */
export function autoDetectMappings(headers: string[]): ColumnMapping[] {
  const groups = logicalGroupsFromHeaders(headers);
  const groupCandidates = groups.map((g) => ({
    group: g,
    cand: scoreHeaderForMapping(g.headerText.startsWith("Sütun") ? "" : g.headerText),
  }));

  const bestByField = new Map<MappableFieldKey, { colIndex: number; score: number }>();
  for (const { group, cand } of groupCandidates) {
    if (!cand) continue;
    const colIndex = group.physicalIndices[0];
    const existing = bestByField.get(cand.field);
    if (!existing || cand.score > existing.score) {
      bestByField.set(cand.field, { colIndex, score: cand.score });
    }
  }

  return groups.map((group, logicalIndex) => {
    const columnIndex = group.physicalIndices[0];
    const displayHeader = group.headerText.startsWith("Sütun") ? headers[columnIndex] ?? group.headerText : group.headerText;
    const cand = groupCandidates.find((gc) => gc.group.index === group.index)?.cand;
    const colRange = group.physicalIndices.length > 1 ? formatColumnRange(group.physicalIndices) : null;

    if (cand && bestByField.get(cand.field)?.colIndex === columnIndex) {
      return {
        columnIndex,
        logicalIndex,
        physicalIndices: [...group.physicalIndices],
        header: colRange ? `${displayHeader} (${colRange})` : displayHeader,
        mode: "field",
        field: cand.field,
        autoGuessed: true,
        confidence: cand.score,
      } satisfies ColumnMapping;
    }

    return {
      columnIndex,
      logicalIndex,
      physicalIndices: [...group.physicalIndices],
      header: colRange ? `${displayHeader} (${colRange})` : displayHeader,
      mode: "review",
      autoGuessed: false,
      confidence: cand?.score ?? 0,
    } satisfies ColumnMapping;
  });
}

/** Kayıtlı şablon eşlemelerini mantıksal sütun yapısına uyarlar. */
export function applyTemplateToLogicalMappings(
  logical: ColumnMapping[],
  saved: ColumnMapping[],
): ColumnMapping[] {
  return logical.map((lm) => {
    const hit =
      saved.find((m) => m.mode === "field" && m.field && m.field === lm.field) ??
      saved.find((m) => m.columnIndex === lm.columnIndex) ??
      saved.find((m) => normalizeText(m.header) === normalizeText(lm.header.split(" (")[0] ?? lm.header));
    if (!hit) return lm;
    return {
      ...lm,
      mode: hit.mode,
      field: hit.field,
      constantValue: hit.constantValue,
      deriveFromColumn: hit.deriveFromColumn,
      deriveRule: hit.deriveRule,
      autoGuessed: false,
    };
  });
}

export type MappingCoverageResult = {
  sufficient: boolean;
  missingLabels: string[];
};

/** Klasik eşleştirmede hesaplama için asgari alan kapsamını kontrol eder. */
export function validateMappingCoverage(mappings: ColumnMapping[]): MappingCoverageResult {
  const mapped = new Set(
    mappings.filter((m) => m.mode === "field" && m.field).map((m) => m.field as MappableFieldKey),
  );
  const missingLabels: string[] = [];

  if (!mapped.has("tarih")) missingLabels.push(fieldLabel("tarih"));

  const hasKartPair = mapped.has("kartGiris") && mapped.has("kartCikis");
  const hasKartRange = mapped.has("kartSaatAraligi");
  const hasEsasRange = mapped.has("esasCalismaSaatAraligi");
  const hasEsasPair = mapped.has("esasCalismaGiris") && mapped.has("esasCalismaCikis");

  if (!hasKartPair && !hasKartRange && !hasEsasRange && !hasEsasPair) {
    missingLabels.push("Kart Giriş + Kart Çıkış (veya saat aralığı sütunu)");
  }

  return { sufficient: missingLabels.length === 0, missingLabels };
}
