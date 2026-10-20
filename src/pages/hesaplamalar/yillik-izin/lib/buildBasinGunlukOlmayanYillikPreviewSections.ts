import type { PreviewSection } from "@/components/calculation-preview";
import { formatDateTR } from "./dates";
import { formatMoney, parseNum } from "./money";
import type { UsedLeaveRow } from "./types";
import type { computeYillikBasinGunlukOlmayanResult } from "../basin/gunluk-olmayan/engine";
import type { YillikBasinGunlukOlmayanForm } from "../basin/gunluk-olmayan/model";

function validUsedRows(rows: UsedLeaveRow[]) {
  return rows.filter((r) => r.start && r.end && String(r.days ?? "").trim().length > 0);
}

export function buildBasinGunlukOlmayanYillikPreviewSections(opts: {
  form: YillikBasinGunlukOlmayanForm;
  result: ReturnType<typeof computeYillikBasinGunlukOlmayanResult>;
}): PreviewSection[] {
  const { form, result } = opts;
  const izin = result.izinResult;
  const brutVal = parseNum(form.brut);
  const employerPayment =
    Number(String(form.employerPayment ?? "").replace(/\./g, "").replace(",", ".")) || 0;
  const mahsupBrut = Math.max(0, Math.round((result.brutIzin - employerPayment) * 100) / 100);
  const gvLabel = result.gelirVergisiDilimleri
    ? `Gelir Vergisi ${result.gelirVergisiDilimleri}`
    : "Gelir Vergisi";

  const sections: PreviewSection[] = [
    {
      id: "genel-bilgiler",
      title: "Genel Bilgiler",
      headers: ["Alan", "Değer"],
      rows: [
        ["Mesleğe Başlangıç Tarihi", formatDateTR(form.meslegeBaslangic)],
        ["İşten Çıkış Tarihi", formatDateTR(form.endDate)],
        ["Çalışma Süresi", result.calismaSuresiLabel || "—"],
        ["Gazete Türü", "Günlük Olmayan Gazete"],
        ["Brüt Ücret", brutVal > 0 ? `${formatMoney(brutVal)} ₺` : "—"],
      ],
    },
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
  ];

  const hakRows: string[][] = [
    ["Toplam ay", `${izin.toplamAy} ay`],
    ["6 aylık devre", `${izin.devre} devre`],
  ];
  if (izin.devre > 0) {
    hakRows.push([
      `${izin.devre} devre × 14 gün`,
      `${izin.izinGun} gün (${izin.hafta} hafta)`,
    ]);
  }
  hakRows.push(["Toplam Hak Edilen", `${result.totalEntitlement} gün`]);
  hakRows.push(["Kullanılan İzin", `${result.usedTotal} gün`]);
  hakRows.push(["Kalan İzin", `${result.remainingDays} gün`]);

  sections.push({
    id: "yillik-izin-hak-edisi",
    title: "Yıllık İzin Hak Edişi (Basın İşçileri - Günlük Olmayan)",
    headers: ["Dönem", "Gün/Hafta"],
    rows: hakRows,
    lastRowTone: "green",
  });

  const usedRows = validUsedRows(form.usedRows);
  if (usedRows.length > 0) {
    sections.push({
      id: "kullanilan-izinler",
      title: "Kullanılan İzinler",
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
