const KNOWN_NAMES: Array<[RegExp, string]> = [
  [/standart fazla mesai/i, "standart-fazla-mesai-raporu.udf"],
  [/tanıklı standart|tanikli standart/i, "tanikli-standart-fazla-mesai-raporu.udf"],
  [/haftalık karma|haftalik karma/i, "haftalik-karma-fazla-mesai-raporu.udf"],
  [/dönemsel haftalık|donemsel haftalik/i, "donemsel-haftalik-fazla-mesai-raporu.udf"],
  [/dönemsel fazla|donemsel fazla/i, "donemsel-fazla-mesai-raporu.udf"],
  [/yeraltı|yeralti/i, "yeralti-isci-fazla-mesai-raporu.udf"],
  [/24 saat/i, "vardiya-24-fazla-mesai-raporu.udf"],
  [/48 saat/i, "vardiya-48-fazla-mesai-raporu.udf"],
  [/gemi adamı — günlük|gemi adami — gunluk|günlük çalışan/i, "gemi-adami-gunluk-fazla-mesai-raporu.udf"],
  [/7\/24|tam mürettebat/i, "gemi-adami-7-24-fazla-mesai-raporu.udf"],
  [/hafta tatili/i, "hafta-tatili-raporu.udf"],
  [/ubgt/i, "ubgt-alacagi-raporu.udf"],
  [/kıdem|kidem/i, "kidem-tazminati-raporu.udf"],
  [/ihbar/i, "ihbar-tazminati-raporu.udf"],
  [/yıllık ücretli izin|yillik ucretli izin|yıllık izin/i, "yillik-izin-raporu.udf"],
  [/ücret alacağı|ucret alacagi/i, "ucret-alacagi-raporu.udf"],
  [/bakiye ücret|bakiye ucret/i, "bakiye-ucret-raporu.udf"],
  [/davacı ücreti|davaci ucreti/i, "davaci-ucreti-raporu.udf"],
  [/boşta geçen|bosta gecen/i, "bosta-gecen-sure-ucreti-raporu.udf"],
  [/işe başlatmama|ise baslatmama/i, "ise-baslatmama-tazminati-raporu.udf"],
  [/haksız fesih|haksiz fesih/i, "haksiz-fesih-tazminati-raporu.udf"],
  [/kötü niyet|kotu niyet/i, "kotu-niyet-tazminati-raporu.udf"],
  [/iş arama|is arama/i, "is-arama-izni-ucreti-raporu.udf"],
  [/ayrımcılık|ayrimcilik/i, "ayrimcilik-tazminati-raporu.udf"],
  [/prim alacağı|prim alacagi/i, "prim-alacagi-raporu.udf"],
  [/icra/i, "icra-hesap-raporu.udf"],
];

function fold(value: string): string {
  return value
    .replace(/[çÇ]/g, "c")
    .replace(/[ğĞ]/g, "g")
    .replace(/[ıİ]/g, "i")
    .replace(/[öÖ]/g, "o")
    .replace(/[şŞ]/g, "s")
    .replace(/[üÜ]/g, "u")
    .toLowerCase();
}

export function udfFileNameFromTitle(title: string): string {
  const known = KNOWN_NAMES.find(([pattern]) => pattern.test(title));
  if (known) return known[1];
  const slug = fold(title)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return `${slug || "hesaplama"}-raporu.udf`;
}
