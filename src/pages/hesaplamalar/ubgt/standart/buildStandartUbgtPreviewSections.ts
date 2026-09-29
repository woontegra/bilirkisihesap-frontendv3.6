import { damgaLabelForRate } from "../../shared/historical/laborNet";
import type { PreviewSection } from "@/components/calculation-preview";
import { equityNetPreviewRows, type GrossNetBreakdown } from "../../shared/EquityNetLines";
import { formatDateTR, formatMoney } from "../engine";
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
  settleNum: number;
  sonBrutAlacak: number;
  equityNet: GrossNetBreakdown;
}): PreviewSection[] {
  const {
    form,
    displayPeriods,
    displayTotalDays,
    displayBrutForNet,
    effectiveNet,
    hakkaniyet,
    settleNum,
    sonBrutAlacak,
    equityNet,
  } = opts;
  const firstStart = form.dateRanges[0]?.start ?? "";
  const lastEnd = form.dateRanges[form.dateRanges.length - 1]?.end ?? "";

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
        ["SGK İşçi Primi (%14)", `−${formatMoney(effectiveNet.ssk)} ₺`],
        ["İşsizlik primi (%1)", `−${formatMoney(effectiveNet.issizlik)} ₺`],
        [
          `Gelir Vergisi${effectiveNet.gelirVergisiDilimleri ? ` ${effectiveNet.gelirVergisiDilimleri}` : ""}`,
          `−${formatMoney(effectiveNet.gelirVergisi)} ₺`,
        ],
        [damgaLabelForRate(effectiveNet.damgaOran, "binde"), `−${formatMoney(effectiveNet.damgaVergisi)} ₺`],
        ["Net UBGT Alacağı", `${formatMoney(effectiveNet.netAmount)} ₺`],
      ],
      lastRowTone: "green",
    },
    {
      id: "mahsuplasma",
      title: "Hakkaniyet İndirimi / Mahsuplaşma",
      headers: ["Kalem", "Tutar"],
      rows: [
        ["Toplam Brüt Alacak", `${formatMoney(displayBrutForNet)} ₺`],
        ["1/3 Hakkaniyet İndirimi", `−${formatMoney(hakkaniyet)} ₺`],
        ["Mahsuplaşma Tutarı", `−${formatMoney(Number.isFinite(settleNum) ? settleNum : 0)} ₺`],
        ["Son Brüt Alacak", `${formatMoney(sonBrutAlacak)} ₺`],
        ...equityNetPreviewRows({
          format: (n) => `${formatMoney(n)} ₺`,
          kesinti: equityNet,
          sgkLabel: "SGK primi (%14)",
          issizlikLabel: "İşsizlik primi (%1)",
          damgaLabel: "Damga vergisi (binde 7,59)",
          gelirPrefix: "Gelir vergisi",
        }),
      ],
      lastRowTone: "green",
    },
  );

  return sections;
}
