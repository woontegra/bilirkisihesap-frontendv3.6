import Papa from "papaparse";
import type { ParsedDocument } from "../model";

/**
 * CSV ayrıştırma — PapaParse ile. Ayıraç otomatik sezilir (`,` `;` `\t`).
 * Tamamen tarayıcı içinde; ağ isteği yok.
 */
export async function parseCsv(file: File): Promise<ParsedDocument> {
  const text = await file.text();
  const result = Papa.parse<string[]>(text, {
    delimiter: "", // otomatik sez
    skipEmptyLines: "greedy",
    dynamicTyping: false,
  });

  const grid = (result.data ?? []).map((row) =>
    Array.isArray(row) ? row.map((c) => (c == null ? "" : String(c).trim())) : [],
  );

  const warnings: string[] = [];
  if (result.errors && result.errors.length > 0) {
    warnings.push(`CSV ayrıştırma uyarısı: ${result.errors[0].message}`);
  }
  if (grid.length === 0) warnings.push("CSV dosyası boş görünüyor.");

  return {
    fileName: file.name,
    kind: "csv",
    sheets: [{ name: "CSV", grid }],
    warnings,
  };
}
