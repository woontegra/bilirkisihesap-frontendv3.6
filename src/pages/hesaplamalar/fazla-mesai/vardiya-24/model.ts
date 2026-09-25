/**
 * Fazla Mesai — 24 Saat Vardiya — sayfa modeli (V3 paritesi, izole).
 */

export type Mode270 = "none" | "simple" | "detailed";

/** V3 ile birebir 5 dışlama türü. */
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

export type Witness = {
  id: string;
  name: string;
  dateIn: string;
  dateOut: string;
};

export type ZamanasimiInfo = {
  davaTarihi: string;
  arabuluculukBaslangic: string;
  arabuluculukBitis: string;
  nihaiBaslangic: string;
} | null;

export type RowOverride = {
  weeks?: number;
  brut?: number;
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
  weeks: number;
  brut: number;
  katsayi: number;
  fmHours: number;
  fm: number;
  weekTypeLabel?: string;
  note?: string;
  yillikIzinAciklama?: string;
  isDeductionRow?: boolean;
  isManual?: boolean;
  insertAfter?: string;
};

export type Vardiya24FormSnapshot = {
  iseGiris: string;
  istenCikis: string;
  /** true → ilk gün çalıştı; false → ilk gün dinlendi. */
  anchorIsWorkDay: boolean;
  taniklar: Witness[];
  exclusions: ExclusionItem[];
  katSayi: string;
  /** V3 kayıtlarda her zaman "none"; UI'da select vardır, motor uygulamaz. */
  mode270: Mode270;
  mahsup: string;
  notes: string;
  zamanasimi: ZamanasimiInfo;
  rowOverrides: Record<string, RowOverride>;
  manualRows: PeriodRow[];
};

export type Vardiya24Result = {
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
  dateError: string | null;
};

export type SavedCase = {
  id: string;
  name: string;
  version: 2;
  updatedAt: string;
  form: Vardiya24FormSnapshot;
  result: {
    toplamFm: number;
    sonNet: number;
    rowCount: number;
  };
};

export function newLocalId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `v24-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function createEmptyWitness(): Witness {
  return { id: newLocalId(), name: "", dateIn: "", dateOut: "" };
}

export function createEmptyForm(): Vardiya24FormSnapshot {
  return {
    iseGiris: "",
    istenCikis: "",
    anchorIsWorkDay: true,
    taniklar: [createEmptyWitness()],
    exclusions: [],
    katSayi: "1",
    mode270: "none",
    mahsup: "",
    notes: "",
    zamanasimi: null,
    rowOverrides: {},
    manualRows: [],
  };
}

export function cloneExclusions(items: ExclusionItem[]): ExclusionItem[] {
  return items.map((item) => ({ ...item }));
}
