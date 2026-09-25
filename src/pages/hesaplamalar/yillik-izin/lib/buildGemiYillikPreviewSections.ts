import type { PreviewSection } from "@/components/calculation-preview";
import { calculateDaysBetween, formatTotalWorkDays } from "./gemiCore";
import { formatDateTR } from "./dates";
import { formatMoney, parseNum } from "./money";
import type { GemiWorkPeriod, UsedLeaveRow } from "./types";
import type { computeYillikGemiResult } from "../gemi/engine";
import type { YillikGemiForm } from "../gemi/model";

function validUsedRows(rows: UsedLeaveRow[]) {
  return rows.filter((r) => r.start || r.end || String(r.days ?? "").trim().length > 0);
}

function workPeriodsSummary(periods: GemiWorkPeriod[]) {
  return periods
    .filter((wp) => wp.iseGiris && wp.istenCikis)
    .map((wp) => ({
      start: formatDateTR(wp.iseGiris),
      end: formatDateTR(wp.istenCikis),
      days: wp.gunSayisi ?? calculateDaysBetween(wp.iseGiris, wp.istenCikis),
    }));
}

export function buildGemiYillikPreviewSections(opts: {
  form: YillikGemiForm;
  result: ReturnType<typeof computeYillikGemiResult>;
}): PreviewSection[] {
  const { form, result } = opts;
  const brutVal = parseNum(form.brut);
  const employerPayment =
    Number(String(form.employerPayment ?? "").replace(/\./g, "").replace(",", ".")) || 0;
  const mahsupBrut = Math.max(0, Math.round((result.brutIzin - employerPayment) * 100) / 100);
  const gvLabel = result.gelirVergisiDilimleri
    ? `Gelir Vergisi ${result.gelirVergisiDilimleri}`
    : "Gelir Vergisi";
  const firstPeriod = form.workPeriods[0];
  const lastPeriod = form.workPeriods[form.workPeriods.length - 1];
  const breakdown = result.breakdown;

  const sections: PreviewSection[] = [
    {
      id: "genel-bilgiler",
      title: "Genel Bilgiler",
      headers: ["Alan", "Değer"],
      rows: [
        ["İşe Giriş Tarihi", formatDateTR(firstPeriod?.iseGiris ?? "")],
        ["İşten Çıkış Tarihi", formatDateTR(lastPeriod?.istenCikis ?? "")],
        ["Çıplak Brüt Ücret", brutVal > 0 ? `${formatMoney(brutVal)} ₺` : "—"],
        ["Toplam Çalışma Süresi", formatTotalWorkDays(result.totalWorkDays)],
      ],
    },
  ];

  const periodRows = workPeriodsSummary(form.workPeriods);
  if (periodRows.length > 0) {
    sections.push({
      id: "calisma-donemleri",
      title: "Çalışma Dönemleri",
      headers: ["Başlangıç", "Bitiş", "Gün Sayısı"],
      rows: periodRows.map((wp) => [wp.start, wp.end, `${wp.days} gün`]),
    });
  }

  const hakRows: string[][] = [];
  if (breakdown.y1 > 0 && breakdown.d1 > 0) {
    hakRows.push([
      `${breakdown.y1} yıl (İlk dönem - 15 gün/yıl)`,
      `${breakdown.y1} yıl × 15 gün = ${breakdown.d1} gün`,
    ]);
  }
  if (breakdown.y2 > 0 && breakdown.d2 > 0) {
    hakRows.push([
      `${breakdown.y2} yıl (Sonraki dönem - 30 gün/yıl)`,
      `${breakdown.y2} yıl × 30 gün = ${breakdown.d2} gün`,
    ]);
  }
  hakRows.push(["Toplam Hak Edilen", `${breakdown.total} gün`]);
  sections.push({
    id: "yillik-izin-hak-edisi",
    title: "Yıllık İzin Hak Edişi (Gemi Adamları)",
    headers: ["Dönem", "Gün Sayısı"],
    rows: hakRows,
    lastRowTone: "blue",
  });

  const usedRows = validUsedRows(form.usedRows);
  if (usedRows.length > 0) {
    sections.push({
      id: "kullanilan-izinler",
      title: "Kullanılan İzinler",
      headers: ["Başlangıç Tarihi", "Bitiş Tarihi", "Gün Sayısı"],
      rows: [
        ...usedRows.map((r) => [formatDateTR(r.start), formatDateTR(r.end), `${r.days || "0"} gün`]),
        ["Toplam Kullanılan", "", `${result.usedTotal} gün`],
      ],
      lastRowTone: "blue",
    });
  }

  sections.push(
    {
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
    },
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
