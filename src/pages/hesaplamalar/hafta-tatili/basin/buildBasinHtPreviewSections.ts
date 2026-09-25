import type { PreviewSection } from "@/components/calculation-preview";
import { formatDateTR, formatMoney } from "../lib/money";
import type { ExcludedDay } from "../lib/types";
import type { HaftaTatiliComputeResult } from "../lib/HaftaTatiliCalcPage";
import type { BasinForm } from "./model";
import { weekDayMultiplier } from "./model";

function parseSettleNum(settleAmount: string): number {
  return (
    Number(
      String(settleAmount ?? "")
        .replace(/\./g, "")
        .replace(",", ".")
        .replace("₺", "")
        .trim(),
    ) || 0
  );
}

export function buildBasinHtPreviewSections(opts: {
  form: BasinForm;
  result: HaftaTatiliComputeResult;
  daily50Header?: string;
}): PreviewSection[] {
  const { form, result } = opts;
  const mult = weekDayMultiplier(form);
  const daily50Header =
    opts.daily50Header ?? (mult === 2 ? "Günlük %50 Zamlı (×2)" : "Günlük %50 Zamlı");
  const sections: PreviewSection[] = [];

  const valid = form.dateRanges.filter((r) => r.start && r.end);
  if (valid.length > 0) {
    const starts = valid.map((r) => new Date(r.start).getTime());
    const ends = valid.map((r) => new Date(r.end).getTime());
    const infoRows: string[][] = [
      ["İşe Giriş", formatDateTR(new Date(Math.min(...starts)).toISOString().slice(0, 10))],
      ["İşten Çıkış", formatDateTR(new Date(Math.max(...ends)).toISOString().slice(0, 10))],
      [
        "Sürekli Gece Çalışanı",
        form.geceCalisan ? "Evet (Haftada 2 gün)" : "Hayır (Haftada 1 gün)",
      ],
    ];
    if (form.expiryStart) {
      infoRows.push(["Zamanaşımı Başlangıcı", formatDateTR(form.expiryStart)]);
    }
    sections.push({
      id: "genel-bilgiler",
      title: "Genel Bilgiler",
      headers: ["Alan", "Değer"],
      rows: infoRows,
    });
  }

  const excluded = form.excludedDays.filter((d) => d.start && d.end);
  if (excluded.length > 0) {
    sections.push({
      id: "dislanabilir-gunler",
      title: "Dışlanabilir Günler",
      headers: ["Tür", "Başlangıç", "Bitiş", "Gün"],
      rows: excluded.map((d: ExcludedDay) => [
        d.type || "Diğer",
        d.start ? formatDateTR(d.start) : "—",
        d.end ? formatDateTR(d.end) : "—",
        String(d.days ?? 0),
      ]),
    });
  }

  if (result.rows.length > 0) {
    const periodRows = result.rows.map((r) => [
      r.period,
      String(r.weekCount),
      `${formatMoney(r.wage)} ₺`,
      (r.coefficient ?? 1).toFixed(4),
      `${formatMoney(r.dailyWage)} ₺`,
      `${formatMoney(r.daily50)} ₺`,
      `${formatMoney(r.haftaTatiliTotal)} ₺`,
    ]);
    periodRows.push(["Toplam", "", "", "", "", "", `${formatMoney(result.totalBrut)} ₺`]);
    sections.push({
      id: "hafta-tatili-cetvel",
      title: "Hafta Tatili Hesaplama Detayı",
      headers: [
        "Tarih (Ücret Dönemi)",
        "Hafta",
        "Ücret (BRÜT)",
        "Katsayı",
        "Günlük Brüt",
        daily50Header,
        "Hafta Tatili Ücreti",
      ],
      rows: periodRows,
      lastRowTone: "blue",
    });
  }

  sections.push({
    id: "brutten-nete",
    title: "Brüt'ten Net'e Çeviri",
    headers: ["Kalem", "Tutar"],
    rows: [
      ["Brüt Hafta Tatili Alacağı", `${formatMoney(result.totalBrut)} ₺`],
      ["SGK İşçi Primi (%14)", `−${formatMoney(result.net.ssk)} ₺`],
      [
        `Gelir Vergisi${result.net.gelirVergisiDilimleri ? ` ${result.net.gelirVergisiDilimleri}` : ""}`,
        `−${formatMoney(result.net.gelirVergisi)} ₺`,
      ],
      ["Damga Vergisi (Binde 7,59)", `−${formatMoney(result.net.damgaVergisi)} ₺`],
      ["Net Hafta Tatili Alacağı", `${formatMoney(result.net.netAmount)} ₺`],
    ],
    lastRowTone: "green",
  });

  const mahsupNum = parseSettleNum(form.settleAmount);
  const mahsupSonuc = Math.max(0, result.totalBrut - result.hakkaniyet - mahsupNum);
  sections.push({
    id: "mahsuplasma",
    title: "Mahsuplaşma",
    headers: ["Kalem", "Tutar"],
    rows: [
      ["Net Hafta Tatili Alacağı", `${formatMoney(result.totalBrut)} ₺`],
      ["1/3 Hakkaniyet İndirimi", `−${formatMoney(result.hakkaniyet)} ₺`],
      [
        "Mahsuplaşma Miktarı",
        mahsupNum > 0 ? `−${formatMoney(mahsupNum)} ₺` : `${formatMoney(0)} ₺`,
      ],
      ["Mahsuplaşma Sonucu", `${formatMoney(mahsupSonuc)} ₺`],
    ],
    lastRowTone: "green",
  });

  return sections;
}
