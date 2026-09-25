export type IcraVariant = "damga" | "gelir-damga" | "istisnali-full" | "istisnasiz-full";

export type IcraForm = {
  grossForNet: string;
  year: number;
  period: 1 | 2;
  faizBaslangic: string;
  icraTakip: string;
  faizTuru: "yasal" | "en_yuksek_mevduat";
};

export type IcraResults = {
  netTutar: number;
  totalInterest: number;
  takipToplami: number;
  totalDays: number;
};

export type SavedCase = {
  id: string;
  name: string;
  version: 1;
  variant: IcraVariant;
  updatedAt: string;
  form: IcraForm;
  results: IcraResults;
};

export function newLocalId(prefix = "icra"): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createEmptyForm(): IcraForm {
  return {
    grossForNet: "",
    year: new Date().getFullYear(),
    period: 2,
    faizBaslangic: "",
    icraTakip: "",
    faizTuru: "yasal",
  };
}

export function snapshotKey(form: IcraForm): string {
  return JSON.stringify(form);
}

export function storageKeyFor(variant: IcraVariant): string {
  return `bilirkisi-hesap-v35:icra-takip-${variant}:cases:v1`;
}
