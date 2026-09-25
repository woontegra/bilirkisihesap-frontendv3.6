/**
 * Ücret Alacağı — sayfaya özel veri modeli.
 * %100 lokal ve diğer hesaplama sayfalarından izole.
 */

export type CetvelRow = {
  id: string;
  rangeLabel: string;
  startISO: string;
  endISO: string;
  katsayi: number;
  ucret: number;
  gunSayisi: number;
  ayGunSayisi: number;
  ucretManual: boolean;
  odenenUcret: number;
  /** Net cetvelde: dönemin resmi net asgari ücreti bulunamadı (manuel giriş bekleniyor). */
  netVerisiYok?: boolean;
};

export type HesaplamaTab = "brut" | "net";

export type UcretAlacagiForm = {
  startDate: string;
  endDate: string;
  activeTab: HesaplamaTab;
  cetvelRows: CetvelRow[];
  netCetvelRows: CetvelRow[];
  globalKatsayi: number;
  netGlobalKatsayi: number;
  hasCustomKatsayi: boolean;
  netHasCustomKatsayi: boolean;
  /** Brüt sekmesi: manuel netten brüte dönüşüm girişi. */
  netForGross: string;
  /** Net sekmesi: manuel brütten nete (netten brüte'nin tersi) dönüşüm girişi. */
  netTabGrossForNet: string;
};

export type WorkPeriod = { years: number; months: number; days: number; label: string };

export type ConversionPanelData = {
  gross: number;
  net: number;
  sgk: number;
  issizlik: number;
  gelirVergisi: number;
  gelirVergisiBrut: number;
  gelirVergisiIstisna: number;
  gelirVergisiDilimleri: string;
  damgaVergisi: number;
  damgaVergisiBrut: number;
  damgaVergisiIstisna: number;
};

export const EMPTY_CONVERSION_PANEL: ConversionPanelData = {
  gross: 0,
  net: 0,
  sgk: 0,
  issizlik: 0,
  gelirVergisi: 0,
  gelirVergisiBrut: 0,
  gelirVergisiIstisna: 0,
  gelirVergisiDilimleri: "",
  damgaVergisi: 0,
  damgaVergisiBrut: 0,
  damgaVergisiIstisna: 0,
};

export type UcretAlacagiResult = {
  workPeriod: WorkPeriod;
  totalBrut: number;
  totalNet: number;
  brutKalanRows: number[];
  netKalanRows: number[];
  brutOdenenToplam: number;
  netOdenenToplam: number;
  netFromGross: ConversionPanelData;
  netTabGrossFromCetvel: ConversionPanelData;
  brutTabGrossFromNetManual: ConversionPanelData;
  netTabNetFromGrossManual: ConversionPanelData;
};

export type SavedCase = {
  id: string;
  name: string;
  version: 1;
  updatedAt: string;
  form: UcretAlacagiForm;
  results: {
    totalBrut: number;
    totalNet: number;
  };
};

export function newLocalId(prefix = "ua"): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function createEmptyForm(): UcretAlacagiForm {
  return {
    startDate: "",
    endDate: "",
    activeTab: "brut",
    cetvelRows: [],
    netCetvelRows: [],
    globalKatsayi: 1,
    netGlobalKatsayi: 1,
    hasCustomKatsayi: false,
    netHasCustomKatsayi: false,
    netForGross: "",
    netTabGrossForNet: "",
  };
}

export function snapshotKey(form: UcretAlacagiForm): string {
  const rowKey = (r: CetvelRow) => [r.startISO, r.endISO, r.katsayi, r.ucret, r.gunSayisi, r.odenenUcret].join(":");
  return JSON.stringify({
    a: form.startDate,
    b: form.endDate,
    t: form.activeTab,
    c: form.cetvelRows.map(rowKey),
    n: form.netCetvelRows.map(rowKey),
    gk: form.globalKatsayi,
    ngk: form.netGlobalKatsayi,
    ng: form.netForGross,
    ntg: form.netTabGrossForNet,
  });
}

/** V3 `NOTE_TEXT` (bilgi amaçlı, tek metin). */
export const NOTE_TEXT = "Bu alan bilgi amaçlıdır ve ileride güncellenecektir.";
