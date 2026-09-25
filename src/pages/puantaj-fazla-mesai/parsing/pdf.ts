import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import type { ParsedDocument, ParsedGeomLine } from "../model";
import {
  buildTableFromGeometry,
  guessGeometryHeaderIndex,
  type GeomCell,
  type GeomLine,
} from "../pdfLayout";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const Y_TOLERANCE = 3.2;
const CELL_MERGE_GAP = 6;

/**
 * Dijital PDF ayrıştırma — pdfjs metin katmanından geometri çıkarır.
 * Sütun şeması burada KİLİTLENMEZ; kullanıcı başlık satırını seçtikten sonra
 * `pdfLayout.buildTableFromGeometry` ile başlık merkezlerinden sınırlar üretilir.
 *
 * Taranmış (metin katmanı olmayan) sayfalarda uyarı bırakır; OCR zorunlu değil.
 * Tamamen tarayıcı içinde çalışır.
 */
export async function parsePdf(file: File): Promise<ParsedDocument> {
  const buffer = await file.arrayBuffer();
  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
  const warnings: string[] = [];
  let emptyPages = 0;

  const allLines: GeomLine[] = [];
  const pageVerticalGuides: number[][] = [];

  for (let pageNo = 1; pageNo <= doc.numPages; pageNo++) {
    const page = await doc.getPage(pageNo);
    const content = await page.getTextContent();
    const items = content.items as Array<{ str: string; transform: number[]; width: number }>;

    const lines = buildLines(items, pageNo);
    if (lines.length === 0) {
      emptyPages += 1;
    } else {
      allLines.push(...lines);
    }

    // İsteğe bağlı: dikey çizgi kılavuzları (doğrulama; zorunlu değil).
    try {
      const guides = await extractVerticalGuides(page);
      if (guides.length > 0) pageVerticalGuides.push(guides);
    } catch {
      // Çizgi okuma başarısızsa yok say — yalnız metin merkezleri kullanılır.
    }
  }

  if (emptyPages > 0) {
    warnings.push(
      `${emptyPages} sayfada metin katmanı bulunamadı. Taranmış/foto PDF olabilir; ` +
        "bu sayfalar güvenilir otomatik kaynak kabul edilmez (OCR gerekir).",
    );
  }

  if (allLines.length === 0) {
    return {
      fileName: file.name,
      kind: "pdf",
      sheets: [{ name: "Puantaj", grid: [], geometry: [] }],
      warnings: warnings.length
        ? warnings
        : ["PDF'de okunabilir metin katmanı bulunamadı."],
    };
  }

  // Çizgi kılavuzları varsa hücre uçlarını hafifçe hizala (sütun üretmez).
  const guides = mergeGuides(pageVerticalGuides);
  const geometry: ParsedGeomLine[] = guides.length
    ? snapLinesToGuides(allLines, guides)
    : allLines;

  const headerGuess = guessGeometryHeaderIndex(geometry);
  const built = buildTableFromGeometry(geometry, headerGuess);

  return {
    fileName: file.name,
    kind: "pdf",
    sheets: [
      {
        name: doc.numPages > 1 ? `Puantaj (${doc.numPages} sayfa)` : "Puantaj",
        grid: built.grid,
        geometry,
      },
    ],
    warnings,
  };
}

function buildLines(
  items: Array<{ str: string; transform: number[]; width: number }>,
  page: number,
): GeomLine[] {
  const lines: GeomLine[] = [];
  for (const it of items) {
    const text = (it.str ?? "").replace(/\s+/g, " ");
    if (!text.trim()) continue;
    const x = it.transform[4];
    const y = it.transform[5];
    const endX = x + (it.width ?? 0);

    let line = lines.find((l) => Math.abs(l.y - y) < Y_TOLERANCE);
    if (!line) {
      line = { y, page, cells: [] };
      lines.push(line);
    }
    line.cells.push({ x, endX, text });
  }

  // Yukarıdan aşağıya (PDF'te y büyükten küçüğe).
  lines.sort((a, b) => b.y - a.y);

  for (const line of lines) {
    line.cells.sort((a, b) => a.x - b.x);
    const merged: GeomCell[] = [];
    for (const cell of line.cells) {
      const prev = merged[merged.length - 1];
      if (prev && cell.x - prev.endX < CELL_MERGE_GAP) {
        prev.text = `${prev.text} ${cell.text}`.replace(/\s+/g, " ").trim();
        prev.endX = Math.max(prev.endX, cell.endX);
      } else {
        merged.push({ ...cell });
      }
    }
    line.cells = merged;
  }

  return lines;
}

/** pdfjs operator listesinden yaklaşık dikey çizgi x konumları. */
async function extractVerticalGuides(page: {
  getOperatorList: () => Promise<{ fnArray: number[]; argsArray: unknown[] }>;
}): Promise<number[]> {
  const ops = await page.getOperatorList();
  // PDF.js OPS.constructPath / stroke — sürümler arası fark olabileceği için
  // argümanlardan [x1,y1,x2,y2] benzeri dikey segmentleri sezgisel tara.
  const xs: number[] = [];
  for (let i = 0; i < ops.fnArray.length; i++) {
    const args = ops.argsArray[i];
    if (!Array.isArray(args)) continue;
    collectVerticalFromArgs(args, xs);
  }
  xs.sort((a, b) => a - b);
  // Yakın çizgileri birleştir.
  const merged: number[] = [];
  for (const x of xs) {
    if (merged.length === 0 || x - merged[merged.length - 1] > 4) merged.push(x);
    else merged[merged.length - 1] = (merged[merged.length - 1] + x) / 2;
  }
  return merged;
}

function collectVerticalFromArgs(args: unknown[], out: number[]): void {
  // Düz sayı dizilerinde ardışık nokta çiftleri.
  const nums = args.filter((a): a is number => typeof a === "number");
  if (nums.length >= 4) {
    for (let i = 0; i + 3 < nums.length; i += 2) {
      const x1 = nums[i];
      const y1 = nums[i + 1];
      const x2 = nums[i + 2];
      const y2 = nums[i + 3];
      if (Math.abs(x1 - x2) < 1.5 && Math.abs(y1 - y2) > 8) {
        out.push((x1 + x2) / 2);
      }
    }
  }
  for (const a of args) {
    if (Array.isArray(a)) collectVerticalFromArgs(a, out);
  }
}

function mergeGuides(perPage: number[][]): number[] {
  if (perPage.length === 0) return [];
  // İlk sayfanın kılavuzlarını esas al (çok sayfada aynı şablon varsayımı).
  return perPage[0] ?? [];
}

/** Hücre kenarlarını en yakın dikey kılavuza hafifçe yapıştırır (sütun eklemez). */
function snapLinesToGuides(lines: GeomLine[], guides: number[]): GeomLine[] {
  if (guides.length === 0) return lines;
  const snap = (x: number): number => {
    let best = x;
    let bestD = 3.5; // yalnızca 3.5 birim içindeki çizgiye yapış
    for (const g of guides) {
      const d = Math.abs(g - x);
      if (d < bestD) {
        bestD = d;
        best = g;
      }
    }
    return best;
  };
  return lines.map((line) => ({
    ...line,
    cells: line.cells.map((c) => ({
      ...c,
      x: snap(c.x),
      endX: Math.max(snap(c.x), c.endX),
    })),
  }));
}
