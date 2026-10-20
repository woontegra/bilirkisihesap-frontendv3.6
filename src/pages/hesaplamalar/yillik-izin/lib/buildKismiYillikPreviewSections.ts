import type { PreviewSection } from "@/components/calculation-preview";
import type { Breakdown } from "./core";
import { formatDateTR } from "./dates";
import { formatMoney, parseNum } from "./money";
import type { StandardComputeResult, UsedLeaveRow } from "./types";
import type { YillikKismiForm } from "../kismi/model";

const EMPTY_BREAKDOWN: Breakdown = {
  y1: 0,
  y2: 0,
  y3: 0,
  d1: 0,
  d2: 0,
  d3: 0,
  total: 0,
  daysPerYear1: 14,
  daysPerYear2: 20,
  daysPerYear3: 26,
};

function validUsedRows(rows: UsedLeaveRow[]) {
  return rows.filter((r) => r.start && r.end && String(r.days ?? "").trim().length > 0);
}

export function buildKismiYillikPreviewSections(opts: {
  form: YillikKismiForm;
  result: StandardComputeResult;
}): PreviewSection[] {
  const { form, result } = opts;
  const breakdown = result.breakdown ?? EMPTY_BREAKDOWN;
  const dp1 = breakdown.daysPerYear1 ?? 14;
  const dp2 = breakdown.daysPerYear2 ?? 20;
  const dp3 = breakdown.daysPerYear3 ?? 26;
  const brutVal = parseNum(form.brut);
  const employerPayment =
    Number(String(form.employerPayment ?? "").replace(/\./g, "").replace(",", ".")) || 0;
  const mahsupBrut = Math.max(0, Math.round((result.brutIzin - employerPayment) * 100) / 100);
  const gvLabel = result.gelirVergisiDilimleri
    ? `Gelir Vergisi ${result.gelirVergisiDilimleri}`
    : "Gelir Vergisi";

  const periodRows = form.workPeriods
    .filter((wp) => wp.iseGiris && wp.istenCikis)
    .map((wp) => [formatDateTR(wp.iseGiris), formatDateTR(wp.istenCikis)]);

  const sections: PreviewSection[] = [
    {
      id: "genel-bilgiler",
      title: "Genel Bilgiler",
      headers: ["Alan", "Değer"],
      rows: [
        ["Çalışma Süresi", result.workPeriodLabel || "—"],
        ["Brüt Ücret", brutVal > 0 ? `${formatMoney(brutVal)} ₺` : "—"],
      ],
    },
  ];

  if (periodRows.length > 0) {
    sections.push({
      id: "calisma-donemleri-kismi",
      title: "Çalışma Dönemleri (Kısmi Süreli / Part Time)",
      headers: ["Başlangıç", "Bitiş"],
      rows: periodRows,
    });
  }

  sections.push({
    id: "yillik-ucretli-izin-hesaplama",
    title: "Yıllık Ücretli İzin Hesaplama",
    headers: ["Alan", "Değer"],
    rows: [
      ["Kalan İzin Süresi", `${result.remainingDays} gün`],
      [
        "Günlük Ücret (Toplam/30)",
        brutVal > 0 && result.remainingDays > 0
          ? `(${formatMoney(brutVal)} ₺ / 30 × ${result.remainingDays} gün)`
          : "—",
      ],
      ["Yıllık Ücretli İzin Alacağı", `${formatMoney(result.brutIzin)} ₺`],
    ],
    lastRowTone: "blue",
  });

  const hakRows: string[][] = [];
  if (breakdown.y1 > 0 && breakdown.d1 > 0) {
    hakRows.push([
      `${breakdown.y1} yıl (1-5 yıl)`,
      `${breakdown.y1} yıl × ${dp1} gün = ${breakdown.d1} gün`,
    ]);
  }
  if (breakdown.y2 > 0 && breakdown.d2 > 0) {
    hakRows.push([
      `${breakdown.y2} yıl (5-15 yıl)`,
      `${breakdown.y2} yıl × ${dp2} gün = ${breakdown.d2} gün`,
    ]);
  }
  if (breakdown.y3 > 0 && breakdown.d3 > 0) {
    hakRows.push([
      `${breakdown.y3} yıl (15+ yıl)`,
      `${breakdown.y3} yıl × ${dp3} gün = ${breakdown.d3} gün`,
    ]);
  }
  hakRows.push(["Toplam Hak Edilen", `${breakdown.total} gün`]);
  hakRows.push(["Kullanılan İzin", `${result.usedTotal} gün`]);
  hakRows.push(["Kalan İzin", `${result.remainingDays} gün`]);

  sections.push({
    id: "yillik-izin-hak-edisi",
    title: "Yıllık İzin Hak Edişi (Kısmi Süreli / Part Time)",
    headers: ["Dönem", "Gün Sayısı"],
    rows: hakRows,
    lastRowTone: "green",
  });

  const usedRows = validUsedRows(form.usedRows);
  if (usedRows.length > 0) {
    sections.push({
      id: "kullanilan-izinler",
      title: "Dışlanabilir Yıllar (Kullanılan İzinler)",
      headers: ["Başlangıç Tarihi", "Bitiş Tarihi", "Gün Sayısı"],
      rows: [
        ...usedRows.map((r) => [formatDateTR(r.start), formatDateTR(r.end), `${r.days} gün`]),
        ["Toplam Kullanılan", "", `${result.usedTotal} gün`],
      ],
      lastRowTone: "blue",
    });
  }

  sections.push(
    {
      id: "brutten-nete",
      title: "Brüt'ten Net'e Çeviri",
      headers: ["Kalem", "Tutar"],
      rows: [
        ["Brüt Yıllık İzin Alacağı", `${formatMoney(result.brutIzin)} ₺`],
        ["SGK İşçi Primi (%14)", `-${formatMoney(result.sgk)} ₺`],
        ["İşsizlik Sigortası Primi (%1)", `-${formatMoney(result.issizlik)} ₺`],
        [gvLabel, `-${formatMoney(result.gelirVergisi)} ₺`],
        ["Damga Vergisi (Binde 7,59)", `-${formatMoney(result.damgaVergisi)} ₺`],
        ["Net Yıllık İzin Alacağı", `${formatMoney(result.netIzin)} ₺`],
      ],
      lastRowTone: "green",
    },
    {
      id: "mahsuplasma",
      title: "Mahsuplaşma",
      headers: ["Kalem", "Tutar"],
      rows: [
        ["Brüt Yıllık İzin Alacağı", `${formatMoney(result.brutIzin)} ₺`],
        ["İşveren Ödemesi", `-${formatMoney(employerPayment)} ₺`],
        ["Mahsuplaşma Sonucu", `${formatMoney(mahsupBrut)} ₺`],
      ],
      lastRowTone: "green",
    },
  );

  return sections;
}
