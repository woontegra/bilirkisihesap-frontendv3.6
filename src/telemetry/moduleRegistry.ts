/** Canonical module keys for product usage events (must match backend whitelist). */

export const USAGE_EVENT = {
  APP_ENTERED: "APP_ENTERED",
  CALCULATION_PAGE_VIEWED: "CALCULATION_PAGE_VIEWED",
  CALCULATION_STARTED: "CALCULATION_STARTED",
  CALCULATION_COMPLETED: "CALCULATION_COMPLETED",
  PREVIEW_OPENED: "PREVIEW_OPENED",
  CALCULATION_SAVED: "CALCULATION_SAVED",
  GUIDE_STARTED: "GUIDE_STARTED",
  GUIDE_COMPLETED: "GUIDE_COMPLETED",
} as const;

export type UsageEventType = (typeof USAGE_EVENT)[keyof typeof USAGE_EVENT];

/** path (no query) → moduleKey */
const PATH_TO_MODULE: Array<{ test: (p: string) => boolean; key: string }> = [
  { test: (p) => p.startsWith("/kidem-tazminati/30isci"), key: "kidem_30isci" },
  { test: (p) => p.startsWith("/kidem-tazminati/borclar"), key: "kidem_borclar" },
  { test: (p) => p.startsWith("/kidem-tazminati/gemi"), key: "kidem_gemi" },
  { test: (p) => p.startsWith("/kidem-tazminati/mevsimlik"), key: "kidem_mevsimlik" },
  { test: (p) => p.startsWith("/kidem-tazminati/basin"), key: "kidem_basin" },
  { test: (p) => p.startsWith("/kidem-tazminati/kismi-sureli"), key: "kidem_kismi_sureli" },
  { test: (p) => p.startsWith("/kidem-tazminati/belirli-sureli"), key: "kidem_belirli_sureli" },
  { test: (p) => p.startsWith("/fazla-mesai/standart"), key: "fazla_mesai_standart" },
  { test: (p) => p.startsWith("/fazla-mesai/tanikli"), key: "fazla_mesai_tanikli" },
  { test: (p) => p.startsWith("/fazla-mesai/haftalik-karma"), key: "fazla_mesai_haftalik_karma" },
  { test: (p) => p.startsWith("/fazla-mesai/donemsel-haftalik"), key: "fazla_mesai_donemsel_haftalik" },
  { test: (p) => p.startsWith("/fazla-mesai/donemsel"), key: "fazla_mesai_donemsel" },
  { test: (p) => p.startsWith("/fazla-mesai/yeralti"), key: "fazla_mesai_yeralti" },
  { test: (p) => p.startsWith("/fazla-mesai/vardiya-24"), key: "fazla_mesai_vardiya24" },
  { test: (p) => p.startsWith("/fazla-mesai/vardiya-48"), key: "fazla_mesai_vardiya48" },
  { test: (p) => p.startsWith("/fazla-mesai/gemi-adami-gunluk"), key: "fazla_mesai_gemi_gunluk" },
  { test: (p) => p.startsWith("/fazla-mesai/gemi-adami-7-24"), key: "fazla_mesai_gemi_724" },
  { test: (p) => p.startsWith("/fazla-mesai/ev-isci"), key: "fazla_mesai_ev_isci" },
  { test: (p) => p.startsWith("/puantaj-fazla-mesai") || p.startsWith("/fazla-mesai/puantaj"), key: "fazla_mesai_puantaj" },
  { test: (p) => p.startsWith("/ubgt/alacagi"), key: "ubgt_alacagi" },
  { test: (p) => p.startsWith("/ubgt/bilirkisi"), key: "ubgt_bilirkisi" },
  { test: (p) => p.startsWith("/ihbar"), key: "ihbar" },
  { test: (p) => p.startsWith("/yillik-izin"), key: "yillik_izin" },
  { test: (p) => p.startsWith("/hafta-tatili"), key: "hafta_tatili" },
  { test: (p) => p.startsWith("/davaci-ucreti"), key: "davaci_ucreti" },
  { test: (p) => p.startsWith("/ucret-alacagi"), key: "ucret_alacagi" },
  { test: (p) => p.startsWith("/haksiz-fesih"), key: "haksiz_fesih" },
  { test: (p) => p.startsWith("/ayrimcilik"), key: "ayrimcilik" },
  { test: (p) => p.startsWith("/bakiye-ucret"), key: "bakiye_ucret" },
  { test: (p) => p.startsWith("/icra-takip"), key: "icra_takip" },
];

export function moduleKeyFromPath(pathname: string): string | null {
  const p = (pathname || "").split("?")[0];
  for (const row of PATH_TO_MODULE) {
    if (row.test(p)) return row.key;
  }
  return null;
}

/** Normalize SavedCase.type → module key when possible */
export function normalizeSavedCaseType(type: string | null | undefined): string {
  const t = (type || "").toLowerCase().trim();
  if (!t) return "UNKNOWN";
  if (t.includes("kidem_30isci") || t === "kidem") return "kidem_30isci";
  if (t.includes("kidem_borclar")) return "kidem_borclar";
  if (t.includes("kidem_gemi")) return "kidem_gemi";
  if (t.includes("kidem_mevsim")) return "kidem_mevsimlik";
  if (t.includes("kidem_basin")) return "kidem_basin";
  if (t.includes("kidem_kismi")) return "kidem_kismi_sureli";
  if (t.includes("kidem_belirli")) return "kidem_belirli_sureli";
  if (PATH_TO_MODULE.some((r) => r.key === t)) return t;
  return t.slice(0, 80) || "UNKNOWN";
}
