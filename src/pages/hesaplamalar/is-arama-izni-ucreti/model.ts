/**
 * İş Arama İzni Ücreti — sayfaya özel veri modeli.
 * %100 lokal ve diğer hesaplama sayfalarından izole.
 */

export type ExtraItem = { id: string; label: string; value: string };

export type TarihAralikDusum = {
  id: string;
  baslangic: string;
  bitis: string;
  gunlukSaat: string;
};

export type WorkPeriod = {
  years: number;
  months: number;
  days: number;
  label: string;
};

export type IsAramaForm = {
  startDate: string;
  endDate: string;
  brut: string;
  prim: string;
  ikramiye: string;
  yol: string;
  yemek: string;
  extras: ExtraItem[];
  /** "5" | "6" | "7" — haftalık çalışma günü. */
  haftalikCalismaGunu: string;
  /** Opsiyonel: gün bazlı kullandırılmış izin düşümü. */
  kullandirilanIzinGun: string;
  /** Opsiyonel: tarih aralığı bazlı kullandırılmış izin düşümü. */
  tarihAralikDusumler: TarihAralikDusum[];
};

export type IsAramaResult = {
  workPeriod: WorkPeriod;
  toplamBrut: number;
  weeks: number;
  toplamIsAramaGunu: number;
  toplamIsAramaSaati: number;
  dusumSaati: number;
  netIsAramaSaati: number;
  saatlikUcret: number;
  brut: number;
  sskPrimi: number;
  issizlikPrimi: number;
  gelirVergisi: number;
  gelirVergisiDilimleri: string;
  damgaVergisi: number;
  net: number;
};

export type SavedCase = {
  id: string;
  name: string;
  version: 1;
  updatedAt: string;
  form: IsAramaForm;
  results: {
    toplamBrut: number;
    brut: number;
    net: number;
  };
};

export function newLocalId(prefix = "ia"): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function createEmptyForm(): IsAramaForm {
  return {
    startDate: "",
    endDate: "",
    brut: "",
    prim: "",
    ikramiye: "",
    yol: "",
    yemek: "",
    extras: [],
    haftalikCalismaGunu: "5",
    kullandirilanIzinGun: "",
    tarihAralikDusumler: [],
  };
}

export function snapshotKey(form: IsAramaForm): string {
  return JSON.stringify({
    a: form.startDate,
    b: form.endDate,
    c: form.brut,
    p: form.prim,
    i: form.ikramiye,
    y: form.yol,
    m: form.yemek,
    e: form.extras.map((x) => [x.label, x.value]),
    h: form.haftalikCalismaGunu,
    k: form.kullandirilanIzinGun,
    d: form.tarihAralikDusumler.map((x) => [x.baslangic, x.bitis, x.gunlukSaat]),
  });
}

/** V3 `NOTE_ITEMS` — İş Kanunu m.27 (yalnızca bu metinler). */
export const NOTE_BLOCKS: Array<{ text: string; kind?: "heading" }> = [
  { text: "İş Arama İzni Ücreti", kind: "heading" },
  {
    text: "İşveren tarafından süreli fesihte, ihbar öneli süresince işçiye günde en az 2 saat iş arama izni verilmesi zorunludur.",
  },
  { text: "İşçiye iş arama izni verilmezse, işveren bu süreye ait ücret tutarını ödemekle yükümlüdür." },
  { text: "İhbar süreleri İş Kanunu Madde 17'ye göre belirlenir." },
  { text: "Yeni iş arama izni", kind: "heading" },
  { text: "Madde 27-", kind: "heading" },
  {
    text: "Bildirim süreleri içinde işveren, işçiye yeni bir iş bulması için gerekli olan iş arama iznini iş saatleri içinde ve ücret kesintisi yapmadan vermeye mecburdur. İş arama izninin süresi günde iki saatten az olamaz ve işçi isterse iş arama izin saatlerini birleştirerek toplu kullanabilir. Ancak iş arama iznini toplu kullanmak isteyen işçi, bunu işten ayrılacağı günden evvelki günlere rastlatmak ve bu durumu işverene bildirmek zorundadır.",
  },
  { text: "İşveren yeni iş arama iznini vermez veya eksik kullandırırsa o süreye ilişkin ücret işçiye ödenir." },
  {
    text: "İşveren, iş arama izni esnasında işçiyi çalıştırır ise işçinin izin kullanarak bir çalışma karşılığı olmaksızın alacağı ücrete ilaveten, çalıştırdığı sürenin ücretini yüzde yüz zamlı öder.",
  },
];
