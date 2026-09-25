/**
 * Akıllı İçe Aktarma V2 — birim testleri.
 * tsconfig.runtests.json ile derlenip Node'da çalıştırılır.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { analyzeWorkbook } from "./analyzeWorkbook";
import { canonicalRowsToStandardRows } from "./compatibilityAdapter";
import { detectHeaderRow } from "./detectHeaderRows";
import { mergeSplitWords } from "./groupLogicalColumns";

type Failure = { label: string; actual: unknown; expected: unknown };

function check(label: string, actual: unknown, expected: unknown, failures: Failure[]) {
  const ok =
    actual === expected ||
    (typeof actual === "number" && typeof expected === "number" && Math.abs(actual - expected) < 1e-6);
  if (!ok) failures.push({ label, actual, expected });
}

function buildPdksFixture(): string[][] {
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
  for (let i = 0; i < 8; i++) {
    rows.push([
      "Çiğdem",
      "Brol",
      "Hasta",
      "H",
      "zmetler",
      "Ekip",
      "L",
      "der",
      "",
      "",
      `29.04.2024`,
      "08:28:26",
      "17:42:10",
      "*08:30-17:30",
      "Fazla Mesai İzni",
    ]);
  }
  // İkinci segment: farklı sütun yerleşimi (tarih önde, isim sonda)
  const header2 = [
    "Tarih",
    "Giriş Saati",
    "Çıkış Saati",
    "Mesai Planı",
    "İzin",
    "Personel Adı",
    "",
  ];
  rows.push(header2);
  for (let i = 0; i < 5; i++) {
    rows.push([
      "30.04.2024",
      "09:00:00",
      "18:00:00",
      "*OFF",
      "",
      "Çiğdem",
      "Birol",
    ]);
  }
  return rows;
}

function tryLoadRealWorkbook(): string[][] | null {
  const candidates = [
    "C:\\Users\\Woontegra\\Downloads\\PDKS KART HAREKETLERİ ÇİĞDEM BİROL düzeltme.xlsx",
    path.join(process.cwd(), "fixtures", "PDKS KART HAREKETLERİ ÇİĞDEM BİROL düzeltme.xlsx"),
  ];
  for (const filePath of candidates) {
    if (!fs.existsSync(filePath)) continue;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const XLSX = require("xlsx") as typeof import("xlsx");
      const wb = XLSX.readFile(filePath, { cellDates: true });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: "", raw: false });
      return json.map((row) => (Array.isArray(row) ? row.map((c) => (c == null ? "" : String(c))) : []));
    } catch {
      return null;
    }
  }
  return null;
}

export function runSmartImportV2SelfTests(): { passed: number; failures: Failure[] } {
  const failures: Failure[] = [];
  let passed = 0;
  const pass = (label: string, actual: unknown, expected: unknown) => {
    check(label, actual, expected, failures);
    if (failures.every((f) => f.label !== label)) passed += 1;
  };

  pass("mergeSplitWords Birol", mergeSplitWords("Çiğdem B", "rol"), "Çiğdem Birol");
  pass("mergeSplitWords Hizmetler", mergeSplitWords("Hasta H", "zmetler"), "Hasta Hizmetler");
  pass("mergeSplitWords Lider", mergeSplitWords("Ekip L", "der"), "Ekip Lider");

  const fixture = buildPdksFixture();
  const hdr = detectHeaderRow(fixture);
  pass("fixture başlık satırı 1", hdr.headerRowIndex, 0);

  const analysis = analyzeWorkbook({ grid: fixture, sheetName: "Test" });
  pass("analiz başarılı", analysis.ok, true);
  pass("en az 2 segment", analysis.segmentCount >= 2, true);
  pass("veri satırı > 0", analysis.dataRowCount > 0, true);

  const first = analysis.canonicalRows[0];
  pass("birleşik ad", first?.employeeName?.includes("Birol"), true);
  pass("birleşik bölüm", first?.department?.includes("Hizmetler"), true);
  pass("birleşik pozisyon", first?.position?.includes("Lider"), true);
  pass("tarih", first?.workDate, "29.04.2024");
  pass("giriş", first?.actualEntry, "08:28:26");
  pass("çıkış", first?.actualExit, "17:42:10");
  pass("vardiya", first?.plannedShiftText, "*08:30-17:30");
  pass("izin", first?.leaveText, "Fazla Mesai İzni");

  const std = canonicalRowsToStandardRows(analysis.canonicalRows.slice(0, 1));
  pass("adapter personel", std[0]?.personelAdSoyad?.includes("Birol"), true);
  pass("adapter tarih ISO", std[0]?.tarih, "2024-04-29");

  const realGrid = tryLoadRealWorkbook();
  if (realGrid) {
    const realHdr = detectHeaderRow(realGrid);
    pass("gerçek dosya başlık satırı 1", realHdr.headerRowIndex, 0);
    const realAnalysis = analyzeWorkbook({ grid: realGrid, sheetName: "PDKS" });
    pass("gerçek dosya analiz", realAnalysis.ok, true);
    pass("gerçek dosya ≥2 segment", realAnalysis.segmentCount >= 2, true);
  }

  if (failures.length > 0) {
    // eslint-disable-next-line no-console
    console.error(`smartImportV2.test.ts: ${failures.length} test başarısız`, failures);
  } else {
    // eslint-disable-next-line no-console
    console.log(`smartImportV2.test.ts: ${passed} test geçti ✔`);
  }
  return { passed, failures };
}

runSmartImportV2SelfTests();
