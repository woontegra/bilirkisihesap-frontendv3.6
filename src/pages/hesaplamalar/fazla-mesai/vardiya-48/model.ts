/**
 * Fazla Mesai — 48 Saat Vardiya — sayfa modeli (V3 state hizalı).
 * İzolasyon: başka FM alt türüne import yok.
 */

export type Mode270 = "none" | "simple" | "detailed";

export type ExclusionType = "Yıllık İzin" | "Rapor" | "Diğer" | "UBGT" | "Puantaj/Bordro";

export const EXCLUSION_TYPES: readonly ExclusionType[] = [
  "Yıllık İzin",
  "Rapor",
  "Diğer",
  "UBGT",
  "Puantaj/Bordro",
];

export type ExclusionItem = {
  id: string;
  type: ExclusionType;
  start: string;
  end: string;
  days: number;
};

/** V3 ExcludedDay uyumluluğu (motor içi). */
export type ExcludedDay = ExclusionItem;

export type ZamanasimiInfo = {
  davaTarihi: string;
  arabuluculukBaslangic: string;
  arabuluculukBitis: string;
  nihaiBaslangic: string;
} | null;

export type Witness = {
  id: string;
  name: string;
  dateIn: string;
  dateOut: string;
};

export type RowOverride = {
  weeks?: number;
  brut?: number;
  katsayi?: number;
  fmHours?: number;
  startISO?: string;
  endISO?: string;
  hidden?: boolean;
  brutManual?: boolean;
};

export type PeriodRow = {
  id: string;
  startISO: string;
  endISO: string;
  rangeLabel?: string;
  weeks: number;
  brut: number;
  katsayi: number;
  fmHours: number;
  calc225?: number;
  factor?: number;
  fm: number;
  net?: number;
  weekTypeLabel?: string;
  yillikIzinAciklama?: string;
  note?: string;
  isManual?: boolean;
  insertAfter?: string;
  isDeductionRow?: boolean;
};

export type Vardiya48FormSnapshot = {
  iseGiris: string;
  istenCikis: string;
  /** true = ilk gün çalıştı; false = ilk gün dinlendi. */
  anchorIsWorkDay: boolean;
  taniklar: Witness[];
  exclusions: ExclusionItem[];
  katSayi: string;
  mode270: Mode270;
  /** Zamanaşımı — V3'te form.zamanasimi; ayrı state olarak da tutulabilir. */
  zamanasimi: ZamanasimiInfo;
  mahsuplasmaMiktari: string;
  notes: string;
  rowOverrides: Record<string, RowOverride>;
  manualRows: PeriodRow[];
};

export type Vardiya48Result = {
  rows: PeriodRow[];
  toplamFm: number;
  sgk: number;
  issizlik: number;
  gelirVergisi: number;
  gelirVergisiDilimleri: string;
  damgaVergisi: number;
  netYillik: number;
  hakkaniyetIndirimi: number;
  mahsupTutari: number;
  sonNet: number;
  warnings: string[];
};

export type SavedCase = {
  id: string;
  name: string;
  version: 1;
  updatedAt: string;
  form: Vardiya48FormSnapshot;
  result: {
    toplamFm: number;
    haftaSayisi: number;
  };
};

export function newLocalId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `v48-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function createEmptyWitness(): Witness {
  return {
    id: newLocalId(),
    name: "",
    dateIn: "",
    dateOut: "",
  };
}

export function createEmptyForm(): Vardiya48FormSnapshot {
  return {
    iseGiris: "",
    istenCikis: "",
    anchorIsWorkDay: true,
    taniklar: [createEmptyWitness()],
    exclusions: [],
    katSayi: "1",
    mode270: "none",
    zamanasimi: null,
    mahsuplasmaMiktari: "",
    notes: "",
    rowOverrides: {},
    manualRows: [],
  };
}
