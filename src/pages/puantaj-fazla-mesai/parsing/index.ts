import type { ParsedDocument, SourceFileKind } from "../model";
import { parseCsv } from "./csv";
import { parseExcel } from "./excel";
import { parsePdf } from "./pdf";

export function detectFileKind(file: File): SourceFileKind {
  const name = file.name.toLowerCase();
  const type = (file.type || "").toLowerCase();
  if (name.endsWith(".csv") || type === "text/csv") return "csv";
  if (name.endsWith(".xlsx") || name.endsWith(".xls") || type.includes("spreadsheet") || type.includes("excel")) {
    return "excel";
  }
  if (name.endsWith(".pdf") || type === "application/pdf") return "pdf";
  return "unknown";
}

export const ACCEPTED_FILE_TYPES = ".pdf,.xlsx,.xls,.csv";

/** Dosya türüne göre uygun ayrıştırıcıya yönlendirir (tamamen lokal). */
export async function parseFile(file: File): Promise<ParsedDocument> {
  const kind = detectFileKind(file);
  switch (kind) {
    case "excel":
      return parseExcel(file);
    case "csv":
      return parseCsv(file);
    case "pdf":
      return parsePdf(file);
    default:
      return {
        fileName: file.name,
        kind: "unknown",
        sheets: [],
        warnings: [
          "Desteklenmeyen dosya türü. Lütfen dijital PDF, Excel (.xlsx/.xls) veya CSV yükleyin.",
        ],
      };
  }
}

export { parseCsv, parseExcel, parsePdf };
