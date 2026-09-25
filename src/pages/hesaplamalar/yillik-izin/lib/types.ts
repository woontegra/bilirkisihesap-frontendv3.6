/**
 * Yıllık Ücretli İzin — varyantlar arası paylaşılan tip tanımları.
 * Yalnızca yillik-izin modülü içinde paylaşılır.
 */

export type EntitlementLine = { label: string; value: string };

export type StandardYillikFormBase = {
  startDate: string;
  endDate: string;
  brut: string;
  usedRows: UsedLeaveRow[];
  /** Davalı / işveren mahsup ödemesi (V3 employerPayment). */
  employerPayment?: string;
};

export type StandardYillikForm = StandardYillikFormBase & {
  is18Or50: boolean;
  isUnderground: boolean;
};

export type StandardComputeResult = {
  workPeriodLabel: string;
  entitlementLines: EntitlementLine[];
  breakdown?: {
    y1: number;
    y2: number;
    y3: number;
    d1: number;
    d2: number;
    d3: number;
    total: number;
    daysPerYear1: number;
    daysPerYear2: number;
    daysPerYear3: number;
  };
  totalEntitlement: number;
  usedTotal: number;
  remainingDays: number;
  formulaText: string;
  brutIzin: number;
  sgk: number;
  issizlik: number;
  gelirVergisi: number;
  gelirVergisiDilimleri: string;
  damgaVergisi: number;
  netIzin: number;
  asgariUcretHatasi: string | null;
};

export type UsedLeaveRow = {
  id: string;
  start: string;
  end: string;
  days: string;
};

export type NoteBlock = { text: string; kind?: "heading" | "li"; emphasis?: "warning" };

export type YillikResultSnapshot = {
  totalEntitlement: number;
  remainingDays: number;
  brutIzin: number;
  sgk: number;
  issizlik: number;
  gelirVergisi: number;
  damgaVergisi: number;
  netIzin: number;
};

export type CaseListEntry = {
  id: string;
  name: string;
  updatedAt: string;
  subtitle: string;
};

export type GemiWorkPeriod = {
  id: string;
  iseGiris: string;
  istenCikis: string;
  gunSayisi?: number;
};
