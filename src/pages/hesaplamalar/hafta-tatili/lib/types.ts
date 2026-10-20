/** Hafta Tatili — paylaşılan tipler (lib içi). */

export type ExcludedDay = {
  id: string;
  type: "Yıllık İzin" | "Rapor" | "Diğer" | "UBGT";
  start: string;
  end: string;
  days: number;
};

export type DateRange = {
  id: string;
  start: string;
  end: string;
};

export type TableRow = {
  id: string;
  period: string;
  startISO: string;
  endISO: string;
  weekCount: number;
  wage: number;
  coefficient: number;
  dailyWage: number;
  daily50: number;
  haftaTatiliDays: number;
  haftaTatiliTotal: number;
  manual?: boolean;
  manualWeekCount?: boolean;
  /** Manuel brüt şablondan uygulandı */
  brutManual?: boolean;
};

export type NetBreakdown = {
  ssk: number;
  issizlik: number;
  gelirVergisi: number;
  gelirVergisiDilimleri: string;
  damgaVergisi: number;
  netAmount: number;
};
