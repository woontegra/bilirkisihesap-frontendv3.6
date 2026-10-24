import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildStandardYillikPreviewSections } from "@/pages/hesaplamalar/yillik-izin/lib/buildStandardYillikPreviewSections";
import type { StandardComputeResult } from "@/pages/hesaplamalar/yillik-izin/lib/types";
import { columnSpansFor } from "../previewColumnLayout";
import type { PreviewSection } from "../types";
import { udfFileNameFromTitle } from "../udfFileName";
import {
  buildPreviewUdf,
  buildPreviewUdfModel,
  extractUdfCdata,
  readUdfContentPieces,
  udfCodePointLength,
  udfCodePointSlice,
  visibleUdfText,
} from "./buildPreviewUdf";
import { readZipEntries } from "./udfZip";

/** UYAP Editör'de oluşturulmuş referans dosya (yalnızca yerel makinede bulunur). */
const REFERENCE = "C:\\Users\\Woontegra\\Desktop\\denemegpt.udf";

function assertXmlWellFormed(xml: string): void {
  const stripped = xml.replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, "");
  const stack: string[] = [];
  for (const tag of stripped.matchAll(/<\/?([A-Za-z0-9_:-]+)[^>]*?>/g)) {
    const raw = tag[0] ?? "";
    const name = tag[1] ?? "";
    if (raw.startsWith("<?") || raw.endsWith("/>")) continue;
    if (raw.startsWith("</")) expect(stack.pop(), `kapanış ${name}`).toBe(name);
    else stack.push(name);
  }
  expect(stack).toEqual([]);
}

function contentAttrs(tableXml: string): Array<Record<string, string>> {
  return Array.from(tableXml.matchAll(/<content\b([^>]*?)\/>/g), (match) => {
    const bag: Record<string, string> = {};
    for (const part of (match[1] ?? "").matchAll(/([\w:]+)="([^"]*)"/g)) bag[part[1]] = part[2];
    return bag;
  });
}

async function unpack(sections: PreviewSection[]) {
  const bytes = await buildPreviewUdf(sections);
  const entries = await readZipEntries(bytes);
  const xml = new TextDecoder().decode(entries.get("content.xml"));
  return { bytes, entries, xml, texts: readUdfContentPieces(xml).map(visibleUdfText) };
}

const CETVEL_HEADERS = ["Dönem", "Hafta", "Ücret", "Katsayı", "FM Saat", "225", "1,5", "Fazla Mesai"];

const sample: PreviewSection[] = [
  {
    id: "temel",
    title: "Genel Bilgiler",
    headers: ["İşe Giriş", "İşten Çıkış", "Çalışma Süresi", "Haftalık FM Saat"],
    rows: [["01.01.2024", "31.12.2024", "6 gün", "10,50 sa"]],
  },
  {
    id: "cetvel",
    title: "Fazla Mesai Hesaplama Cetveli",
    headers: CETVEL_HEADERS,
    rows: [
      ["01.01.2024 – 31.03.2024", "4", "20.000,00 ₺", "1", "10,50", "225", "1,5", "4.750,00 ₺"],
      ["", "", "", "", "", "", "Toplam Fazla Mesai:", "4.750,00 ₺"],
    ],
    lastRowTone: "blue",
  },
  {
    id: "kidem",
    title: "Kıdem",
    headers: ["Kalem", "Tutar"],
    rows: [
      ["Kıdem tazminatı", "120.000,00 ₺"],
      ["Mahsup", "-1.250,50"],
      ["Tavan", ""],
      ["CDATA", "a]]>b"],
    ],
  },
  {
    id: "icra",
    title: "İcra",
    headers: ["Başlangıç", "Bitiş", "Gün", "Oran", "Faiz tutarı"],
    rows: [["01.01.2024", "31.03.2024", "90", "%9", "1.250,00 ₺"]],
  },
];

describe("önizleme UDF dışa aktarımı", () => {
  it.skipIf(!existsSync(REFERENCE))("UYAP referans dosyasıyla aynı kapsayıcı ve ofset düzeni", async () => {
    const entries = await readZipEntries(new Uint8Array(readFileSync(REFERENCE)));
    expect([...entries.keys()]).toEqual(["content.xml"]);
    const xml = new TextDecoder().decode(entries.get("content.xml"));
    expect(xml).toContain('format_id="1.8"');
    const pool = extractUdfCdata(xml);
    expect(udfCodePointLength(pool)).toBe(57);
    expect(new TextEncoder().encode(pool).length).toBe(58);
    expect(udfCodePointSlice(pool, 39, 11)).toBe(" Net Ücret\n");
    expect(readUdfContentPieces(xml).join("")).toBe(pool);
  });

  it("yalnız content.xml içeren, iyi biçimli UDF 1.8 üretir", async () => {
    const before = JSON.stringify(sample);
    const { entries, xml, texts } = await unpack(sample);
    expect(JSON.stringify(sample)).toBe(before);
    expect([...entries.keys()]).toEqual(["content.xml"]);
    assertXmlWellFormed(xml);
    expect(xml).toContain('format_id="1.8"');
    expect(xml).toContain('border="borderCell"');
    expect(readUdfContentPieces(xml).join("")).toBe(extractUdfCdata(xml));
    const tables = xml.match(/<table\b[^>]*>[\s\S]*?<\/table>/g) ?? [];
    expect(tables.length).toBe(sample.length);
    expect(buildPreviewUdfModel(sample).tableCount).toBe(sample.length);
    for (const value of [
      "Genel Bilgiler",
      "01.01.2024 – 31.03.2024",
      "20.000,00 ₺",
      "4.750,00 ₺",
      "Kıdem tazminatı",
      "-1.250,50",
      "a]]>b",
      "%9",
      "İşten Çıkış",
      "Çalışma Süresi",
    ]) {
      expect(texts, value).toContain(value);
    }
    expect(xml).not.toMatch(/<button|<svg|<img/);
  });

  it("tablo sütunları, hizalama ve toplam satırı vurgusu", async () => {
    const { xml } = await unpack(sample);
    const tables = xml.match(/<table\b[^>]*>[\s\S]*?<\/table>/g) ?? [];
    const cetvelXml = tables[1] ?? "";
    expect(cetvelXml).toContain('columnSpans="27,7,13,8,9,8,7,21"');
    const cetvel = contentAttrs(cetvelXml);
    expect(cetvel.slice(0, 8).every((c) => c.size === "9" && c.bold === "true")).toBe(true);
    expect(cetvel.slice(8, 16).every((c) => c.bold === "false")).toBe(true);
    expect(cetvel.slice(16).every((c) => c.bold === "true")).toBe(true);
    expect(cetvel[15]?.Alignment).toBe("2");
    for (const [index, section] of sample.entries()) {
      const spans = (/columnSpans="([^"]+)"/.exec(tables[index] ?? "")?.[1] ?? "").split(",").map(Number);
      expect(spans).toEqual(columnSpansFor(section.headers, section.id === "cetvel"));
      expect(spans.reduce((a, b) => a + b, 0)).toBe(100);
    }
    const kidem = contentAttrs(tables[2] ?? "");
    expect(kidem[1]?.Alignment).toBe("2");
  });

  it("gerçek rapor bölümlerindeki her hücreyi sırasıyla korur (Yıllık İzin)", async () => {
    const result = {
      workPeriodLabel: "7 yıl 2 ay 14 gün",
      entitlementLines: [],
      breakdown: { y1: 5, y2: 2, y3: 0, d1: 70, d2: 40, d3: 0, total: 110, daysPerYear1: 14, daysPerYear2: 20, daysPerYear3: 26 },
      totalEntitlement: 110,
      usedTotal: 24,
      remainingDays: 86,
      formulaText: "",
      brutIzin: 57333.33,
      sgk: 8026.67,
      issizlik: 573.33,
      gelirVergisi: 7310.0,
      gelirVergisiDilimleri: "(%15 + %20)",
      damgaVergisi: 435.16,
      netIzin: 40988.17,
    } as unknown as StandardComputeResult;
    const sections = buildStandardYillikPreviewSections({
      form: {
        startDate: "2017-03-01",
        endDate: "2024-05-15",
        brut: "20.000,00",
        employerPayment: "1.500,00",
        usedRows: [{ id: "u1", start: "2019-07-01", end: "2019-07-24", days: "24" }],
      },
      result,
    });
    const expected = sections.flatMap((s) => [s.title, ...s.headers, ...s.rows.flat()]);
    const { texts } = await unpack(sections);
    expect(texts.slice(0, expected.length)).toEqual(expected);
    expect(texts).toContain("57.333,33 ₺");
    expect(texts).toContain("40.988,17 ₺");
    expect(texts).toContain("Gelir Vergisi (%15 + %20)");
    expect(texts).toContain("Brüt'ten Net'e Çeviri");
  });

  it("dosya adı güvenli ve kişisel veri içermez", () => {
    expect(udfFileNameFromTitle("Standart Fazla Mesai Hesaplama")).toBe("standart-fazla-mesai-raporu.udf");
    expect(udfFileNameFromTitle("Kıdem Tazminatı")).toBe("kidem-tazminati-raporu.udf");
    expect(udfFileNameFromTitle("UBGT Alacağı")).toBe("ubgt-alacagi-raporu.udf");
    expect(udfFileNameFromTitle("Şirket Özel Çalışması")).toMatch(/^[a-z0-9-]+\.udf$/);
    expect(udfFileNameFromTitle("kisi@ornek.com")).not.toContain("@");
  });

  it("ortak önizleme modalında UDF düğmesi PDF'nin yanında; PDF/Word akışı korunur", () => {
    const modal = readFileSync(new URL("../CalculationPreviewModal.tsx", import.meta.url), "utf8");
    const css = readFileSync(new URL("../CalculationPreviewModal.module.css", import.meta.url), "utf8");
    const pdf = modal.indexOf("PDF İndir");
    const udf = modal.indexOf("UDF İndir");
    expect(pdf).toBeGreaterThan(0);
    expect(udf).toBeGreaterThan(pdf);
    expect(udf).toBeLessThan(modal.lastIndexOf("Kapat"));
    expect(modal).toContain("downloadPreviewPdf(title, sections)");
    expect(modal).toContain("copyAllTablesForWord(contentId)");
    expect(modal).toContain("downloadPreviewUdf(sections, udfFileNameFromTitle(title))");
    expect(css).toContain(".btnUdf");
  });
});
