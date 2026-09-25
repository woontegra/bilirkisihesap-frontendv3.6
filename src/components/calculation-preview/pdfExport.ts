import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { buildSingleSectionHtml, type PrintSection } from "./reportLocal";
import type { PreviewSection } from "./types";

const PDF_CSS = `
  body { margin: 0; padding: 0; font-family: system-ui, -apple-system, Segoe UI, sans-serif; color: #111; font-size: 11px; }
  h1 { font-size: 14px; margin: 0 0 1rem; }
  .section { margin-bottom: 0; page-break-inside: avoid; break-inside: avoid; }
  .section-title { color: #4338ca; font-size: 12px; font-weight: 600; margin: 0 0 0.35rem; }
  table { width: 100%; border-collapse: collapse; border: 1px solid #999; font-size: 10px; }
  th, td { border: 1px solid #999; padding: 5px 8px; }
  th { background: #f3f4f6; font-weight: 600; text-align: left; }
  td:last-child, th:last-child { text-align: right; }
  tr.row-blue td { background: #dbeafe; font-weight: 600; }
  tr.row-green td { background: #dcfce7; font-weight: 600; color: #16a34a; }
  td.neg { color: #dc2626; }
  td.pos { color: #16a34a; }
`;

const PAGE_WIDTH_MM = 210;
const PAGE_HEIGHT_MM = 297;
const MARGIN_MM = 10;
const SECTION_GAP_MM = 4;
const USABLE_WIDTH_MM = PAGE_WIDTH_MM - MARGIN_MM * 2;
const USABLE_HEIGHT_MM = PAGE_HEIGHT_MM - MARGIN_MM * 2;
const HOST_WIDTH_PX = 850;
const CANVAS_SCALE = 2;

type MeasuredBlock = { dataUrl: string; heightMm: number };

function slugifyFileName(title: string): string {
  return title
    .replace(/[^\p{L}\p{N}]+/gu, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 80);
}

function escapeTitle(title: string): string {
  return title.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function measureHtmlBlock(host: HTMLDivElement, innerHtml: string): Promise<MeasuredBlock> {
  host.innerHTML = `<style>${PDF_CSS}</style>${innerHtml}`;
  await new Promise((r) => window.setTimeout(r, 30));
  const canvas = await html2canvas(host, {
    scale: CANVAS_SCALE,
    useCORS: true,
    backgroundColor: "#ffffff",
    logging: false,
    width: host.scrollWidth,
    height: host.scrollHeight,
  });
  const ratio = canvas.width / USABLE_WIDTH_MM;
  const heightMm = canvas.height / ratio;
  return { dataUrl: canvas.toDataURL("image/png"), heightMm };
}

function toPrintSection(section: PreviewSection): PrintSection {
  return {
    id: section.id,
    title: section.title,
    headers: section.headers,
    rows: section.rows,
    lastRowTone: section.lastRowTone,
  };
}

async function estimateRowsPerPage(
  host: HTMLDivElement,
  section: PrintSection,
): Promise<number> {
  if (section.rows.length <= 1) return 1;

  const oneRow = await measureHtmlBlock(
    host,
    buildSingleSectionHtml({ ...section, rows: section.rows.slice(0, 1), lastRowTone: undefined }),
  );
  const twoRows = await measureHtmlBlock(
    host,
    buildSingleSectionHtml({ ...section, rows: section.rows.slice(0, 2), lastRowTone: undefined }),
  );

  const rowHeightMm = Math.max(2, twoRows.heightMm - oneRow.heightMm);
  const overheadMm = oneRow.heightMm - rowHeightMm;
  const rowsPerPage = Math.max(1, Math.floor((USABLE_HEIGHT_MM - overheadMm) / rowHeightMm));

  return Math.min(rowsPerPage, section.rows.length);
}

async function buildSectionHtmlChunks(
  host: HTMLDivElement,
  section: PrintSection,
): Promise<string[]> {
  const full = await measureHtmlBlock(host, buildSingleSectionHtml(section));
  if (full.heightMm <= USABLE_HEIGHT_MM) {
    return [buildSingleSectionHtml(section)];
  }

  if (section.rows.length === 0) {
    return [buildSingleSectionHtml(section)];
  }

  let rowsPerPage = await estimateRowsPerPage(host, section);
  const chunks: string[] = [];
  let start = 0;

  while (start < section.rows.length) {
    let count = Math.min(rowsPerPage, section.rows.length - start);
    let html = "";
    let measured: MeasuredBlock | null = null;

    while (count > 0) {
      const end = start + count;
      const isFinal = end >= section.rows.length;
      const chunkSection: PrintSection = {
        ...section,
        title: start === 0 ? section.title : `${section.title} (devam)`,
        rows: section.rows.slice(start, end),
        lastRowTone: isFinal ? section.lastRowTone : undefined,
      };
      html = buildSingleSectionHtml(chunkSection);
      measured = await measureHtmlBlock(host, html);
      if (measured.heightMm <= USABLE_HEIGHT_MM) break;
      count = Math.floor(count / 2);
    }

    if (count <= 0) {
      const singleRowSection: PrintSection = {
        ...section,
        title: start === 0 ? section.title : `${section.title} (devam)`,
        rows: section.rows.slice(start, start + 1),
        lastRowTone: start + 1 >= section.rows.length ? section.lastRowTone : undefined,
      };
      chunks.push(buildSingleSectionHtml(singleRowSection));
      start += 1;
      continue;
    }

    chunks.push(html);
    start += count;
  }

  return chunks;
}

/**
 * Önizleme bölümlerinden PDF indirir.
 * Her bölüm/tablo sayfa sınırında bölünmez; sığmazsa tamamı sonraki sayfadan başlar.
 * Çok uzun tablolar satır gruplarına ayrılır (başlık her sayfada tekrarlanır).
 */
export async function downloadPreviewPdf(
  title: string,
  sections: PreviewSection[],
  fileName?: string,
): Promise<void> {
  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  host.style.cssText = `position:fixed;left:-10000px;top:0;width:${HOST_WIDTH_PX}px;padding:20px;box-sizing:border-box;background:#fff;z-index:-1;`;
  document.body.appendChild(host);

  try {
    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    let y = MARGIN_MM;

    const placeBlock = (block: MeasuredBlock) => {
      const pageBottom = PAGE_HEIGHT_MM - MARGIN_MM;
      if (y + block.heightMm > pageBottom && y > MARGIN_MM) {
        pdf.addPage();
        y = MARGIN_MM;
      }
      pdf.addImage(block.dataUrl, "PNG", MARGIN_MM, y, USABLE_WIDTH_MM, block.heightMm);
      y += block.heightMm + SECTION_GAP_MM;
    };

    const titleBlock = await measureHtmlBlock(host, `<h1>${escapeTitle(title)}</h1>`);
    placeBlock(titleBlock);

    for (const section of sections) {
      const printSection = toPrintSection(section);
      const htmlChunks = await buildSectionHtmlChunks(host, printSection);
      for (const html of htmlChunks) {
        const block = await measureHtmlBlock(host, html);
        placeBlock(block);
      }
    }

    const date = new Date().toISOString().slice(0, 10);
    pdf.save(fileName || `${slugifyFileName(title)}_${date}.pdf`);
  } finally {
    host.remove();
  }
}
