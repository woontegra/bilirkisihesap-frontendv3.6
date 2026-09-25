import type { PreviewSection } from "@/components/calculation-preview";
import { calcMahsupSonucuStandart, formatDateTR, formatMoney } from "../engine";
import type { UbgtExcludedDayRow, UbgtForm } from "../model";
import type { CetvelDisplayRow } from "../ubgtCetvelRows";
import type { UbgtNetResult } from "../engine";

export function buildStandartUbgtPreviewSections(opts: {
  form: UbgtForm;
  displayPeriods: CetvelDisplayRow[];
  displayTotalDays: number;
  displayBrutForNet: number;
  effectiveNet: UbgtNetResult;
  hakkaniyet: number;
}): PreviewSection[] {
  const { form, displayPeriods, displayTotalDays, displayBrutForNet, effectiveNet, hakkaniyet } = opts;
  const mahsupSonucu = calcMahsupSonucuStandart(effectiveNet.netAmount, hakkaniyet);
  const firstStart = form.dateRanges[0]?.start ?? "";
  const lastEnd = form.dateRanges[form.dateRanges.length - 1]?.end ?? "";
  const sgkCombined = (effectiveNet.ssk || 0) + (effectiveNet.issizlik || 0);

  const infoRows: string[][] = [
    ["İşe Giriş Tarihi", firstStart ? formatDateTR(firstStart) : "—"],
    ["İşten Çıkış Tarihi", lastEnd ? formatDateTR(lastEnd) : "—"],
  ];
  if (form.selectedHolidayIds.length > 0) {
    infoRows.push(["Seçilen Tatil Sayısı", `${form.selectedHolidayIds.length} adet`]);
  }
  if (displayTotalDays > 0) {
    infoRows.push(["Toplam UBGT Günü", `${displayTotalDays} gün`]);
  }
  if (form.ubgtExpiryStart) {
    infoRows.push(["Zamanaşımı Başlangıç Tarihi", formatDateTR(form.ubgtExpiryStart)]);
  }

  const periodRows = displayPeriods.map((row) => [
    row.period,
    `${formatMoney(row.wage)} ₺`,
    row.coefficient.toFixed(4),
    `${formatMoney(row.dailyWage)} ₺`,
    String(row.ubgtDays),
    `${formatMoney(row.ubgtTotal)} ₺`,
  ]);
  periodRows.push(["Toplam UBGT Ücreti:", "", "", "", "", `${formatMoney(displayBrutForNet)} ₺`]);

  const sections: PreviewSection[] = [
    {
      id: "genel-bilgiler",
      title: "Genel Bilgiler",
      headers: ["Alan", "Değer"],
      rows: infoRows,
    },
  ];

  const excluded = form.ubgtExcludedDays.filter((d) => d.start && d.end);
  if (excluded.length > 0) {
    const totalExcludedDays = excluded.reduce((sum, d) => sum + (Number(d.days) || 0), 0);
    sections.push({
      id: "dislanabilir-gunler",
      title: "Dışlanabilir Günler",
      headers: ["Tür", "Başlangıç", "Bitiş", "Gün Sayısı"],
      rows: [
        ...excluded.map((d: UbgtExcludedDayRow) => [
          d.type || "Yıllık İzin",
          formatDateTR(d.start),
          formatDateTR(d.end),
          String(d.days ?? 0),
        ]),
        ["TOPLAM", "", "", String(totalExcludedDays)],
      ],
      lastRowTone: "blue",
    });
  }

  sections.push(
    {
      id: "ubgt-hesaplama-cetveli",
      title: "UBGT Hesaplama Cetveli",
      headers: ["Dönem", "Ücret (BRÜT)", "Katsayı", "Günlük Ücret", "UBGT Günleri", "UBGT Ücreti"],
      rows: periodRows,
      lastRowTone: "blue",
    },
    {
      id: "brutten-nete",
      title: "Brüt'ten Net'e Çeviri",
      headers: ["Kalem", "Tutar"],
      rows: [
        ["Brüt UBGT Alacağı", `${formatMoney(displayBrutForNet)} ₺`],
        ["SGK İşçi Primi (%15)", `−${formatMoney(sgkCombined)} ₺`],
        [
          `Gelir Vergisi${effectiveNet.gelirVergisiDilimleri ? ` ${effectiveNet.gelirVergisiDilimleri}` : ""}`,
          `−${formatMoney(effectiveNet.gelirVergisi)} ₺`,
        ],
        ["Damga Vergisi (Binde 7,59)", `−${formatMoney(effectiveNet.damgaVergisi)} ₺`],
        ["Net UBGT Alacağı", `${formatMoney(effectiveNet.netAmount)} ₺`],
      ],
      lastRowTone: "green",
    },
    {
      id: "mahsuplasma",
      title: "Mahsuplaşma",
      headers: ["Kalem", "Tutar"],
      rows: [
        ["Net UBGT Alacağı", `${formatMoney(effectiveNet.netAmount)} ₺`],
        ["1/3 Hakkaniyet İndirimi", `−${formatMoney(hakkaniyet)} ₺`],
        ["Mahsuplaşma Sonucu", `${formatMoney(mahsupSonucu)} ₺`],
      ],
      lastRowTone: "green",
    },
  );

  return sections;
}
