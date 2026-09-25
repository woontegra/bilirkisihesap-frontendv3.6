export type LegalInterestRatePeriod = {
  startDate: string;
  endDate: string | null;
  rate: number;
};

export const legalInterestRates: LegalInterestRatePeriod[] = [
  {
    startDate: "2026-07-31",
    endDate: null,
    rate: 31,
  },
  {
    startDate: "2024-06-01",
    endDate: "2026-07-30",
    rate: 24,
  },
  {
    startDate: "2006-01-01",
    endDate: "2024-05-31",
    rate: 9,
  },
  {
    startDate: "2005-05-01",
    endDate: "2005-12-31",
    rate: 12,
  },
  {
    startDate: "2004-07-01",
    endDate: "2005-04-30",
    rate: 38,
  },
  {
    startDate: "2004-01-01",
    endDate: "2004-06-30",
    rate: 43,
  },
  {
    startDate: "2003-07-01",
    endDate: "2003-12-31",
    rate: 50,
  },
  {
    startDate: "2002-07-01",
    endDate: "2003-06-30",
    rate: 55,
  },
  {
    startDate: "2000-01-01",
    endDate: "2002-06-30",
    rate: 60,
  },
  {
    startDate: "1998-01-01",
    endDate: "1999-12-31",
    rate: 50,
  },
  {
    startDate: "1984-12-19",
    endDate: "1997-12-31",
    rate: 30,
  },
];
