import {
  columnAlignFor,
  columnSpansFor,
  isFmCetvel,
  tablePointSize,
} from "../previewColumnLayout";
import type { PreviewSection } from "../types";
import { zipSingleStoredXml } from "./udfZip";

/** denemegpt.udf: ofset/length Unicode kod noktasıdır, UTF-8 baytı değildir. */
export function udfCodePointLength(value: string): number {
  return Array.from(value).length;
}

export function udfCodePointSlice(value: string, start: number, length: number): string {
  return Array.from(value).slice(start, start + length).join("");
}

const PAGE_PROPERTIES =
  '<properties><pageFormat mediaSizeName="1" leftMargin="42.525000000000006" rightMargin="42.525000000000006" topMargin="42.525000000000006" bottomMargin="42.52500000000006" paperOrientation="1" headerFOffset="20.0" footerFOffset="20.0" /></properties>';

const STYLES =
  '<styles><style name="default" description="Geçerli" family="Dialog" size="12" bold="false" italic="false" FONT_ATTRIBUTE_KEY="javax.swing.plaf.FontUIResource[family=Dialog,name=Dialog,style=plain,size=12]" foreground="-13421773" /><style name="hvl-default" family="Times New Roman" size="12" description="Gövde" /><style name="cetvel" family="Times New Roman" size="9" description="Cetvel" bold="false" /><style name="cetvel-baslik" family="Times New Roman" size="9" description="Cetvel başlık" bold="true" /><style name="kucuk" family="Times New Roman" size="10" description="Küçük tablo" bold="false" /><style name="bolum" family="Times New Roman" size="10" description="Bölüm başlığı" bold="true" /></styles>';

/** Referans 3.0 / 1.0 girintiden daha dar hücre iç boşluğu. */
const LEFT_INDENT = "1.0";
const RIGHT_INDENT = "0.5";

function wrapCdata(text: string): string {
  return `<![CDATA[${text.replace(/]]>/g, "]]]]><![CDATA[>")}]]>`;
}

function contentTag(options: {
  align: 0 | 1 | 2;
  size: 9 | 10;
  bold: boolean;
  start: number;
  length: number;
}): string {
  return `<content Alignment="${options.align}" LeftIndent="${LEFT_INDENT}" RightIndent="${RIGHT_INDENT}" family="Times New Roman" size="${options.size}" bold="${options.bold ? "true" : "false"}" startOffset="${options.start}" length="${options.length}" />`;
}

function cellXml(piece: { start: number; length: number }, align: 0 | 1 | 2, size: 9 | 10, bold: boolean): string {
  const content = contentTag({ align, size, bold, start: piece.start, length: piece.length });
  return `<cell><paragraph Alignment="${align}" LeftIndent="${LEFT_INDENT}" RightIndent="${RIGHT_INDENT}">${content}</paragraph></cell>`;
}

function titleParagraph(piece: { start: number; length: number }): string {
  const content = contentTag({ align: 0, size: 10, bold: true, start: piece.start, length: piece.length });
  return `<paragraph Alignment="0" LeftIndent="${LEFT_INDENT}" RightIndent="${RIGHT_INDENT}">${content}</paragraph>`;
}

function normalizedTable(headers: readonly string[], rows: readonly (readonly string[])[]): {
  headers: string[];
  rows: string[][];
} {
  const width = Math.max(1, headers.length, ...rows.map((row) => row.length));
  return {
    headers: Array.from({ length: width }, (_, index) => headers[index] ?? ""),
    rows: rows.map((row) => Array.from({ length: width }, (_, index) => row[index] ?? "")),
  };
}

export type PreviewUdfModel = {
  xml: string;
  pool: string;
  tableCount: number;
  sectionCount: number;
};

export function buildPreviewUdfModel(sections: readonly PreviewSection[]): PreviewUdfModel {
  const copies = sections.map((section) => ({
    id: section.id,
    title: section.title,
    headers: section.headers.slice(),
    rows: section.rows.map((row) => row.slice()),
    lastRowTone: section.lastRowTone,
  }));
  const pool = { value: "" };
  const push = (visible: string, trailingNewlineOnly = false) => {
    const piece = trailingNewlineOnly ? "\n" : ` ${visible}\n`;
    const start = udfCodePointLength(pool.value);
    pool.value += piece;
    return { start, length: udfCodePointLength(piece) };
  };

  const blocks: string[] = [];
  for (const section of copies) {
    const table = normalizedTable(section.headers, section.rows);
    const cetvel = isFmCetvel(section);
    const size = tablePointSize(table.headers.length, cetvel);
    const spans = columnSpansFor(table.headers, cetvel).join(",");
    blocks.push(titleParagraph(push(section.title)));
    const rowsXml: string[] = [];
    const headerCells = table.headers.map((header, index) =>
      cellXml(push(header), columnAlignFor(header, cetvel, index), size, true),
    );
    rowsXml.push(`<row rowName="row1" rowType="dataRow">${headerCells.join("")}</row>`);
    table.rows.forEach((row, rowIndex) => {
      const last = Boolean(section.lastRowTone) && rowIndex === table.rows.length - 1;
      const cells = row.map((value, index) =>
        cellXml(push(value), columnAlignFor(table.headers[index] ?? "", cetvel, index), size, last),
      );
      rowsXml.push(`<row rowName="row${rowIndex + 2}" rowType="dataRow">${cells.join("")}</row>`);
    });
    blocks.push(
      `<table tableName="Sabit" columnCount="${table.headers.length}" columnSpans="${spans}" border="borderCell">${rowsXml.join("")}</table>`,
    );
  }
  const trailing = push("", true);
  blocks.push(`<paragraph><content startOffset="${trailing.start}" length="${trailing.length}" /></paragraph>`);

  const xml = `<?xml version="1.0" encoding="UTF-8" ?> \n\n<template format_id="1.8" >\n<content>${wrapCdata(pool.value)}</content>${PAGE_PROPERTIES}\n<elements resolver="hvl-default" >\n${blocks.join("")}\n</elements>\n${STYLES}\n</template>\n`;
  return { xml, pool: pool.value, tableCount: copies.length, sectionCount: copies.length };
}

export async function buildPreviewUdf(sections: readonly PreviewSection[]): Promise<Uint8Array> {
  return zipSingleStoredXml("content.xml", buildPreviewUdfModel(sections).xml);
}

export function extractUdfCdata(xml: string): string {
  const parts: string[] = [];
  const pattern = /<!\[CDATA\[([\s\S]*?)\]\]>/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(xml))) parts.push(match[1] ?? "");
  return parts.join("");
}

export function readUdfContentPieces(xml: string): string[] {
  const pool = extractUdfCdata(xml);
  const pieces: string[] = [];
  const pattern = /<content\b([^>]*?)\/>/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(xml))) {
    const attrs = match[1] ?? "";
    const start = Number(/startOffset="(\d+)"/.exec(attrs)?.[1]);
    const length = Number(/length="(\d+)"/.exec(attrs)?.[1]);
    if (!Number.isFinite(start) || !Number.isFinite(length)) throw new Error("UDF ofset okunamadı");
    pieces.push(udfCodePointSlice(pool, start, length));
  }
  return pieces;
}

export function visibleUdfText(piece: string): string {
  if (piece.startsWith(" ") && piece.endsWith("\n")) return piece.slice(1, -1);
  return piece;
}
