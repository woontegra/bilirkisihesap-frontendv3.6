import type { PreviewSection } from "@/components/calculation-preview";
import { calcMahsupSonucuBilirkisi, formatDateTR, formatMoney } from "../engine";
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
}): PreviewSection[] {
  const {
    form,
    displayPeriods,
    displayTotalDays,
    displayBrutForNet,
    effectiveNet,
    hakkaniyet,
    settleNum,
  } = opts;
  const mahsupSonucu = calcMahsupSonucuBilirkisi(displayBrutForNet, hakkaniyet, settleNum);
  const sgkCombined = (effectiveNet.ssk || 0) + (effectiveNet.issizlik || 0);

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
        ["SGK işçi primi (%15)", `−${formatMoney(sgkCombined)} ₺`],
        [
          `Gelir vergisi${effectiveNet.gelirVergisiDilimleri ? ` ${effectiveNet.gelirVergisiDilimleri}` : ""}`,
          `−${formatMoney(effectiveNet.gelirVergisi)} ₺`,
        ],
        ["Damga vergisi (binde 7,59)", `−${formatMoney(effectiveNet.damgaVergisi)} ₺`],
        ["Net UBGT alacağı", `${formatMoney(effectiveNet.netAmount)} ₺`],
      ],
      lastRowTone: "green",
    },
    {
      id: "mahsuplasma",
      title: "Mahsuplaşma",
      headers: ["Kalem", "Tutar"],
      rows: [
        ["Brüt UBGT alacağı", `${formatMoney(displayBrutForNet)} ₺`],
        ["1/3 hakkaniyet indirimi", `−${formatMoney(hakkaniyet)} ₺`],
        [
          "Mahsuplaşma miktarı",
          settleNum > 0 ? `−${formatMoney(settleNum)} ₺` : `${formatMoney(0)} ₺`,
        ],
        ["Mahsuplaşma sonucu", `${formatMoney(mahsupSonucu)} ₺`],
      ],
      lastRowTone: "green",
    },
  ];
}
