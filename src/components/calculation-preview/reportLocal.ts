/**
 * Ortak lokal önizleme yardımcıları.
 * Clipboard / yazdırma / PDF (tarayıcı yazdır → PDF kaydet); network yok.
 */

/** Word yapıştırmada tüm tablolar aynı dış ölçü (A4 kullanılabilir alan ≈ 16–17 cm). */
const WORD_TABLE_WIDTH_PX = 650;

function cleanTableForWord(table: HTMLTableElement): HTMLTableElement {
  const clone = table.cloneNode(true) as HTMLTableElement;
  clone.querySelectorAll("*").forEach((el) => {
    el.removeAttribute("style");
    el.removeAttribute("class");
  });
  clone.removeAttribute("class");
  clone.setAttribute("border", "1");
  clone.setAttribute("cellpadding", "2");
  clone.setAttribute("cellspacing", "0");
  clone.setAttribute("width", String(WORD_TABLE_WIDTH_PX));
  clone.style.cssText = `width:${WORD_TABLE_WIDTH_PX}px;max-width:${WORD_TABLE_WIDTH_PX}px;border-collapse:collapse;table-layout:fixed;`;

  const firstRow = clone.querySelector("tr");
  if (firstRow) {
    const cells = Array.from(firstRow.querySelectorAll("th, td"));
    const n = cells.length;
    if (n === 2) {
      cells[0]?.setAttribute("width", "62%");
      cells[1]?.setAttribute("width", "38%");
    } else if (n === 3) {
      cells.forEach((c) => c.setAttribute("width", "33%"));
    } else if (n > 1) {
      const pct = Math.floor(100 / n);
      cells.forEach((c, i) => c.setAttribute("width", i === n - 1 ? `${100 - pct * (n - 1)}%` : `${pct}%`));
    } else if (n === 1) {
      cells[0]?.setAttribute("width", "100%");
    }
  }

  clone.querySelectorAll("tr").forEach((tr) => {
    const cells = tr.querySelectorAll("th, td");
    if (cells.length > 1) {
      const last = cells[cells.length - 1] as HTMLElement;
      last.style.textAlign = "right";
    }
  });

  return clone;
}

function tablesHtmlForWord(tables: HTMLTableElement[]): string {
  const parts = tables.map((t) => cleanTableForWord(t).outerHTML);
  /* Sabit genişlikli sarmalayıcı — Word bazı sürümlerde tabloyu shrink-wrap eder; dış kutu sabitlemeye yardım eder. */
  return `<div style="width:${WORD_TABLE_WIDTH_PX}px;max-width:${WORD_TABLE_WIDTH_PX}px;">${parts.join("<p>&nbsp;</p>")}</div>`;
}

export async function copyAllTablesForWord(containerId: string): Promise<boolean> {
  try {
    const container = document.getElementById(containerId);
    if (!container) return false;
    const tables = container.querySelectorAll("table");
    if (!tables.length) return false;
    const html = tablesHtmlForWord(Array.from(tables) as HTMLTableElement[]);
    await navigator.clipboard.write([
      new ClipboardItem({
        "text/html": new Blob([html], { type: "text/html" }),
      }),
    ]);
    return true;
  } catch {
    return false;
  }
}

export async function copySectionTableForWord(sectionId: string): Promise<boolean> {
  try {
    const section = document.querySelector(`[data-section="${sectionId}"] .section-content`);
    if (!section) return false;
    const table = section.querySelector("table");
    if (!table) return false;
    const html = tablesHtmlForWord([table as HTMLTableElement]);
    await navigator.clipboard.write([
      new ClipboardItem({
        "text/html": new Blob([html], { type: "text/html" }),
      }),
    ]);
    return true;
  } catch {
    return false;
  }
}

const PRINT_CSS = `
  body { font-family: system-ui, -apple-system, Segoe UI, sans-serif; color: #111; margin: 1.25rem; font-size: 11px; }
  h1 { font-size: 14px; margin: 0 0 1rem; }
  .section { margin-bottom: 1rem; page-break-inside: avoid; break-inside: avoid; }
  .section-title { color: #4338ca; font-size: 12px; font-weight: 600; margin: 0 0 0.35rem; }
  table { width: 100%; border-collapse: collapse; border: 1px solid #999; font-size: 10px; }
  th, td { border: 1px solid #999; padding: 5px 8px; }
  th { background: #f3f4f6; font-weight: 600; text-align: left; }
  td:last-child, th:last-child { text-align: right; }
  tr.row-blue td { background: #dbeafe; font-weight: 600; }
  tr.row-green td { background: #dcfce7; font-weight: 600; color: #16a34a; }
  td.neg { color: #dc2626; }
  td.pos { color: #16a34a; }
  button, .copy-icon-btn, .toolbar, svg { display: none !important; }
`;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Yazdır / PDF için temiz HTML — kopya ikonları ve modal sınıfları yok.
 */
export type PrintSection = {
  id: string;
  title: string;
  headers: string[];
  rows: string[][];
  lastRowTone?: "blue" | "green";
};

export function buildSingleSectionHtml(
  section: PrintSection,
  options?: { showTitle?: boolean },
): string {
  const showTitle = options?.showTitle !== false;
  const head =
    section.headers.length > 0
      ? `<thead><tr>${section.headers.map((h) => `<th scope="col">${escapeHtml(h)}</th>`).join("")}</tr></thead>`
      : "";
  const body = section.rows
    .map((row, i) => {
      const isLast = i === section.rows.length - 1;
      const rowClass =
        isLast && section.lastRowTone === "blue"
          ? ' class="row-blue"'
          : isLast && section.lastRowTone === "green"
            ? ' class="row-green"'
            : "";
      const cells = row
        .map((cell, ci) => {
          const trimmed = cell.trimStart();
          const cellClass =
            trimmed.startsWith("-")
              ? ' class="neg"'
              : trimmed.startsWith("+") ||
                  (isLast && section.lastRowTone === "green" && ci === row.length - 1)
                ? ' class="pos"'
                : "";
          return `<td${cellClass}>${escapeHtml(cell)}</td>`;
        })
        .join("");
      return `<tr${rowClass}>${cells}</tr>`;
    })
    .join("");
  const titleHtml = showTitle
    ? `<div class="section-title">${escapeHtml(section.title)}</div>`
    : "";
  return `<div class="section">${titleHtml}<table>${head}<tbody>${body}</tbody></table></div>`;
}

export function buildPrintHtmlFromSections(sections: PrintSection[]): string {
  return sections.map((section) => buildSingleSectionHtml(section)).join("");
}

export function openPrintWindow(title: string, contentHtml: string): boolean {
  const win = window.open("", "_blank", "width=900,height=700");
  if (!win) return false;
  const safeTitle = title.replace(/[<>&"]/g, "");
  /* DOM'dan gelen HTML olsa bile kopya butonlarını çıkar */
  const cleaned = contentHtml.replace(/<button\b[^>]*>[\s\S]*?<\/button>/gi, "");
  win.document.write(`<!doctype html><html lang="tr"><head><meta charset="utf-8"/><title>${safeTitle}</title>
<style>${PRINT_CSS}</style></head><body><h1>${safeTitle}</h1>${cleaned}</body></html>`);
  win.document.close();
  win.focus();
  window.setTimeout(() => {
    win.print();
  }, 250);
  return true;
}
