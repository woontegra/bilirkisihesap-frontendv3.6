import { damgaLabelForRate, issizlikLabelForRate } from "../../shared/historical/laborNet";
import type { PreviewSection } from "@/components/calculation-preview";
import { equityNetPreviewRows, type GrossNetBreakdown } from "../../shared/EquityNetLines";
import { formatDateTR, formatMoney } from "../engine";
import type { UbgtForm } from "../model";
import type { CetvelDisplayRow } from "../ubgtCetvelRows";
import type { UbgtNetResult } from "../engine";

export function buildBilirkisiUbgtPreviewSections(opts: {
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

  const davaciSummary =
    form.dateRanges
      .filter((r) => r.start && r.end)
      .map((r) => `${formatDateTR(r.start)} → ${formatDateTR(r.end)}`)
      .join("; ") || "—";

  const infoRows: string[][] = [
    ["Davacı dönemleri", davaciSummary],
    [
      "Tanık sayısı",
      String(form.witnesses.filter((w) => w.start && w.end).length),
    ],
  ];
  if (displayTotalDays > 0) {
    infoRows.push(["Toplam UBGT günü", `${displayTotalDays} gün`]);
  }
  if (form.ubgtExpiryStart) {
    infoRows.push(["Zamanaşımı başlangıcı", formatDateTR(form.ubgtExpiryStart)]);
  }

  const periodRows = displayPeriods.map((row) => [
    row.period,
    `${formatMoney(row.wage)} ₺`,
    row.coefficient.toFixed(4),
    `${formatMoney(row.dailyWage)} ₺`,
    String(row.ubgtDays),
    `${formatMoney(row.ubgtTotal)} ₺`,
  ]);
  periodRows.push(["Toplam", "", "", "", "", `${formatMoney(displayBrutForNet)} ₺`]);

  return [
    {
      id: "genel-bilgiler",
      title: "Genel Bilgiler",
      headers: ["Alan", "Değer"],
      rows: infoRows,
    },
    {
      id: "ubgt-hesaplama-cetveli",
      title: "UBGT hesaplama cetveli",
      headers: [
        "Dönem",
        "Ücret (BRÜT)",
        "Katsayı",
        "Günlük ücret",
        "UBGT günleri",
        "UBGT ücreti",
      ],
      rows: periodRows,
      lastRowTone: "blue",
    },
    {
      id: "brutten-nete",
      title: "Brüt'ten net'e çeviri",
      headers: ["Kalem", "Tutar"],
      rows: [
        ["Brüt UBGT alacağı", `${formatMoney(displayBrutForNet)} ₺`],
        ["SGK işçi primi (%14)", `−${formatMoney(effectiveNet.ssk)} ₺`],
        [issizlikLabelForRate(effectiveNet.issizlikOran, "İşsizlik primi (%1)"), `−${formatMoney(effectiveNet.issizlik)} ₺`],
        [
          `Gelir vergisi${effectiveNet.gelirVergisiDilimleri ? ` ${effectiveNet.gelirVergisiDilimleri}` : ""}`,
          `−${formatMoney(effectiveNet.gelirVergisi)} ₺`,
        ],
        [damgaLabelForRate(effectiveNet.damgaOran, "binde"), `−${formatMoney(effectiveNet.damgaVergisi)} ₺`],
        ["Net UBGT alacağı", `${formatMoney(effectiveNet.netAmount)} ₺`],
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
  ];
}
