/**
 * Gemi Adamı 7/24 Fazla Mesai — sayfaya özel veri modeli (V3 state hizalı).
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

export type ZamanasimiInfo = {
  davaTarihi: string;
  arabuluculukBaslangic: string;
  arabuluculukBitis: string;
  nihaiBaslangic: string;
} | null;

export type WitnessInput = {
  id: string;
  name: string;
  dateIn: string;
  dateOut: string;
};

export type RowOverride = {
  weeks?: number;
  brut?: number;
  fmHours?: number;
  startISO?: string;
  endISO?: string;
  hidden?: boolean;
  brutManual?: boolean;
  katsayi?: number;
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
  net: number;
  isDeductionRow?: boolean;
  yillikIzinAciklama?: string;
  note?: string;
  isManual?: boolean;
  insertAfter?: string;
  dailyNet?: number;
  annualLeaveHg?: number;
  annualLeaveSevenDay?: "tatilli" | "tatilsiz";
};

export type Gemi724FormSnapshot = {
  iseGiris: string;
  istenCikis: string;
  katSayi: string;
  witnesses: WitnessInput[];
  exclusions: ExclusionItem[];
  mode270: Mode270;
  mahsup: string;
  notes: string;
  zamanasimi: ZamanasimiInfo;
  rowOverrides: Record<string, RowOverride>;
  manualRows: PeriodRow[];
  /** V3 state’te var; 7/24 UI’da seçici yok. */
  haftaTatiliGunu: number | "";
};

export type Gemi724Result = {
  fixedFmHoursWeekly: number;
  rows: PeriodRow[];
  totalFm: number;
  totalNet: number;
  sgk: number;
  issizlik: number;
  gelirVergisi: number;
  gelirVergisiDilimleri: string;
  damgaVergisi: number;
  netYillik: number;
  hakkaniyetIndirimi: number;
  mahsupTutari: number;
  sonNet: number;
};

export type SavedCase = {
  id: string;
  name: string;
  version: 1;
  updatedAt: string;
  form: Gemi724FormSnapshot;
  result: { totalFm: number; totalNet: number; sonNet: number };
};

export function newLocalId(prefix = "g724"): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function createEmptyWitness(): WitnessInput {
  return { id: newLocalId("w"), name: "", dateIn: "", dateOut: "" };
}

export function createEmptyForm(): Gemi724FormSnapshot {
  return {
    iseGiris: "",
    istenCikis: "",
    katSayi: "1",
    witnesses: [],
    exclusions: [],
    mode270: "none",
    mahsup: "",
    notes: "",
    zamanasimi: null,
    rowOverrides: {},
    manualRows: [],
    haftaTatiliGunu: "",
  };
}
