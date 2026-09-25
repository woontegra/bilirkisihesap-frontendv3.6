export type CaseRouteInfo = {
  path: string;
  supported: boolean;
  label: string;
};

const UNSUPPORTED_FALLBACK: CaseRouteInfo = {
  path: "/fazla-mesai/standart",
  supported: false,
  label: "Hesaplama",
};

/**
 * Hesaplama türü → V3.5 route eşlemesi.
 * supported: true → lokal motor mevcut; false → henüz aktarılmadı.
 */
export function getCaseRouteInfo(type: string): CaseRouteInfo {
  const t = (type || "")
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i")
    .replace(/ş/g, "s")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c");

  // Desteklenen kıdem / davacı (önce spesifik eşleşmeler)
  if (t.includes("kidem_gemi") || (t.includes("kidem") && t.includes("gemi") && !t.includes("fazla"))) {
    return { path: "/kidem-tazminati/gemi", supported: true, label: "Kıdem — Gemi Adamları" };
  }
  if (t.includes("kidem_basin") || (t.includes("kidem") && t.includes("basin"))) {
    return { path: "/kidem-tazminati/basin", supported: true, label: "Kıdem — Basın İş" };
  }
  if (
    t.includes("kidem_mevsimlik") ||
    t.includes("kidem_mevsim") ||
    (t.includes("kidem") && t.includes("mevsim"))
  ) {
    return { path: "/kidem-tazminati/mevsimlik", supported: true, label: "Kıdem — Mevsimlik İşçi" };
  }
  if (
    t.includes("kidem_kismi_sureli") ||
    t.includes("kidem_kismi") ||
    t.includes("kismi_sureli") ||
    t.includes("part_time") ||
    (t.includes("kidem") && (t.includes("kismi") || t.includes("part")))
  ) {
    return {
      path: "/kidem-tazminati/kismi-sureli",
      supported: true,
      label: "Kıdem — Kısmi Süreli",
    };
  }
  if (t.includes("kidem_borclar") || (t.includes("kidem") && t.includes("borclar"))) {
    return { path: "/kidem-tazminati/borclar", supported: true, label: "Kıdem — Borçlar Kanunu" };
  }
  if (
    t.includes("kidem_belirli") ||
    t.includes("belirli_sureli") ||
    (t.includes("kidem") && t.includes("belirli"))
  ) {
    return {
      path: "/kidem-tazminati/belirli-sureli",
      supported: true,
      label: "Kıdem — Belirli Süreli",
    };
  }
  if (t.includes("kidem_30isci") || t.includes("kidem")) {
    return {
      path: "/kidem-tazminati/30isci",
      supported: true,
      label: "Kıdem — İş Kanunu (30 işçi)",
    };
  }
  if (t.includes("davaci")) {
    return { path: "/davaci-ucreti", supported: true, label: "Davacı Ücreti" };
  }

  // Desteklenmeyen — path V3 ile uyumlu öneri, supported: false
  if (t.includes("icra_takip") && t.includes("istisnali") && t.includes("full") && t.includes("kesintili")) {
    return {
      path: "/icra-takip-brutten-nete/istisnali-full-kesintili",
      supported: true,
      label: "İcra Takip — İstisnalı Full Kesintili",
    };
  }
  if (t.includes("icra_takip") && t.includes("istisnasiz") && t.includes("full") && t.includes("kesintili")) {
    return {
      path: "/icra-takip-brutten-nete/istisnasiz-full-kesintili",
      supported: true,
      label: "İcra Takip — İstisnasız Full Kesintili",
    };
  }
  if (t.includes("icra_takip") && t.includes("gelir") && t.includes("damga")) {
    return {
      path: "/icra-takip-brutten-nete/gelir-ve-damga-vergisi-kesintili",
      supported: true,
      label: "İcra Takip — Gelir ve Damga Vergisi",
    };
  }
  if (t.includes("icra_takip") && t.includes("damga")) {
    return {
      path: "/icra-takip-brutten-nete/damga-vergisi-kesintili",
      supported: true,
      label: "İcra Takip — Damga Vergisi",
    };
  }
  if (t.includes("tanikli") && t.includes("standart")) {
    return { path: "/fazla-mesai/tanikli-standart", supported: true, label: "Fazla Mesai — Tanıklı" };
  }
  if (t.includes("haftalik") && t.includes("karma")) {
    return { path: "/fazla-mesai/haftalik-karma", supported: true, label: "Fazla Mesai — Haftalık Karma" };
  }
  if (t.includes("donemsel") && t.includes("haftalik")) {
    return {
      path: "/fazla-mesai/donemsel-haftalik",
      supported: true,
      label: "Fazla Mesai — Dönemsel Haftalık",
    };
  }
  if (t.includes("donemsel")) {
    return { path: "/fazla-mesai/donemsel", supported: true, label: "Fazla Mesai — Dönemsel" };
  }
  if (t.includes("yeralti")) {
    return { path: "/fazla-mesai/yeralti-isci", supported: true, label: "Fazla Mesai — Yeraltı" };
  }
  if (t.includes("vardiya_48") || t.includes("vardiya-48")) {
    return { path: "/fazla-mesai/vardiya-48", supported: true, label: "Fazla Mesai — Vardiya 48" };
  }
  if (t.includes("vardiya_24") || t.includes("vardiya-24")) {
    return { path: "/fazla-mesai/vardiya-24", supported: true, label: "Fazla Mesai — Vardiya 24" };
  }
  if (
    t.includes("fazla_mesai_gemi_7_24") ||
    t.includes("gemi_7_24") ||
    t.includes("gemi-7-24") ||
    t.includes("gemi-adami-7-24")
  ) {
    return {
      path: "/fazla-mesai/gemi-adami-7-24",
      supported: true,
      label: "Fazla Mesai — Gemi 7/24",
    };
  }
  if (t.includes("fazla_mesai_gemi_gunluk") || t.includes("gemi-adami-gunluk") || t.includes("gemi_gunluk")) {
    return {
      path: "/fazla-mesai/gemi-adami-gunluk",
      supported: true,
      label: "Fazla Mesai — Gemi Günlük",
    };
  }
  if (t.includes("fazla_mesai_gemi") || (t.includes("gemi") && t.includes("fazla"))) {
    return { path: "/fazla-mesai/gemi-adami-gunluk", supported: true, label: "Fazla Mesai — Gemi Adamı" };
  }
  if (t.includes("fazla_mesai_standart") || t.includes("fazla_mesai") || t === "fazla_mesai") {
    return { path: "/fazla-mesai/standart", supported: true, label: "Fazla Mesai — Standart" };
  }
  if (t.includes("ubgt") && t.includes("bilirkisi")) {
    return { path: "/ubgt/bilirkisi", supported: true, label: "Bilirkişi UBGT Alacağı" };
  }
  if (t.includes("ubgt")) {
    return { path: "/ubgt/alacagi", supported: true, label: "Standart UBGT Alacağı" };
  }
  if (t.includes("ihbar_belirli")) {
    return { path: "/ihbar-tazminati/belirli", supported: true, label: "İhbar — Belirli Süreli" };
  }
  if (t.includes("ihbar_kismi")) {
    return { path: "/ihbar-tazminati/kismi", supported: true, label: "İhbar — Kısmi" };
  }
  if (t.includes("ihbar_basin")) {
    return { path: "/ihbar-tazminati/basin", supported: true, label: "İhbar — Basın" };
  }
  if (t.includes("ihbar_mevsim")) {
    return { path: "/ihbar-tazminati/mevsim", supported: true, label: "İhbar — Mevsimlik" };
  }
  if (t.includes("ihbar_gemi")) {
    return { path: "/ihbar-tazminati/gemi", supported: true, label: "İhbar — Gemi" };
  }
  if (t.includes("ihbar_borclar")) {
    return { path: "/ihbar-tazminati/borclar", supported: true, label: "İhbar — Borçlar" };
  }
  if (t.includes("ihbar")) {
    return { path: "/ihbar-tazminati/30isci", supported: true, label: "İhbar Tazminatı" };
  }
  if (t.includes("hafta_tatili") && t.includes("basin")) {
    return { path: "/hafta-tatili/basin-is", supported: true, label: "Hafta Tatili — Basın" };
  }
  if (t.includes("hafta_tatili") && t.includes("gemi")) {
    return { path: "/hafta-tatili/gemi-adami", supported: true, label: "Hafta Tatili — Gemi" };
  }
  if (t.includes("hafta_tatili")) {
    return { path: "/hafta-tatili/standard", supported: true, label: "Hafta Tatili Alacağı" };
  }
  if (t.includes("yillik_izin") && t.includes("borclar")) {
    return { path: "/yillik-izin/borclar", supported: true, label: "Yıllık İzin — Borçlar" };
  }
  if (t.includes("yillik_izin") && t.includes("gemi")) {
    return { path: "/yillik-izin/gemi", supported: true, label: "Yıllık İzin — Gemi" };
  }
  if (t.includes("yillik_izin") && t.includes("mevsim")) {
    return { path: "/yillik-izin/mevsim", supported: true, label: "Yıllık İzin — Mevsimlik" };
  }
  if (
    t.includes("yillik_izin") &&
    t.includes("basin") &&
    (t.includes("gunluk_olmayan") || t.includes("günlük_olmayan"))
  ) {
    return {
      path: "/yillik-izin/basin/gunluk-olmayan",
      supported: true,
      label: "Yıllık İzin — Basın (Günlük Olmayan)",
    };
  }
  if (t.includes("yillik_izin") && t.includes("basin")) {
    return { path: "/yillik-izin/basin", supported: true, label: "Yıllık İzin — Basın" };
  }
  if (t.includes("yillik_izin") && t.includes("belirli")) {
    return { path: "/yillik-izin/belirli", supported: true, label: "Yıllık İzin — Belirli" };
  }
  if (t.includes("yillik_izin") && t.includes("kismi")) {
    return { path: "/yillik-izin/kismi", supported: true, label: "Yıllık İzin — Kısmi" };
  }
  if (t.includes("yillik_izin")) {
    return { path: "/yillik-izin/standart", supported: true, label: "Yıllık Ücretli İzin" };
  }
  if (t.includes("ise_almama") || t.includes("almama")) {
    return { path: "/ise-almama-tazminati", supported: true, label: "İşe Başlatmama Tazminatı" };
  }
  if (t.includes("ayrimcilik")) {
    return { path: "/ayrimcilik-tazminati", supported: true, label: "Ayrımcılık Tazminatı" };
  }
  if (t.includes("haksiz_fesih")) {
    return { path: "/haksiz-fesih-tazminati", supported: true, label: "Haksız Fesih Tazminatı" };
  }
  if (t.includes("kotu_niyet")) {
    return { path: "/kotu-niyet-tazminati", supported: true, label: "Kötü Niyet Tazminatı" };
  }
  if (t.includes("bosta_gecen")) {
    return { path: "/bosta-gecen-sure-ucreti", supported: true, label: "Boşta Geçen Süre Ücreti" };
  }
  if (t.includes("bakiye")) {
    return { path: "/bakiye-ucret-alacagi", supported: true, label: "Bakiye Ücret Alacağı" };
  }
  if (t.includes("ucret_alacagi") || t === "ucret alacagi") {
    return { path: "/ucret-alacagi", supported: true, label: "Ücret Alacağı" };
  }
  if (t.includes("is_arama")) {
    return { path: "/is-arama-izni-ucreti", supported: true, label: "İş Arama İzni Ücreti" };
  }
  if (t.includes("prim")) {
    return { path: "/prim-alacagi", supported: true, label: "Prim Alacağı" };
  }

  return { ...UNSUPPORTED_FALLBACK, label: t || UNSUPPORTED_FALLBACK.label };
}

/** Açma URL'si: path + ?caseId= */
export function buildCaseOpenUrl(type: string, id: number): string {
  const { path } = getCaseRouteInfo(type);
  return `${path}?caseId=${id}`;
}
