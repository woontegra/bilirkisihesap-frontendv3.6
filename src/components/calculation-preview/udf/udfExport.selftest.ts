/**
 * Ortak UDF dışa aktarma ve fazla mesai önizleme notu.
 * Referans UDF salt okunur açılır.
 */
import { readFileSync } from "node:fs";
import { columnSpansFor } from "../previewColumnLayout";
import type { PreviewSection } from "../types";
import { udfFileNameFromTitle } from "../udfFileName";
import { expandStandartRowsForDeductions } from "../../../pages/hesaplamalar/fazla-mesai/standart/v3-engine/standart/expandStandartRowsForDeductions";
import {
  formatStandartPreviewPeriodCell,
  isAutoUbgtAnnualLeaveDeductionNote,
  standartPreviewCetvelCells,
} from "../../../pages/hesaplamalar/fazla-mesai/standart/previewPeriodLabel";
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

const REFERENCE = "C:\\Users\\Woontegra\\Desktop\\denemegpt.udf";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

function assertXmlWellFormed(xml: string): void {
  const stripped = xml.replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, "");
  const stack: string[] = [];
  for (const tag of stripped.matchAll(/<\/?([A-Za-z0-9_:-]+)[^>]*?>/g)) {
    const raw = tag[0] ?? "";
    const name = tag[1] ?? "";
    if (raw.startsWith("<?") || raw.endsWith("/>")) continue;
    if (raw.startsWith("</")) {
      assert(stack.pop() === name, `xml kapanış ${name}`);
    } else {
      stack.push(name);
    }
  }
  assert(stack.length === 0, "xml yığını kapanmadı");
}

function spansOk(tableXml: string, headers: string[], cetvel: boolean): void {
  const raw = /columnSpans="([^"]+)"/.exec(tableXml)?.[1] ?? "";
  const parts = raw.split(",").map(Number);
  assert(parts.join(",") === columnSpansFor(headers, cetvel).join(","), `sütun oranı ${headers.join("|")}`);
  assert(parts.every((part) => part >= 6), "dar sütun");
  assert(parts.reduce((total, part) => total + part, 0) === 100, "toplam genişlik");
}

async function inspectReference(): Promise<void> {
  const bytes = new Uint8Array(readFileSync(REFERENCE));
  const entries = await readZipEntries(bytes);
  assert(entries.size === 1 && entries.has("content.xml"), "referans yalnız content.xml");
  const xml = new TextDecoder().decode(entries.get("content.xml"));
  assert(xml.includes('format_id="1.8"'), "format_id 1.8");
  assert(xml.includes("<table ") && xml.includes("<row ") && xml.includes("<cell>") && xml.includes("<paragraph"), "tablo elemanları");
  const pool = extractUdfCdata(xml);
  assert(udfCodePointLength(pool) === 57, "kod noktası 57");
  assert(new TextEncoder().encode(pool).length === 58, "UTF-8 bayt 58");
  const expected: Array<[number, number, string]> = [
    [0, 13, " Fazla Mesai\n"],
    [13, 6, " 5000\n"],
    [19, 15, " Damga Vergisi\n"],
    [34, 5, " 250\n"],
    [39, 11, " Net Ücret\n"],
    [50, 6, " 4750\n"],
    [56, 1, "\n"],
  ];
  for (const [start, length, text] of expected) {
    assert(udfCodePointSlice(pool, start, length) === text, `ofset ${start}`);
  }
  assert(udfCodePointLength("₺") === 1 && udfCodePointLength("Ü") === 1, "₺ ve Ü tek kod noktası");
}

function inspectPreviewLabels(): void {
  const range = "01.01.2024 – 31.03.2024";
  const notes = [
    "(2 gün UBGT düşülmüştür)",
    "(1 gün yıllık izin düşülmüştür)",
    "(1 gün UBGT + 1 gün yıllık izin düşülmüştür)",
    "(0,5 gün UBGT düşülmüştür)",
    "(12 gün yıllık izin düşülmüştür)",
    "(1 gün dışlama düşülmüştür)",
    "(6 gün dışlama düşülmüştür: yıllık izin / UBGT / diğer)",
  ];
  for (const note of notes) {
    const source = {
      dateRange: range,
      note,
      weeks: "4",
      wage: "20.000,00 ₺",
      katsayi: "1",
      fmHours: "10,50",
      fm: "4.750,00 ₺",
    };
    const before = JSON.stringify(source);
    const screenNote = source.note;
    const previewRow = standartPreviewCetvelCells(source);
    assert(JSON.stringify(source) === before, "kaynak satır değişti");
    assert(screenNote === note, "ana ekran notu duruyor");
    assert(isAutoUbgtAnnualLeaveDeductionNote(note), `otomatik not tanınmadı: ${note}`);
    assert(previewRow[0] === range, `önizleme tarihi temiz değil: ${previewRow[0]}`);
    assert(!previewRow.some((cell) => cell.includes("düşülmüştür")), "önizleme kopyasında düşüm yok");
    assert(previewRow[1] === "4" && previewRow[4] === "10,50" && previewRow[7] === "4.750,00 ₺", "saat ve tutar korundu");
  }
  assert(formatStandartPreviewPeriodCell(range, "(manuel not)") === `${range} (manuel not)`, "genel parantez silinmedi");
  assert(
    formatStandartPreviewPeriodCell("23.04.2019 – 29.04.2019 (1 gün UBGT düşülmüştür)") === "23.04.2019 – 29.04.2019",
    "tarihe yapışmış otomatik not da çıkar",
  );
  assert(
    formatStandartPreviewPeriodCell("23.04.2019 – 29.04.2019 (7 gün)") === "23.04.2019 – 29.04.2019 (7 gün)",
    "eşleşmeyen parantez durur",
  );

  const produced = expandStandartRowsForDeductions({
    rows: [
      {
        id: "test-2021",
        startISO: "2021-01-01",
        endISO: "2021-12-31",
        weeks: 52,
        originalWeekCount: 52,
        brut: 3577.5,
        katsayi: 1,
        fmHours: 14,
        fm: 1000,
      },
    ],
    exclusions: [
      { id: "u1", type: "UBGT", start: "2021-04-23", end: "2021-04-23", days: 1 },
      { id: "y1", type: "Yıllık İzin", start: "2021-04-25", end: "2021-04-25", days: 1 },
    ],
    weeklyDays: 7,
    dailyNet: 10.6875,
    baselineWeeklyFm: 14,
    davaciSevenDay: "tatilsiz",
  });
  const engineBefore = produced.map((row) => ({
    note: (row as { yillikIzinAciklama?: string }).yillikIzinAciklama ?? "",
    weeks: row.weeks,
    fmHours: row.fmHours,
    fm: row.fm,
    startISO: row.startISO,
    endISO: row.endISO,
  }));
  const deduction = engineBefore.find((row) => row.note.includes("düşülmüştür"));
  assert(deduction, "motor açıklamayı üretmeli");
  const previewFromEngine = standartPreviewCetvelCells({
    dateRange: `${deduction?.startISO} – ${deduction?.endISO}`,
    note: deduction?.note,
    weeks: String(deduction?.weeks),
    wage: String(deduction?.fm),
    katsayi: "1",
    fmHours: String(deduction?.fmHours),
    fm: String(deduction?.fm),
  });
  assert(
    produced.some((row) => ((row as { yillikIzinAciklama?: string }).yillikIzinAciklama ?? "").includes("düşülmüştür")),
    "motor satırındaki açıklama duruyor",
  );
  assert(!previewFromEngine[0]?.includes("düşülmüştür"), "önizleme kopyasında motor açıklaması yok");
  assert(previewFromEngine[1] === String(deduction?.weeks), "hafta aynı");
  assert(previewFromEngine[4] === String(deduction?.fmHours), "FM saati aynı");
  assert(previewFromEngine[7] === String(deduction?.fm), "tutar aynı");

  const page = readFileSync(
    new URL("../../../pages/hesaplamalar/fazla-mesai/standart/StandartFmPage.tsx", import.meta.url),
    "utf8",
  );
  const cetvel = readFileSync(
    new URL("../../../pages/hesaplamalar/fazla-mesai/standart/CetvelTable.tsx", import.meta.url),
    "utf8",
  );
  const modal = readFileSync(new URL("../CalculationPreviewModal.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../CalculationPreviewModal.module.css", import.meta.url), "utf8");
  assert(page.includes("standartPreviewCetvelCells("), "önizleme kopyası bağlı");
  assert(!page.includes("udfTrial") && !modal.includes("udfTrial"), "geçici prop kalmadı");
  assert(modal.includes(">UDF İndir<") || modal.includes("UDF İndir"), "modal düğmesi var");
  assert(!modal.includes("Deneme"), "deneme yazısı kalmadı");
  assert(modal.indexOf("PDF İndir") < modal.indexOf("UDF İndir"), "UDF, PDF'den sonra");
  assert(modal.indexOf("UDF İndir") < modal.indexOf(">Kapat<") || modal.indexOf("UDF İndir") < modal.lastIndexOf("Kapat"), "UDF, Kapat'tan önce");
  assert(modal.includes("UDF dosyası oluşturulamadı. Lütfen tekrar deneyin."), "hata metni");
  assert(css.includes("tabular-nums") && css.includes("alignRight") && css.includes("alignCenter"), "hizalama sınıfları");
  assert(!page.includes("r.note ="), "sayfa kaynak notu yazmıyor");
  assert(!cetvel.includes("previewPeriodLabel") && !cetvel.includes("previewPeriodCell"), "ana cetvel temizleyici kullanmıyor");
  assert(cetvel.includes("r.isDeductionRow ? styles.deductionRow"), "açık satır vurgusu duruyor");
  assert(cetvel.includes("{r.note ? <div className={styles.rowNote}>{r.note}</div> : null}"), "ana cetvel notu duruyor");
  for (const relative of [
    "../../../pages/hesaplamalar/fazla-mesai/donemsel/DonemselFmPage.tsx",
    "../../../pages/hesaplamalar/fazla-mesai/yeralti-isci/YeraltiFmPage.tsx",
    "../../../pages/hesaplamalar/fazla-mesai/vardiya-24/Vardiya24FmPage.tsx",
    "../../../pages/hesaplamalar/fazla-mesai/vardiya-48/Vardiya48FmPage.tsx",
    "../../../pages/hesaplamalar/fazla-mesai/gemi-adami-gunluk/GemiGunlukFmPage.tsx",
    "../../../pages/hesaplamalar/fazla-mesai/gemi-adami-7-24/Gemi724FmPage.tsx",
    "../../../pages/hesaplamalar/fazla-mesai/donemsel-haftalik/DonemselHaftalikFmPage.tsx",
    "../../../pages/hesaplamalar/fazla-mesai/tanikli-standart/TanikliStandartFmPage.tsx",
    "../../../pages/hesaplamalar/fazla-mesai/haftalik-karma/HaftalikKarmaFmPage.tsx",
  ]) {
    const source = readFileSync(new URL(relative, import.meta.url), "utf8");
    assert(source.includes("formatPreviewPeriodCell("), `${relative} önizleme kopyası`);
  }
}

function inspectFileNames(): void {
  const cases: Array<[string, string]> = [
    ["Standart Fazla Mesai Hesaplama", "standart-fazla-mesai-raporu.udf"],
    ["Kıdem Tazminatı", "kidem-tazminati-raporu.udf"],
    ["İhbar Tazminatı", "ihbar-tazminati-raporu.udf"],
    ["UBGT Alacağı", "ubgt-alacagi-raporu.udf"],
  ];
  for (const [title, fileName] of cases) {
    const actual = udfFileNameFromTitle(title);
    assert(actual === fileName, `${title} -> ${actual}`);
    assert(/^[a-z0-9.-]+\.udf$/.test(actual), "dosya adı güvenli değil");
    assert(!actual.includes("@") && !/\d{2,}/.test(actual.replace(/[a-z.-]/g, "")), "kişisel veri yok");
  }
  assert(!udfFileNameFromTitle("kisi@ornek.com").includes("@"), "e-posta dosya adına geçmez");
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
      [
        formatStandartPreviewPeriodCell("01.01.2024 – 31.03.2024", "(2 gün UBGT düşülmüştür)"),
        "4",
        "20.000,00 ₺",
        "1",
        "10,50",
        "225",
        "1,5",
        "4.750,00 ₺",
      ],
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
    id: "ihbar",
    title: "İhbar",
    headers: ["Kalem", "Değer"],
    rows: [["İhbar süresi", "8 hafta"]],
  },
  {
    id: "yillik",
    title: "Yıllık İzin",
    headers: ["Dönem", "Gün", "Ücret"],
    rows: [["01.01.2024 – 31.12.2024", "14", "8.500,00 ₺"]],
  },
  {
    id: "ubgt",
    title: "UBGT",
    headers: ["Dönem", "Hafta", "Ücret", "Katsayı", "Gün", "Günlük", "UBGT Ücreti"],
    rows: [["01.01.2024 – 31.03.2024", "12", "20.000,00 ₺", "1", "3", "666,67 ₺", "2.000,00 ₺"]],
    lastRowTone: "green",
  },
  {
    id: "icra",
    title: "İcra",
    headers: ["Başlangıç", "Bitiş", "Gün", "Oran", "Faiz tutarı"],
    rows: [["01.01.2024", "31.03.2024", "90", "%9", "1.250,00 ₺"]],
  },
];

function tableAt(tables: string[], index: number): string {
  const table = tables[index];
  if (!table) throw new Error(`tablo ${index} yok`);
  return table;
}

function contentAttrs(tableXml: string): Array<Record<string, string>> {
  const attrs: Array<Record<string, string>> = [];
  const pattern = /<content\b([^>]*?)\/>/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(tableXml))) {
    const bag: Record<string, string> = {};
    for (const part of match[1].matchAll(/([\w:]+)="([^"]*)"/g)) bag[part[1]] = part[2];
    attrs.push(bag);
  }
  return attrs;
}

async function inspectGenerated(): Promise<void> {
  const before = JSON.stringify(sample);
  const bytes = await buildPreviewUdf(sample);
  assert(JSON.stringify(sample) === before, "kaynak önizleme değişmemeli");
  const entries = await readZipEntries(bytes);
  assert([...entries.keys()].join(",") === "content.xml", "zip yalnız content.xml");
  const xml = new TextDecoder().decode(entries.get("content.xml"));
  assertXmlWellFormed(xml);
  assert(xml.includes('format_id="1.8"'), "format");
  assert(xml.includes("<table ") && xml.includes("<row ") && xml.includes("<cell>") && xml.includes("<paragraph"), "gerçek tablo");
  assert(xml.includes('border="borderCell"'), "kenarlık");
  assert(xml.includes('LeftIndent="1.0"') && xml.includes('RightIndent="0.5"'), "daraltılmış girinti");
  const pieces = readUdfContentPieces(xml);
  assert(pieces.join("") === extractUdfCdata(xml), "ofset ve uzunluk havuzu örtüşmüyor");
  const tables = xml.match(/<table\b[^>]*>[\s\S]*?<\/table>/g) ?? [];
  assert(tables.length === sample.length, "tablo sayısı");
  const model = buildPreviewUdfModel(sample);
  assert(model.sectionCount === sample.length && model.tableCount === sample.length, "bölüm sayısı");

  const cetvelXml = tableAt(tables, 1);
  const cetvel = contentAttrs(cetvelXml);
  spansOk(cetvelXml, CETVEL_HEADERS, true);
  assert(cetvelXml.includes('columnSpans="27,7,13,8,9,8,7,21"'), "cetvel sütun oranları");
  assert(cetvel.slice(0, 8).every((item) => item.size === "9" && item.bold === "true"), "cetvel başlığı 9 punto kalın");
  assert(cetvel.slice(8, 16).every((item) => item.size === "9" && item.bold === "false"), "cetvel gövdesi 9 punto");
  assert(cetvel.slice(16).every((item) => item.bold === "true"), "cetvel toplam satırı kalın");
  assert(cetvel[0]?.Alignment === "0" && cetvel[1]?.Alignment === "1" && cetvel[2]?.Alignment === "2", "cetvel başlık hizası");
  assert(cetvel[8]?.Alignment === "0", "dönem sola");
  assert(cetvel[10]?.Alignment === "2" && cetvel[15]?.Alignment === "2", "ücret ve fazla mesai sağa");

  const kidem = contentAttrs(tableAt(tables, 2));
  spansOk(tableAt(tables, 2), ["Kalem", "Tutar"], false);
  assert(kidem.every((item) => item.size === "10"), "kıdem 10 punto");
  assert(kidem[0]?.bold === "true" && kidem[1]?.Alignment === "2", "kıdem başlık ve tutar");

  const yillik = contentAttrs(tableAt(tables, 4));
  assert(yillik[0]?.Alignment === "0" && yillik[1]?.Alignment === "1" && yillik[2]?.Alignment === "2", "yıllık izin hizası");

  const ubgtXml = tableAt(tables, 5);
  const ubgt = contentAttrs(ubgtXml);
  spansOk(ubgtXml, sample[5]?.headers ?? [], false);
  assert(ubgt.every((item) => item.size === "9"), "geniş UBGT 9 punto");
  assert(ubgt.slice(7).every((item) => item.bold === "true"), "UBGT sonuç satırı kalın");

  const icra = contentAttrs(tableAt(tables, 6));
  assert(icra.every((item) => item.size === "10"), "icra 10 punto");
  assert(icra[2]?.Alignment === "1" && icra[3]?.Alignment === "1" && icra[4]?.Alignment === "2", "icra hizası");

  const texts = pieces.map(visibleUdfText);
  for (const expected of [
    "Genel Bilgiler",
    "Fazla Mesai Hesaplama Cetveli",
    "01.01.2024 – 31.03.2024",
    "10,50",
    "20.000,00 ₺",
    "4.750,00 ₺",
    "Kıdem tazminatı",
    "İhbar süresi",
    "%9",
    "-1.250,50",
    "a]]>b",
  ]) {
    assert(texts.includes(expected), `metin yok: ${expected}`);
  }
  assert(pieces.some((piece) => piece === " \n"), "boş hücre");
  assert(!texts.some((text) => text.includes("düşülmüştür")), "otomatik düşüm UDF'de yok");
  assert(!xml.includes("<button") && !xml.includes("<svg") && !xml.includes("<img"), "araç çubuğu ve resim yok");
  assert(texts.includes("%9") && texts.some((text) => text.includes("₺")), "yüzde ve lira");
}

await inspectReference();
inspectPreviewLabels();
inspectFileNames();
await inspectGenerated();
console.log("udf export selftest ok");
