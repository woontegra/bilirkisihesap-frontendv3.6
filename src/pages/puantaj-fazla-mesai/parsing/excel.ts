import * as XLSX from "xlsx";
import type { ParsedDocument, ParsedSheet } from "../model";

type MergeRange = { s: { r: number; c: number }; e: { r: number; c: number } };

/**
 * Birleştirilmiş hücrelerde yalnızca ana hücre dolu gelir; başlık satırı puanlaması
 * ve eşleştirme için boş hücrelere ana değer yazılır (yalnız tanımlı merge aralıkları).
 */
function expandMergedCells(grid: string[][], merges: MergeRange[] | undefined): string[][] {
  if (!merges?.length) return grid;
  const rows = grid.map((row) => [...row]);
  for (const merge of merges) {
    const master = (rows[merge.s.r]?.[merge.s.c] ?? "").toString().trim();
    if (!master) continue;
    for (let r = merge.s.r; r <= merge.e.r; r++) {
      if (!rows[r]) rows[r] = [];
      for (let c = merge.s.c; c <= merge.e.c; c++) {
        while (rows[r].length <= c) rows[r].push("");
        const cur = (rows[r][c] ?? "").toString().trim();
        if (!cur) {
          // Yatay birleştirme: başlık satırında devam hücrelerini boş bırak (mantıksal gruplama).
          if (r === merge.s.r && merge.s.r === merge.e.r && c > merge.s.c) continue;
          rows[r][c] = master;
        }
      }
    }
  }
  return rows;
}

function normalizeGridRows(json: unknown[]): string[][] {
  let maxCols = 0;
  const rows = json.map((row) => {
    const arr = Array.isArray(row) ? row.map((c) => (c == null ? "" : String(c))) : [];
    maxCols = Math.max(maxCols, arr.length);
    return arr;
  });
  return rows.map((row) => {
    if (row.length >= maxCols) return row;
    return [...row, ...Array.from({ length: maxCols - row.length }, () => "")];
  });
}

/**
 * Excel (.xlsx/.xls) ayrıştırma — SheetJS ile, tamamen tarayıcı içinde.
 * Her sekme, ham hücre matrisine (string) dönüştürülür.
 */
export async function parseExcel(file: File): Promise<ParsedDocument> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array", cellDates: true, raw: false });
  const sheets: ParsedSheet[] = [];

  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    if (!ws) continue;
    const json = XLSX.utils.sheet_to_json<string[]>(ws, {
      header: 1,
      raw: false,
      defval: "",
      blankrows: false,
    });
    const grid = expandMergedCells(
      normalizeGridRows(json),
      ws["!merges"] as MergeRange[] | undefined,
    );
    sheets.push({ name: name || `Sayfa ${sheets.length + 1}`, grid });
  }

  return {
    fileName: file.name,
    kind: "excel",
    sheets,
    warnings: sheets.length === 0 ? ["Excel dosyasında okunabilir sayfa bulunamadı."] : [],
  };
}
