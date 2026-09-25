/**
 * Ayrımcılık Tazminatı — sayfaya özel veri modeli.
 * %100 lokal ve diğer hesaplama sayfalarından izole.
 */

export type CoefRow = {
  k: number; // ay katsayısı (1..4)
  label: string;
  value: number; // brüt × k (V3 rounding ile)
};

export type WorkPeriod = {
  years: number;
  months: number;
  days: number;
  label: string;
};

export type AyrimcilikResult = {
  coefRows: CoefRow[];
  brutVal: number;
  brutForNetConversion: number;
  gelirVergisi: number;
  gelirVergisiDilimleri: string;
  damgaVergisi: number;
  netTazminat: number;
  workPeriod: WorkPeriod | null;
  asgariUcretHatasi: string | null;
};

export type AyrimcilikForm = {
  startDate: string;
  endDate: string;
  brut: string; // çıplak brüt
  brutInputForNet: string; // opsiyonel net dönüşüm brütü
  /** Opsiyonel brüt boşsa brütten nete için kullanılacak ay katsayısı (1–4). */
  netAyKatsayi: 1 | 2 | 3 | 4;
};

export type SavedCase = {
  id: string;
  name: string;
  version: 1;
  updatedAt: string;
  form: AyrimcilikForm;
  results: {
    brutForNetConversion: number;
    gelirVergisi?: number;
    damgaVergisi?: number;
    netTazminat: number;
  };
};

export function normalizeNetAyKatsayi(value: unknown): 1 | 2 | 3 | 4 {
  const n = typeof value === "number" ? value : Number(value);
  if (n === 1 || n === 2 || n === 3 || n === 4) return n;
  return 4;
}

export function createEmptyForm(): AyrimcilikForm {
  return {
    startDate: "",
    endDate: "",
    brut: "",
    brutInputForNet: "",
    netAyKatsayi: 4,
  };
}

export function newLocalId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `ay-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function snapshotKey(form: AyrimcilikForm): string {
  // dirty check için: sıfırdan geliştirilmiş local sayfa
  return [form.startDate, form.endDate, form.brut, form.brutInputForNet, String(form.netAyKatsayi)].join("|");
}

export const NOTE_BLOCKS: Array<{ text: string; variant?: "alert" }> = [
  {
    text: "193 sayılı Kanuna Göre; Ayrımcılık tazminatı ile ilgili mevzuatta açık bir hüküm olmamasından dolayı Gelir İdaresi Başkanlığı Büyük Mükellefler Vergi Dairesi Başkanlığı Mükellef Hizmetleri Grup Müdürlüğünün 16.08.2013 tarih 64597866-125[6-2013]-127 sayılı özelgesinde ayrımcılık tazminatı ücret olarak Gelir Vergisi Kanununun 94 üncü maddesine göre gelir vergisi tevkifatına tabi tutulması gerektiği belirtilmiştir.",
    variant: "alert",
  },
  {
    text: 'Ayrımcılık tazminatı İş Kanunu\'nun "Eşit davranma ilkesi" başlıklı 5. Maddesi gereğince "(Ek: 6/2/2014-6518/57 md.) İş ilişkisinde dil, ırk, renk, cinsiyet, engellilik, siyasal düşünce, felsefî inanç, din ve mezhep ve benzeri sebeplere dayalı ayrım yapılamaz.',
  },
  {
    text: "İşveren, esaslı sebepler olmadıkça tam süreli çalışan işçi karşısında kısmî süreli çalışan işçiye, belirsiz süreli çalışan işçi karşısında belirli süreli çalışan işçiye farklı işlem yapamaz.",
  },
  {
    text: "İşveren, biyolojik veya işin niteliğine ilişkin sebepler zorunlu kılmadıkça, bir işçiye, iş sözleşmesinin yapılmasında, şartlarının oluşturulmasında, uygulanmasında ve sona ermesinde, cinsiyet veya gebelik nedeniyle doğrudan veya dolaylı farklı işlem yapamaz.",
  },
  {
    text: "Aynı veya eşit değerde bir iş için cinsiyet nedeniyle daha düşük ücret kararlaştırılamaz.",
  },
  {
    text: "İşçinin cinsiyeti nedeniyle özel koruyucu hükümlerin uygulanması, daha düşük bir ücretin uygulanmasını haklı kılmaz.",
  },
  {
    text: "İş ilişkisinde veya sona ermesinde yukarıdaki fıkra hükümlerine aykırı davranıldığında işçi, dört aya kadar ücreti tutarındaki uygun bir tazminattan başka yoksun bırakıldığı haklarını da talep edebilir. 2821 sayılı Sendikalar Kanununun 31 inci maddesi hükümleri saklıdır.",
  },
  {
    text: "20 nci madde hükümleri saklı kalmak üzere işverenin yukarıdaki fıkra hükümlerine aykırı davrandığını işçi ispat etmekle yükümlüdür. Ancak, işçi bir ihlalin varlığı ihtimalini güçlü bir biçimde gösteren bir durumu ortaya koyduğunda, işveren böyle bir ihlalin mevcut olmadığını ispat etmekle yükümlü olur.",
  },
  {
    text: "Bu sebeple de 854 sayılı Deniz İş Kanunu, 5953 sayılı Basın İş Kanunu ve 6098 sayılı Türk Borçlar Kanunu kapsamında çalışan işçiler ayrımcılık tazminat hakkına sahip değildirler.",
    variant: "alert",
  },
];

