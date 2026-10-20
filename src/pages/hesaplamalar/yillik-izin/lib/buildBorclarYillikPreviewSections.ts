import type { PreviewSection } from "@/components/calculation-preview";
import { calcWorkPeriodBilirKisi, formatDateTR } from "./dates";
import { formatMoney, parseNum } from "./money";
import type { StandardComputeResult, StandardYillikFormBase } from "./types";

function validUsedRows(rows: StandardYillikFormBase["usedRows"]) {
  return rows.filter((r) => r.start && r.end && String(r.days ?? "").trim().length > 0);
}

export function buildBorclarYillikPreviewSections(opts: {
  form: StandardYillikFormBase & { is18Or50: boolean };
  result: StandardComputeResult;
}): PreviewSection[] {
  const { form, result } = opts;
  const wp = calcWorkPeriodBilirKisi(form.startDate, form.endDate);
  const brutVal = parseNum(form.brut);
  const employerPayment =
    Number(String(form.employerPayment ?? "").replace(/\./g, "").replace(",", ".")) || 0;
  const mahsupBrut = Math.max(0, Math.round((result.brutIzin - employerPayment) * 100) / 100);
  const gvLabel = result.gelirVergisiDilimleri
    ? `Gelir Vergisi ${result.gelirVergisiDilimleri}`
    : "Gelir Vergisi";
  const hesaplamaLabel = form.is18Or50 ? `3 hafta × ${wp.years} yıl` : `2 hafta × ${wp.years} yıl`;

  const sections: PreviewSection[] = [
    {
      id: "genel-bilgiler",
      title: "Genel Bilgiler",
      headers: ["Alan", "Değer"],
      rows: [
        ["İşe Giriş Tarihi", formatDateTR(form.startDate)],
        ["İşten Çıkış Tarihi", formatDateTR(form.endDate)],
        ["Çalışma Süresi", result.workPeriodLabel || "—"],
        ["Çıplak Brüt Ücret", brutVal > 0 ? `${formatMoney(brutVal)} ₺` : "—"],
        ["18 yaş altı / 50 yaş üstü", form.is18Or50 ? "Evet" : "Hayır"],
      ],
    },
    {
      id: "yillik-izin-hesaplama-ozet",
      title: "Yıllık İzin Hesaplama",
      headers: ["Alan", "Değer"],
      rows: [
        ["Hesaplama", hesaplamaLabel],
        ["Toplam İzin Hakkı", `${result.totalEntitlement} gün`],
      ],
      lastRowTone: "blue",
    },
  ];

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
