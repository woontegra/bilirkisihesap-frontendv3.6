const CALCULATION_TYPE_LABELS: Record<string, string> = {
  kidem: "Kıdem Tazminatı",
  kidem_standart: "Kıdem Tazminatı",
  kidem_30isci: "Kıdem Tazminatı (30+ İşçi)",
  kidem_gemi: "Gemi Adamı Kıdem",
  kidem_basin: "Basın İşçisi Kıdem",
  kidem_mevsim: "Mevsimlik Kıdem",
  kidem_kismi: "Kısmi Süreli Kıdem",
  kidem_belirli: "Belirli Süreli Kıdem",
  kidem_borclar: "Borçlar K. Kıdem",
  ihbar: "İhbar Tazminatı",
  ihbar_standart: "İhbar Tazminatı",
  ihbar_30isci: "İhbar Tazminatı (30+ İşçi)",
  ihbar_gemi: "Gemi Adamı İhbar",
  ihbar_basin: "Basın İşçisi İhbar",
  ihbar_mevsim: "Mevsimlik İhbar",
  ihbar_kismi: "Kısmi Süreli İhbar",
  ihbar_belirli: "Belirli Süreli İhbar",
  ihbar_borclar: "Borçlar K. İhbar",
  yillik_izin: "Yıllık İzin",
  yillik_izin_standart: "Yıllık İzin",
  yillik_izin_gemi: "Gemi Adamı Yıllık İzin",
  yillik_izin_basin: "Basın İşçisi Yıllık İzin",
  yillik_izin_mevsim: "Mevsimlik Yıllık İzin",
  yillik_izin_kismi: "Kısmi Yıllık İzin",
  yillik_izin_belirli: "Belirli Süreli Yıllık İzin",
  fazla_mesai: "Fazla Mesai",
  fazla_mesai_standart: "Fazla Mesai",
  fazla_mesai_gemi: "Gemi Adamı Fazla Mesai",
  fazla_mesai_gemi_gunluk: "Gemi Adamı Günlük Fazla Mesai",
  fazla_mesai_vardiya: "Vardiya Fazla Mesai",
  ubgt: "UBGT Alacağı",
  ubgt_alacagi: "Standart UBGT Alacağı",
  ubgt_bilirkisi: "Bilirkişi UBGT Alacağı",
  hafta_tatili: "Hafta Tatili",
  hafta_tatili_standart: "Hafta Tatili",
  hafta_tatili_gemi: "Gemi Adamı Hafta Tatili",
  hafta_tatili_basin: "Basın İşçisi Hafta Tatili",
  ucret: "Ücret Alacağı",
  ucret_alacagi: "Ücret Alacağı",
  bakiye_ucret: "Bakiye Ücret",
  prim: "Prim Alacağı",
  prim_alacagi: "Prim Alacağı",
  kotu_niyet: "Kötü Niyet Tazminatı",
  bosta_gecen_sure: "Boşta Geçen Süre",
  ise_almama: "İşe Başlatmama Tazminatı",
  ayrimcilik: "Ayrımcılık Tazminatı",
  haksiz_fesih: "Haksız Fesih Tazminatı",
  is_arama_izni: "İş Arama İzni",
  davaci_ucreti: "Davacı Ücreti",
};

export function formatCalculationType(raw: string): string {
  if (!raw || raw === "-") {
    return raw;
  }
  if (CALCULATION_TYPE_LABELS[raw]) {
    return CALCULATION_TYPE_LABELS[raw];
  }
  const lower = raw.toLowerCase();
  for (const [key, value] of Object.entries(CALCULATION_TYPE_LABELS)) {
    if (lower.includes(key)) {
      return value;
    }
  }
  return raw
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function normalizePieType(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower.includes("kıdem") || lower.includes("kidem")) {
    return "Kıdem";
  }
  if (lower.includes("ihbar")) {
    return "İhbar";
  }
  if (lower.includes("yillik") || lower.includes("yıllık") || lower.includes("izin")) {
    return "Yıllık İzin";
  }
  if (lower.includes("fazla") || lower.includes("mesai")) {
    return "Fazla Mesai";
  }
  if (lower.includes("hafta")) {
    return "Hafta Tatili";
  }
  if (lower.includes("ubgt")) {
    return "UBGT";
  }
  if (lower.includes("ucret") || lower.includes("ücret")) {
    return "Ücret";
  }
  return "Diğer";
}
