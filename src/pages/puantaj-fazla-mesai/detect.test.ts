/**
 * Puantaj başlık satırı ve otomatik eşleştirme — birim testler.
 */
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  autoDetectMappings,
  guessHeaderRowIndex,
  headersFromRow,
  logicalGroupsFromHeaders,
  toTableView,
  validateMappingCoverage,
} from "./detect";
import { mergeSplitWords } from "./smart-import-v2/mergeText";
import { buildStandardRows } from "./transform";
import { computePuantajFm, DEFAULT_CALC_SETTINGS } from "./engine";
import type { ParsedSheet } from "./model";

function check(label: string, actual: unknown, expected: unknown) {
  assert.deepEqual(actual, expected, label);
}

function buildPdksGrid(): string[][] {
  const header = [
    "Adı Soyadı",
    "",
    "Bölüm",
    "",
    "",
    "Pozisyon",
    "",
    "",
    "",
    "",
    "Mesai Tarihi",
    "Giriş",
    "Çıkış",
    "Mesai Açıklama",
    "İzin Açıklama",
  ];
  const rows: string[][] = [header];
  for (let i = 0; i < 871; i++) {
    rows.push([
      "Çiğdem B",
      "rol",
      "Hasta",
      "H",
      "zmetler",
      "Ekip",
      "L",
      "der",
      "",
      "",
      "29.04.2024",
      "08:28:26",
      "17:42:10",
      "*08:30-17:30",
      "Fazla Mesai İzni",
    ]);
  }
  return rows;
}

function fieldMapped(mappings: ReturnType<typeof autoDetectMappings>, field: string): boolean {
  return mappings.some((m) => m.mode === "field" && m.field === field);
}

check("mergeSplitWords Çiğdem B + rol", mergeSplitWords("Çiğdem B", "rol"), "Çiğdem Birol");

const grid = buildPdksGrid();
check("872 satır", grid.length, 872);
check("başlık satırı 1 (index 0)", guessHeaderRowIndex(grid), 0);

const sheet: ParsedSheet = { name: "PDKS", grid };
const table = toTableView(sheet, 0, 1);
check("871 veri satırı", table.rows.length, 871);
check("15 fiziksel sütun", table.headers.length, 15);
check("8 mantıksal sütun", logicalGroupsFromHeaders(table.headers).length, 8);

const mappings = autoDetectMappings(table.headers);
check("8 eşleştirme satırı", mappings.length, 8);
check("başlık tekrarı yok", new Set(mappings.map((m) => m.header.split(" (")[0])).size, mappings.length);

check("Mesai Tarihi → tarih", fieldMapped(mappings, "tarih"), true);
check("Giriş → kartGiris", fieldMapped(mappings, "kartGiris"), true);
check("Çıkış → kartCikis", fieldMapped(mappings, "kartCikis"), true);
check("Mesai Açıklama", fieldMapped(mappings, "esasCalismaSaatAraligi"), true);
check("İzin Açıklama", fieldMapped(mappings, "izinTatilKodu"), true);
check("Adı Soyadı", fieldMapped(mappings, "personelAdSoyad"), true);
check("Bölüm", fieldMapped(mappings, "birim"), true);
check("Pozisyon", fieldMapped(mappings, "pozisyon"), true);

const coverage = validateMappingCoverage(mappings);
check("eşleşme yeterli", coverage.sufficient, true);

const stdRows = buildStandardRows(table, { mappings, constants: {}, codeMap: {}, headers: table.headers });
check("standart satır sayısı", stdRows.length, 871);
check("birleşik ad Birol", stdRows[0]?.personelAdSoyad?.includes("Birol"), true);
check("birleşik bölüm", stdRows[0]?.birim?.includes("Hizmetler"), true);
check("birleşik pozisyon", stdRows[0]?.pozisyon?.includes("Lider"), true);
check("tarih ISO", stdRows[0]?.tarih, "2024-04-29");
check("giriş saati", stdRows[0]?.kartGiris, "08:28");

const fm = computePuantajFm(stdRows, DEFAULT_CALC_SETTINGS);
check("rapor personel", fm.personelAdSoyad.includes("Birol"), true);
check("rapor bölüm", fm.birim.includes("Hizmetler"), true);
check("rapor pozisyon", fm.pozisyon.includes("Lider"), true);

for (const row of stdRows) {
  if (!row.personelAdSoyad?.includes("Birol")) {
    throw new Error(`Eksik personel adı: ${row.personelAdSoyad}`);
  }
  if (!row.birim?.includes("Hizmet")) {
    throw new Error(`Eksik/bozuk bölüm: ${row.birim}`);
  }
  if (!row.pozisyon?.includes("Lider")) {
    throw new Error(`Eksik/bozuk pozisyon: ${row.pozisyon}`);
  }
  if (row.tarih !== "2024-04-29") {
    throw new Error(`Bozuk tarih: ${row.tarih}`);
  }
}

const realCandidates = [
  "C:\\Users\\Woontegra\\Downloads\\PDKS KART HAREKETLERİ ÇİĞDEM BİROL düzeltme (2).xlsx",
  path.join(process.cwd(), "fixtures", "PDKS KART HAREKETLERİ ÇİĞDEM BİROL düzeltme (2).xlsx"),
];
for (const filePath of realCandidates) {
  if (!fs.existsSync(filePath)) continue;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const XLSX = require("xlsx") as typeof import("xlsx");
  const wb = XLSX.readFile(filePath, { cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const json = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: "", raw: false });
  const realGrid = json.map((row) => (Array.isArray(row) ? row.map((c) => (c == null ? "" : String(c))) : []));
  check(`[gerçek dosya] satır sayısı ${filePath}`, realGrid.length, 872);
  check(`[gerçek dosya] başlık satırı 1 ${filePath}`, guessHeaderRowIndex(realGrid), 0);
  const realTable = toTableView({ name: "PDKS", grid: realGrid }, 0, 1);
  check(`[gerçek dosya] veri satırı ${filePath}`, realTable.rows.length, 871);
  const realMappings = autoDetectMappings(realTable.headers);
  check(`[gerçek dosya] 8 mantıksal eşleme ${filePath}`, realMappings.length, 8);
  break;
}

console.log("detect.test: geçti ✔");
