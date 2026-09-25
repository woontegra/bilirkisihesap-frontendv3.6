/**
 * Kötü Niyet Tazminatı — sayfaya özel veri modeli.
 * %100 lokal ve diğer hesaplama sayfalarından izole.
 */

export type ExtraItem = { id: string; label: string; value: string };

export type WorkPeriod = {
  years: number;
  months: number;
  days: number;
  label: string;
};

export type KotuNiyetForm = {
  startDate: string;
  endDate: string;
  brut: string;
  prim: string;
  ikramiye: string;
  yol: string;
  yemek: string;
  extras: ExtraItem[];
};

export type KotuNiyetResult = {
  workPeriod: WorkPeriod;
  toplamBrut: number;
  weeks: number;
  gunlukUcret: number;
  ihbarTutari: number;
  brutAmount: number;
  damgaVergisi: number;
  netAmount: number;
};

export type SavedCase = {
  id: string;
  name: string;
  version: 1;
  updatedAt: string;
  form: KotuNiyetForm;
  results: {
    toplamBrut: number;
    brutAmount: number;
    netAmount: number;
    weeks: number;
  };
};

export function newLocalId(prefix = "kn"): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function createEmptyForm(): KotuNiyetForm {
  return {
    startDate: "",
    endDate: "",
    brut: "",
    prim: "",
    ikramiye: "",
    yol: "",
    yemek: "",
    extras: [],
  };
}

export function snapshotKey(form: KotuNiyetForm): string {
  return JSON.stringify({
    a: form.startDate,
    b: form.endDate,
    c: form.brut,
    p: form.prim,
    i: form.ikramiye,
    y: form.yol,
    m: form.yemek,
    e: form.extras.map((x) => [x.label, x.value]),
  });
}

/** V3 `NOTE_PARAS` — yalnızca bu metinler. */
export const NOTE_BLOCKS: string[] = [
  "1- Kötü niyet tazminatından iş güvencesinden yararlanamayan işçiler yararlanabilir.",
  "2- İhbar önelinin 3 katı tutarında hesaplama yapılır.",
  "3- Borçlar Kanunu 434'üncü maddesinde düzenlenmiştir. İş Kanunu'nda yoktur, ancak Borçlar Kanununa tabi veya İş Kanunu'na tabi olsa dahi iş güvencesi kapsamı dışındaki çalışanlar için geçerlidir.",
  "4- Hizmet sözleşmesinin fesih hakkının kötüye kullanılarak sona erdirildiği durumlarda işveren, işçiye fesih bildirim süresine ait ücretin 3 katı tutarında tazminat ödemekle yükümlüdür. Sözleşmenin belirsiz süreli olması gerekir.",
  "5- İşverence yapılan feshin hangi andan itibaren kötü niyetli olduğu ölçütü Yargıtay kararlarında belirlenmiştir. Tutar: İşçinin (giydirilmiş) ücreti esas alınır; kötü niyet tazminatı tazminat mahiyetinde olduğundan gelir vergisi kesilmez, binde 7,59 damga vergisi uygulanır. Süre: ihbar süresinin 3 katıdır.",
];
