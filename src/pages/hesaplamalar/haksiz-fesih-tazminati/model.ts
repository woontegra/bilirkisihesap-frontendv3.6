/**
 * Haksız Fesih Tazminatı — sayfaya özel veri modeli.
 * %100 lokal ve diğer hesaplama sayfalarından izole.
 */

export type CoefRow = {
  k: number;
  label: string;
  value: number;
};

export type WorkPeriod = {
  years: number;
  months: number;
  days: number;
  label: string;
};

export type HaksizFesihResult = {
  coefRows: CoefRow[];
  brutVal: number;
  brutForNet: number;
  damgaVergisi: number;
  netTazminat: number;
  odenenVal: number;
  mahsupSonrasiNet: number;
  workPeriod: WorkPeriod | null;
  asgariUcretHatasi: string | null;
};

export type HaksizFesihForm = {
  startDate: string;
  endDate: string;
  brut: string;
  odenenTutar: string;
  brutInputForNet: string;
  /** Opsiyonel brüt boşsa brütten nete için kullanılacak ay katsayısı (1–6). */
  netAyKatsayi: 1 | 2 | 3 | 4 | 5 | 6;
};

export type SavedCase = {
  id: string;
  name: string;
  version: 1;
  updatedAt: string;
  form: HaksizFesihForm;
  results: {
    brutForNet: number;
    netTazminat: number;
    mahsupSonrasiNet: number;
  };
};

export function normalizeNetAyKatsayi(value: unknown): 1 | 2 | 3 | 4 | 5 | 6 {
  const n = typeof value === "number" ? value : Number(value);
  if (n === 1 || n === 2 || n === 3 || n === 4 || n === 5 || n === 6) return n;
  return 6;
}

export function createEmptyForm(): HaksizFesihForm {
  return {
    startDate: "",
    endDate: "",
    brut: "",
    odenenTutar: "",
    brutInputForNet: "",
    netAyKatsayi: 6,
  };
}

export function newLocalId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `hf-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function snapshotKey(form: HaksizFesihForm): string {
  return [
    form.startDate,
    form.endDate,
    form.brut,
    form.odenenTutar,
    form.brutInputForNet,
    String(form.netAyKatsayi),
  ].join("|");
}

export const NOTE_BLOCKS: Array<{ text: string; emphasis?: "warning" }> = [
  {
    text: "6098 sayılı Türk Borçlar Kanunu'na tabi hizmet sözleşmelerinde, haklı sebep olmaksızın derhâl fesih hâlinde TBK m.438 kapsamında tazminat talep edilebilir.",
  },
  {
    text: 'TBK nun "b. Haklı sebebe dayanmayan fesihte" başlıklı 438 maddesinde "İşveren, haklı sebep olmaksızın hizmet sözleşmesini derhâl feshederse işçi, belirsiz süreli sözleşmelerde, fesih bildirim süresine; belirli süreli sözleşmelerde ise, sözleşme süresine uyulmaması durumunda, bu sürelere uyulmuş olsaydı kazanabileceği miktarı, tazminat olarak isteyebilir.',
  },
  {
    text: "Belirli süreli hizmet sözleşmesinde işçinin hizmet sözleşmesinin sona ermesi yüzünden tasarruf ettiği miktar ile başka bir işten elde ettiği veya bilerek elde etmekten kaçındığı gelir, tazminattan indirilir.",
  },
  {
    text: 'Hâkim, bütün durum ve koşulları göz önünde tutarak, ayrıca miktarını serbestçe belirleyeceği bir tazminatın işçiye ödenmesine karar verebilir; ancak belirlenecek tazminat miktarı, işçinin altı aylık ücretinden fazla olamaz." Şeklinde düzenlenmiştir.',
  },
  { text: "Haksız fesih tazminatı, yapılan feshin haksız olması sebebiyle işçiye ödenir." },
  { text: "Ancak belirlenecek tazminat, işçinin 6 aylık ücretinden fazla olamaz.", emphasis: "warning" },
  {
    text: "Haksız fesih tazminatı, bakiye ücret tazminatından ayrı bir tazminat türüdür ve bu tazminata ek olarak verilir.",
  },
];
