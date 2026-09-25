/**
 * PDF tablo düzeni — başlık satırına dayalı sütun sınırı algoritması.
 * Saf fonksiyonlar; pdfjs'e bağımlı değil; birim testlerinde kullanılır.
 *
 * Kök neden (eski davranış): tüm satırların başlangıç-x değerleri kümelenerek
 * sütun üretiliyordu. Ortalanmış başlıklar ile sola yaslanmış veriler farklı
 * x kümeleri oluşturduğu için sahte "Sütun N" sütunları çıkıyordu.
 *
 * Yeni kural: sütun şeması YALNIZCA seçilen başlık satırındaki hücrelerden
 * türetilir. Veri satırlarındaki x değerleri yeni sütun açmaz; her metin,
 * kutu merkezinin düştüğü başlık-arası sınıra yerleştirilir.
 */

import { normalizeText } from "./utils";

export type GeomCell = {
  x: number;
  endX: number;
  text: string;
};

export type GeomLine = {
  y: number;
  /** 1-tabanlı sayfa numarası (çok sayfalı belgelerde). */
  page: number;
  cells: GeomCell[];
};

export type ColumnBound = {
  /** Sütunun sol sınırı (ilk sütunda -Infinity). */
  left: number;
  /** Sütunun sağ sınırı (son sütunda +Infinity); yarım-açık [left, right). */
  right: number;
  /** Başlık metni (boşsa "Sütun N"). */
  header: string;
  center: number;
};

export function cellCenter(cell: GeomCell): number {
  const w = Math.max(0, cell.endX - cell.x);
  return cell.x + w / 2;
}

/**
 * Seçilen başlık satırındaki hücrelerden sütun sınırlarını üretir.
 * Komşu başlık merkezlerinin orta noktaları sınır olur.
 */
export function buildColumnBoundsFromHeader(headerCells: GeomCell[]): ColumnBound[] {
  const sorted = [...headerCells]
    .map((c) => ({ ...c, text: (c.text ?? "").replace(/\s+/g, " ").trim() }))
    .filter((c) => c.text !== "" || c.endX > c.x)
    .sort((a, b) => a.x - b.x || cellCenter(a) - cellCenter(b));

  if (sorted.length === 0) return [];

  // Aynı hücreye ait parçalanmış başlık metinlerini birleştir (merkez yakınlığı).
  const merged: GeomCell[] = [];
  for (const cell of sorted) {
    const prev = merged[merged.length - 1];
    if (prev && Math.abs(cellCenter(cell) - cellCenter(prev)) < 8) {
      prev.text = `${prev.text} ${cell.text}`.replace(/\s+/g, " ").trim();
      prev.x = Math.min(prev.x, cell.x);
      prev.endX = Math.max(prev.endX, cell.endX);
    } else {
      merged.push({ ...cell });
    }
  }

  const centers = merged.map(cellCenter);
  return merged.map((cell, i) => {
    const left = i === 0 ? Number.NEGATIVE_INFINITY : (centers[i - 1] + centers[i]) / 2;
    const right =
      i === merged.length - 1 ? Number.POSITIVE_INFINITY : (centers[i] + centers[i + 1]) / 2;
    const header = cell.text.trim() || `Sütun ${i + 1}`;
    return { left, right, header, center: centers[i] };
  });
}

/** Metin kutusu merkezinin düştüğü sütun indeksi. */
export function assignCellToColumn(cell: GeomCell, bounds: ColumnBound[]): number {
  if (bounds.length === 0) return 0;
  const c = cellCenter(cell);
  for (let i = 0; i < bounds.length; i++) {
    if (c >= bounds[i].left && c < bounds[i].right) return i;
  }
  // Son sütun +Infinity ile yakalanmalı; yine de en yakın merkeze düş.
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < bounds.length; i++) {
    const d = Math.abs(c - bounds[i].center);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return best;
}

/** Bir satırdaki hücreleri sütun sınırlarına yerleştirir; aynı hücreye düşenleri boşlukla birleştirir. */
export function lineToRow(line: GeomLine, bounds: ColumnBound[]): string[] {
  const row = bounds.map(() => "");
  const ordered = [...line.cells].sort((a, b) => a.x - b.x);
  for (const cell of ordered) {
    const text = (cell.text ?? "").replace(/\s+/g, " ").trim();
    if (!text) continue;
    const idx = assignCellToColumn(cell, bounds);
    row[idx] = row[idx] ? `${row[idx]} ${text}` : text;
  }
  return row;
}

/** Tekrar eden başlık satırı mı? (çok sayfalı PDF'lerde). */
export function isRepeatedHeaderRow(row: string[], headers: string[]): boolean {
  const hNorm = headers.map((h) => normalizeText(h)).filter(Boolean);
  if (hNorm.length === 0) return false;
  const rNorm = row.map((c) => normalizeText(c));
  let matches = 0;
  for (let i = 0; i < hNorm.length; i++) {
    if (rNorm[i] && rNorm[i] === hNorm[i]) matches += 1;
  }
  // En az 3 başlık veya başlıkların %60'ı birebir aynıysa tekrar kabul et.
  const need = Math.max(3, Math.ceil(hNorm.length * 0.6));
  return matches >= need;
}

export type GeometryTableResult = {
  headers: string[];
  /** Başlık satırı + veri satırları (önizleme grid'i). */
  grid: string[][];
  /** Yalnızca veri satırları. */
  rows: string[][];
  headerRowIndex: number;
};

/**
 * Geometri satırlarından, seçilen başlık indeksine göre hizalı tablo üretir.
 * Başlıktan önceki satırlar (firma adı vb.) grid'e tek hücreli / sınırlara
 * yerleştirilmiş olarak girer ama veri satırı sayılmaz.
 */
export function buildTableFromGeometry(
  lines: GeomLine[],
  headerRowIndex: number,
): GeometryTableResult {
  if (lines.length === 0) {
    return { headers: [], grid: [], rows: [], headerRowIndex: 0 };
  }

  const hi = Math.max(0, Math.min(headerRowIndex, lines.length - 1));
  const headerLine = lines[hi];
  const bounds = buildColumnBoundsFromHeader(headerLine.cells);
  if (bounds.length === 0) {
    return { headers: [], grid: [], rows: [], headerRowIndex: hi };
  }

  const headers = bounds.map((b) => b.header);
  const headerRow = lineToRow(headerLine, bounds);
  // Başlık metinlerini sınırlardan gelen etiketlerle sabitle (parça birleşimi sonrası).
  for (let i = 0; i < headers.length; i++) {
    if (!headerRow[i]?.trim()) headerRow[i] = headers[i];
    else headers[i] = headerRow[i];
  }

  const grid: string[][] = [];
  const rows: string[][] = [];

  for (let i = 0; i < lines.length; i++) {
    const row = lineToRow(lines[i], bounds);
    if (i === hi) {
      // Grid indeksi ≡ geometri satır indeksi (başlık seçici için).
      grid.push(headerRow);
      continue;
    }
    grid.push(row);
    if (i > hi) {
      if (row.every((c) => !c.trim())) continue;
      if (isRepeatedHeaderRow(row, headers)) continue;
      rows.push(row);
    }
  }

  return { headers, grid, rows, headerRowIndex: hi };
}

/**
 * Başlık satırı tahmini: en çok "başlık benzeri" metin içeren satır.
 * (Tarih/saat yoğun satırlar düşük skor alır.)
 */
export function guessGeometryHeaderIndex(lines: GeomLine[]): number {
  const limit = Math.min(lines.length, 15);
  let bestIdx = 0;
  let bestScore = -1;
  for (let i = 0; i < limit; i++) {
    const cells = lines[i]?.cells ?? [];
    let score = 0;
    for (const c of cells) {
      const t = (c.text ?? "").trim();
      if (!t) continue;
      if (/[a-zA-ZğüşöçıİĞÜŞÖÇ]/.test(t)) score += 2;
      if (/^\d{1,2}[./-]\d{1,2}/.test(t) || /^\d{1,2}:\d{2}/.test(t)) score -= 1;
      score += 0.5;
    }
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }
  return bestIdx;
}
