/**
 * Resmî A4 dikey Yazdır/PDF çıktısı — yalnızca rapor katmanı.
 * Hesap sonuçlarını değiştirmez; buildCetvelRows / buildOffCetvelSummary kullanır.
 */

import type { PuantajFmResult } from "./model";
import { REPORT_DISCLAIMER } from "./model";
import {
  breakRuleLabel,
  buildCetvelRows,
  buildOffCetvelSummary,
  dateRangeLabel,
  estimatePageCount,
  groupCetvelRowsForPrint,
  todayTR,
  type CetvelRowView,
  type ReportCetvelMeta,
} from "./reportCetvel";
import { formatNumber } from "./format";

export type ReportMeta = ReportCetvelMeta;

function esc(s: string): string {
  return (s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function theadHtml(): string {
  return `<thead><tr>
    <th>Dönem</th>
    <th>Tarih</th>
    <th>Gün</th>
    <th>Aylık Puantaja<br/>Göre Çalışılan<br/>Saat</th>
    <th>Ara<br/>Dinlenme</th>
    <th>Aylık Puantaja<br/>Göre Çalışılan<br/>Net Saat</th>
    <th>11 Saati Aşan<br/>Günlük<br/>Fazla Mesai</th>
    <th>45 Saati Aşan<br/>Haftalık<br/>Fazla Mesai</th>
    <th>Bayram<br/>Günleri</th>
    <th>Bayram Günü<br/>Tam/Yarım</th>
    <th>Bayram<br/>Çalışması<br/>Var/Yok</th>
    <th>Bayram<br/>Çalışması</th>
  </tr></thead>`;
}

function dayRowHtml(r: CetvelRowView): string {
  const cls = r.keepWithNext ? ' class="keep-with-next"' : "";
  return `<tr${cls}>
    <td>${esc(r.donem)}</td>
    <td>${esc(r.tarih)}</td>
    <td>${esc(r.gun)}</td>
    <td class="c-saat">${esc(r.calisilanSaat)}</td>
    <td class="num">${esc(r.araDinlenme)}</td>
    <td class="num">${esc(r.netSaat)}</td>
    <td class="num">${esc(r.gunluk11Asim)}</td>
    <td class="num">${esc(r.haftalik45Asim)}</td>
    <td>${esc(r.bayramGunleri)}</td>
    <td>${esc(r.bayramTamYarim)}</td>
    <td>${esc(r.bayramCalismaVarYok)}</td>
    <td class="num">${esc(r.bayramCalismasi)}</td>
  </tr>`;
}

function weekTotalRowHtml(r: CetvelRowView): string {
  const title = esc(r.weekLabelTitle ?? "HAFTALIK TOPLAM");
  const range = esc(r.weekLabelRange ?? "");
  return `<tr class="week-total keep-with-prev">
    <td colspan="5" class="week-label"><b>${title}</b> - ${range}</td>
    <td class="num">${esc(r.netSaat)}</td>
    <td class="num">${esc(r.gunluk11Asim)}</td>
    <td class="num">${esc(r.haftalik45Asim)}</td>
    <td></td>
    <td></td>
    <td></td>
    <td class="num">${esc(r.bayramCalismasi)}</td>
  </tr>`;
}

function rowHtml(r: CetvelRowView): string {
  return r.kind === "weekTotal" ? weekTotalRowHtml(r) : dayRowHtml(r);
}

function tbodyHtml(rows: CetvelRowView[]): string {
  const groups = groupCetvelRowsForPrint(rows);
  return groups
    .map((g) => {
      const cls = g.some((r) => r.kind === "weekTotal") ? ' class="week-end"' : "";
      return `<tbody${cls}>${g.map(rowHtml).join("")}</tbody>`;
    })
    .join("");
}

function headerBlock(result: PuantajFmResult, meta: ReportMeta): string {
  return `
  <table class="info">
    <tr>
      <td><b>Personel</b><br/>${esc(result.personelAdSoyad)}</td>
      <td><b>Bölüm</b><br/>${esc(result.birim || "—")}</td>
      <td><b>Pozisyon</b><br/>${esc(result.pozisyon || "—")}</td>
      <td><b>Hesaplama Tarih Aralığı</b><br/>${esc(dateRangeLabel(result, meta.settings))}</td>
    </tr>
    <tr>
      <td><b>Kaynak Dosya</b><br/>${esc(meta.fileName || "—")}</td>
      <td><b>Hesaplama Tarihi</b><br/>${esc(todayTR())}</td>
      <td><b>Haftalık Yasal Sınır</b><br/>${formatNumber(meta.settings.weeklyLimit, 1)} saat</td>
      <td><b>Ara Dinlenme Kuralı</b><br/>${esc(breakRuleLabel(meta.settings))}</td>
    </tr>
    <tr>
      <td colspan="4"><b>Katsayı</b><br/>${formatNumber(meta.katsayi, 2)}</td>
    </tr>
  </table>`;
}

function summaryHtml(result: PuantajFmResult): string {
  const s = buildOffCetvelSummary(result);
  return `
  <table class="summary">
    <tr><td>Hesaplanan toplam fazla mesai</td><td>${esc(s.hesaplananToplamFm)}</td></tr>
    <tr><td>Açık OFF günleri</td><td>${s.acikOffGun}</td></tr>
    <tr><td>Kullanıcı tarafından OFF kabul edilen Fazla Mesai İzni günleri</td><td>${s.kullaniciOffGun}</td></tr>
    <tr><td>Toplam mahsup günü</td><td>${s.toplamMahsupGun}</td></tr>
    <tr><td>OFF gün karşılığı</td><td>${esc(s.offGunKarsiligi)}</td></tr>
    <tr><td>Toplam OFF mahsubu</td><td>${esc(s.toplamOffMahsup)}</td></tr>
    <tr><td>Mahsup sonrası fazla mesai</td><td>${esc(s.mahsupSonrasiFm)}</td></tr>
    <tr><td>Hakkaniyet indirimi</td><td>${esc(s.hakkaniyetIndirimi)}</td></tr>
    <tr class="grand"><td>Nihai sonuç</td><td>${esc(s.nihaiSonuc)}</td></tr>
  </table>`;
}

function resultHtml(result: PuantajFmResult, meta: ReportMeta): string {
  const rows = buildCetvelRows(result);
  const pagesEst = estimatePageCount(rows.length);
  return `
  <section class="person">
    <h1>PUANTAJ KAYITLARINA GÖRE FAZLA MESAİ HESAP CETVELİ</h1>
    ${headerBlock(result, meta)}
    <table class="cetvel">
      ${theadHtml()}
      ${tbodyHtml(rows)}
    </table>
    <h2 class="sum-title">Hesap Özeti</h2>
    ${summaryHtml(result)}
    <div class="sign">
      <div>Tarih: ${esc(todayTR())}</div>
      <div>Bilirkişi İmza / Kaşe</div>
    </div>
    <p class="meta-note">Yaklaşık sayfa (yoğunluk tahmini): ${pagesEst} · Satır: ${rows.length}</p>
  </section>`;
}

const PRINT_CSS = `
  @page {
    size: A4 portrait;
    margin: 6mm;
    @bottom-center {
      content: "Sayfa " counter(page) " / " counter(pages);
      font-family: "Times New Roman", Times, serif;
      font-size: 5.5pt;
      color: #222;
    }
  }
  * { box-sizing: border-box; }
  html, body {
    margin: 0;
    padding: 0;
    color: #000;
    background: #fff;
    font-family: "Times New Roman", Times, "Liberation Serif", serif;
    font-size: 6.2pt;
    line-height: 1.15;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  h1 {
    margin: 0 0 2mm;
    font-size: 8.5pt;
    font-weight: 700;
    text-align: center;
    letter-spacing: 0.02em;
    text-transform: uppercase;
  }
  h2.sum-title {
    margin: 2.5mm 0 1mm;
    font-size: 7pt;
    font-weight: 700;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
  }
  table.info {
    margin-bottom: 2mm;
  }
  table.info td {
    border: 0.3pt solid #333;
    padding: 0.6mm 1mm;
    vertical-align: top;
    width: 25%;
    font-size: 5.9pt;
  }
  table.info b { font-size: 5.5pt; }
  table.cetvel thead { display: table-header-group; }
  table.cetvel tbody { display: table-row-group; }
  table.cetvel tr { page-break-inside: avoid; break-inside: avoid; }
  table.cetvel tbody.week-end {
    page-break-inside: avoid;
    break-inside: avoid;
  }
  table.cetvel tr.keep-with-next {
    page-break-after: avoid;
    break-after: avoid;
  }
  table.cetvel tr.keep-with-prev,
  table.cetvel tr.week-total {
    page-break-before: avoid;
    break-before: avoid;
  }
  table.cetvel th, table.cetvel td {
    border: 0.3pt solid #222;
    padding: 0.35mm 0.45mm;
    vertical-align: middle;
    text-align: center;
    font-size: 5.8pt;
    word-wrap: break-word;
    overflow-wrap: anywhere;
  }
  table.cetvel th {
    font-weight: 700;
    background: #ececec;
    line-height: 1.1;
  }
  table.cetvel td.c-saat { text-align: left; padding-left: 0.6mm; white-space: nowrap; }
  table.cetvel td.num { font-variant-numeric: tabular-nums; }
  table.cetvel tr.week-total td {
    background: #eeeeee;
    border-top: 0.7pt solid #111;
    border-bottom: 0.7pt solid #111;
    font-weight: 600;
    padding-top: 0.55mm;
    padding-bottom: 0.55mm;
  }
  table.cetvel tr.week-total td.week-label {
    text-align: left;
    padding-left: 0.8mm;
    font-weight: 400;
  }
  table.cetvel tr.week-total td.week-label b {
    font-weight: 700;
  }
  table.summary {
    width: 70%;
    margin-top: 1mm;
  }
  table.summary td {
    border: 0.3pt solid #333;
    padding: 0.7mm 1.2mm;
    font-size: 6.2pt;
  }
  table.summary td:last-child {
    text-align: right;
    font-weight: 600;
    width: 28%;
    white-space: nowrap;
  }
  table.summary tr.grand td {
    font-weight: 700;
    background: #f0f0f0;
  }
  .sign {
    margin-top: 6mm;
    display: flex;
    justify-content: space-between;
    gap: 10mm;
    font-size: 6.5pt;
  }
  .sign > div {
    flex: 1;
    border-top: 0.3pt solid #000;
    padding-top: 1.5mm;
    min-height: 12mm;
  }
  .meta-note { font-size: 5pt; color: #555; margin-top: 2mm; }
  .disclaimer {
    margin-top: 3mm;
    font-size: 5.2pt;
    border-top: 0.3pt solid #999;
    padding-top: 1mm;
  }
  @media print {
    .no-print { display: none !important; }
    body { margin: 0; }
  }
`;

export function buildReportHtml(results: PuantajFmResult[], meta: ReportMeta): string {
  const body = results.map((r) => resultHtml(r, meta)).join('<div style="page-break-after:always"></div>');
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"/>
  <title>Puantaj Fazla Mesai Hesap Cetveli</title>
  <style>${PRINT_CSS}</style>
  </head>
  <body>
    ${body}
    <p class="disclaimer">${esc(REPORT_DISCLAIMER)}</p>
  </body></html>`;
}

/** Raporu yeni pencerede açıp yazdırır (tamamen lokal; ağ isteği yok). */
export function printReport(results: PuantajFmResult[], meta: ReportMeta): void {
  const html = buildReportHtml(results, meta);
  const win = window.open("", "_blank", "width=900,height=1100");
  if (!win) return;
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 350);
}

export { estimatePageCount, buildCetvelRows, buildOffCetvelSummary };
