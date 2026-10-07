/**
 * Ortak ücret kesinti tabloları.
 * Kaynak: Standart Fazla Mesai'de onaylanan 1996–2009 tarifeleri ve oranlar.
 * 2010 ve sonrası dilimler incomeTaxCore içinde kalır; o tablolar değiştirilmez.
 * 2005 öncesi eşik ve baseTax, iç ölçeğe yalnız bir kez 1.000.000'a bölünür.
 */
import {
  applyWageIncomeTaxBrackets,
  modernWageIncomeTaxBrackets,
  WageIncomeTaxError,
  type TaxBracket,
} from "../../fazla-mesai/standart/v3-engine/lib/incomeTaxCore";

export { WageIncomeTaxError };

const TRL_DIVISOR = 1_000_000;

type RawBracket = {
  limit: number | null;
  rate: number;
  baseLimit: number;
  baseTax: number;
};

type TariffPeriod = {
  start: string;
  end: string;
  brackets: TaxBracket[];
};

function scaleBrackets(raw: RawBracket[], divisor: number): TaxBracket[] {
  return raw.map((bracket) => ({
    limit: bracket.limit === null ? null : bracket.limit / divisor,
    rate: bracket.rate,
    baseLimit: bracket.baseLimit / divisor,
    baseTax: bracket.baseTax / divisor,
  }));
}

function oldTl(raw: RawBracket[]): TaxBracket[] {
  return scaleBrackets(raw, TRL_DIVISOR);
}

function tryScale(raw: RawBracket[]): TaxBracket[] {
  return scaleBrackets(raw, 1);
}

/** 2003–2009 baseTax, verilen eşik ve oranların dilim dilim birikimidir. */
const WAGE_TARIFF_PERIODS: TariffPeriod[] = [
  {
    start: "1996-01-01",
    end: "1996-12-31",
    brackets: oldTl([
      { limit: 300_000_000, rate: 0.25, baseLimit: 0, baseTax: 0 },
      { limit: 600_000_000, rate: 0.3, baseLimit: 300_000_000, baseTax: 75_000_000 },
      { limit: 1_200_000_000, rate: 0.35, baseLimit: 600_000_000, baseTax: 165_000_000 },
      { limit: 2_400_000_000, rate: 0.4, baseLimit: 1_200_000_000, baseTax: 375_000_000 },
      { limit: 4_800_000_000, rate: 0.45, baseLimit: 2_400_000_000, baseTax: 855_000_000 },
      { limit: 9_600_000_000, rate: 0.5, baseLimit: 4_800_000_000, baseTax: 1_935_000_000 },
      { limit: null, rate: 0.55, baseLimit: 9_600_000_000, baseTax: 4_335_000_000 },
    ]),
  },
  {
    start: "1997-01-01",
    end: "1997-12-31",
    brackets: oldTl([
      { limit: 500_000_000, rate: 0.25, baseLimit: 0, baseTax: 0 },
      { limit: 1_000_000_000, rate: 0.3, baseLimit: 500_000_000, baseTax: 125_000_000 },
      { limit: 2_000_000_000, rate: 0.35, baseLimit: 1_000_000_000, baseTax: 275_000_000 },
      { limit: 4_000_000_000, rate: 0.4, baseLimit: 2_000_000_000, baseTax: 625_000_000 },
      { limit: 8_000_000_000, rate: 0.45, baseLimit: 4_000_000_000, baseTax: 1_425_000_000 },
      { limit: 16_000_000_000, rate: 0.5, baseLimit: 8_000_000_000, baseTax: 3_225_000_000 },
      { limit: null, rate: 0.55, baseLimit: 16_000_000_000, baseTax: 7_225_000_000 },
    ]),
  },
  {
    start: "1998-01-01",
    end: "1998-06-30",
    brackets: oldTl([
      { limit: 750_000_000, rate: 0.25, baseLimit: 0, baseTax: 0 },
      { limit: 1_500_000_000, rate: 0.3, baseLimit: 750_000_000, baseTax: 187_500_000 },
      { limit: 3_000_000_000, rate: 0.35, baseLimit: 1_500_000_000, baseTax: 412_500_000 },
      { limit: 6_000_000_000, rate: 0.4, baseLimit: 3_000_000_000, baseTax: 937_500_000 },
      { limit: 12_000_000_000, rate: 0.45, baseLimit: 6_000_000_000, baseTax: 2_137_500_000 },
      { limit: 24_000_000_000, rate: 0.5, baseLimit: 12_000_000_000, baseTax: 4_837_500_000 },
      { limit: null, rate: 0.55, baseLimit: 24_000_000_000, baseTax: 10_837_500_000 },
    ]),
  },
  {
    start: "1998-07-01",
    end: "1998-12-31",
    brackets: oldTl([
      { limit: 1_000_000_000, rate: 0.2, baseLimit: 0, baseTax: 0 },
      { limit: 2_000_000_000, rate: 0.25, baseLimit: 1_000_000_000, baseTax: 200_000_000 },
      { limit: 4_000_000_000, rate: 0.3, baseLimit: 2_000_000_000, baseTax: 450_000_000 },
      { limit: 8_000_000_000, rate: 0.35, baseLimit: 4_000_000_000, baseTax: 1_050_000_000 },
      { limit: 16_000_000_000, rate: 0.4, baseLimit: 8_000_000_000, baseTax: 2_450_000_000 },
      { limit: null, rate: 0.45, baseLimit: 16_000_000_000, baseTax: 5_650_000_000 },
    ]),
  },
  {
    start: "1999-01-01",
    end: "1999-12-31",
    brackets: oldTl([
      { limit: 2_000_000_000, rate: 0.15, baseLimit: 0, baseTax: 0 },
      { limit: 5_000_000_000, rate: 0.2, baseLimit: 2_000_000_000, baseTax: 300_000_000 },
      { limit: 10_000_000_000, rate: 0.25, baseLimit: 5_000_000_000, baseTax: 900_000_000 },
      { limit: 25_000_000_000, rate: 0.3, baseLimit: 10_000_000_000, baseTax: 2_150_000_000 },
      { limit: 50_000_000_000, rate: 0.35, baseLimit: 25_000_000_000, baseTax: 6_650_000_000 },
      { limit: null, rate: 0.4, baseLimit: 50_000_000_000, baseTax: 15_400_000_000 },
    ]),
  },
  {
    start: "2000-01-01",
    end: "2000-12-31",
    brackets: oldTl([
      { limit: 2_500_000_000, rate: 0.15, baseLimit: 0, baseTax: 0 },
      { limit: 6_250_000_000, rate: 0.2, baseLimit: 2_500_000_000, baseTax: 375_000_000 },
      { limit: 12_500_000_000, rate: 0.25, baseLimit: 6_250_000_000, baseTax: 1_125_000_000 },
      { limit: 31_250_000_000, rate: 0.3, baseLimit: 12_500_000_000, baseTax: 2_687_500_000 },
      { limit: 62_500_000_000, rate: 0.35, baseLimit: 31_250_000_000, baseTax: 8_312_500_000 },
      { limit: null, rate: 0.4, baseLimit: 62_500_000_000, baseTax: 19_250_000_000 },
    ]),
  },
  {
    start: "2001-01-01",
    end: "2001-12-31",
    brackets: oldTl([
      { limit: 2_800_000_000, rate: 0.15, baseLimit: 0, baseTax: 0 },
      { limit: 7_000_000_000, rate: 0.2, baseLimit: 2_800_000_000, baseTax: 420_000_000 },
      { limit: 14_000_000_000, rate: 0.25, baseLimit: 7_000_000_000, baseTax: 1_260_000_000 },
      { limit: 35_000_000_000, rate: 0.3, baseLimit: 14_000_000_000, baseTax: 3_010_000_000 },
      { limit: 70_000_000_000, rate: 0.35, baseLimit: 35_000_000_000, baseTax: 9_310_000_000 },
      { limit: null, rate: 0.4, baseLimit: 70_000_000_000, baseTax: 21_560_000_000 },
    ]),
  },
  {
    start: "2002-01-01",
    end: "2002-12-31",
    brackets: oldTl([
      { limit: 3_800_000_000, rate: 0.15, baseLimit: 0, baseTax: 0 },
      { limit: 9_500_000_000, rate: 0.2, baseLimit: 3_800_000_000, baseTax: 570_000_000 },
      { limit: 19_000_000_000, rate: 0.25, baseLimit: 9_500_000_000, baseTax: 1_710_000_000 },
      { limit: 47_500_000_000, rate: 0.3, baseLimit: 19_000_000_000, baseTax: 4_085_000_000 },
      { limit: 95_000_000_000, rate: 0.35, baseLimit: 47_500_000_000, baseTax: 12_635_000_000 },
      { limit: null, rate: 0.4, baseLimit: 95_000_000_000, baseTax: 29_260_000_000 },
    ]),
  },
  {
    start: "2003-01-01",
    end: "2003-12-31",
    brackets: oldTl([
      { limit: 5_000_000_000, rate: 0.15, baseLimit: 0, baseTax: 0 },
      { limit: 12_000_000_000, rate: 0.2, baseLimit: 5_000_000_000, baseTax: 750_000_000 },
      { limit: 24_000_000_000, rate: 0.25, baseLimit: 12_000_000_000, baseTax: 2_150_000_000 },
      { limit: 60_000_000_000, rate: 0.3, baseLimit: 24_000_000_000, baseTax: 5_150_000_000 },
      { limit: 120_000_000_000, rate: 0.35, baseLimit: 60_000_000_000, baseTax: 15_950_000_000 },
      { limit: null, rate: 0.4, baseLimit: 120_000_000_000, baseTax: 36_950_000_000 },
    ]),
  },
  {
    start: "2004-01-01",
    end: "2004-12-31",
    brackets: oldTl([
      { limit: 6_000_000_000, rate: 0.15, baseLimit: 0, baseTax: 0 },
      { limit: 14_000_000_000, rate: 0.2, baseLimit: 6_000_000_000, baseTax: 900_000_000 },
      { limit: 28_000_000_000, rate: 0.25, baseLimit: 14_000_000_000, baseTax: 2_500_000_000 },
      { limit: 70_000_000_000, rate: 0.3, baseLimit: 28_000_000_000, baseTax: 6_000_000_000 },
      { limit: 140_000_000_000, rate: 0.35, baseLimit: 70_000_000_000, baseTax: 18_600_000_000 },
      { limit: null, rate: 0.4, baseLimit: 140_000_000_000, baseTax: 43_100_000_000 },
    ]),
  },
  {
    start: "2005-01-01",
    end: "2005-12-31",
    brackets: tryScale([
      { limit: 6600, rate: 0.15, baseLimit: 0, baseTax: 0 },
      { limit: 15000, rate: 0.2, baseLimit: 6600, baseTax: 990 },
      { limit: 30000, rate: 0.25, baseLimit: 15000, baseTax: 2670 },
      { limit: 78000, rate: 0.3, baseLimit: 30000, baseTax: 6420 },
      { limit: null, rate: 0.35, baseLimit: 78000, baseTax: 20820 },
    ]),
  },
  {
    start: "2006-01-01",
    end: "2006-12-31",
    brackets: tryScale([
      { limit: 7000, rate: 0.15, baseLimit: 0, baseTax: 0 },
      { limit: 18000, rate: 0.2, baseLimit: 7000, baseTax: 1050 },
      { limit: 40000, rate: 0.27, baseLimit: 18000, baseTax: 3250 },
      { limit: null, rate: 0.35, baseLimit: 40000, baseTax: 9190 },
    ]),
  },
  {
    start: "2007-01-01",
    end: "2007-12-31",
    brackets: tryScale([
      { limit: 7500, rate: 0.15, baseLimit: 0, baseTax: 0 },
      { limit: 19000, rate: 0.2, baseLimit: 7500, baseTax: 1125 },
      { limit: 43000, rate: 0.27, baseLimit: 19000, baseTax: 3425 },
      { limit: null, rate: 0.35, baseLimit: 43000, baseTax: 9905 },
    ]),
  },
  {
    start: "2008-01-01",
    end: "2008-12-31",
    brackets: tryScale([
      { limit: 7800, rate: 0.15, baseLimit: 0, baseTax: 0 },
      { limit: 19800, rate: 0.2, baseLimit: 7800, baseTax: 1170 },
      { limit: 44700, rate: 0.27, baseLimit: 19800, baseTax: 3570 },
      { limit: null, rate: 0.35, baseLimit: 44700, baseTax: 10293 },
    ]),
  },
  {
    start: "2009-01-01",
    end: "2009-12-31",
    brackets: tryScale([
      { limit: 8700, rate: 0.15, baseLimit: 0, baseTax: 0 },
      { limit: 22000, rate: 0.2, baseLimit: 8700, baseTax: 1305 },
      { limit: 50000, rate: 0.27, baseLimit: 22000, baseTax: 3965 },
      { limit: null, rate: 0.35, baseLimit: 50000, baseTax: 11525 },
    ]),
  },
];

const ACCRUAL_YEAR_MIN = 1996;
const ACCRUAL_YEAR_MAX = 2030;

/** İlk 10 karakter gerçek bir Gregoryen günü mü. Artık yıl ve ay uzunluğu kontrol edilir. */
export function isRealCalendarIso(value: string): boolean {
  const day = String(value ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const [year, month, date] = day.split("-").map(Number);
  const utc = new Date(Date.UTC(year, month - 1, date));
  return utc.getUTCFullYear() === year && utc.getUTCMonth() === month - 1 && utc.getUTCDate() === date;
}

export function assertAccrualIso(value: string): string {
  const day = String(value ?? "").slice(0, 10);
  if (!isRealCalendarIso(day)) {
    throw new WageIncomeTaxError("Son tahakkuk tarihi geçersiz. Brütten nete çevrim yapılmadı.");
  }
  return day;
}

function currentCalendarYear(): number {
  return new Date().getFullYear();
}

/**
 * Boş, yarım veya takvimde olmayan girdiden yıl.
 * 1996–2030 dışındaki yıl mevcut yıla düşer. Geçerli günler bu fonksiyona girmez.
 */
function fallbackAccrualYear(value: string): number {
  const match = /^(\d{4})/.exec(value.trim());
  if (!match) return currentCalendarYear();
  const year = Number(match[1]);
  if (year >= ACCRUAL_YEAR_MIN && year <= ACCRUAL_YEAR_MAX) return year;
  return currentCalendarYear();
}

function calendarYear(day: string): number {
  return Number(day.slice(0, 4));
}

/**
 * Ekrandan gelen tahakkuk ancak gerçek bir günse ve yıl 1996 veya sonrasıysa kullanılabilir.
 * `0202-05-20` takvimde vardır; yıl sıfırla dolduğu için tamamlanmış tarih sayılmaz.
 */
export function isUsableAccrualIso(value: string): boolean {
  const day = String(value ?? "").trim().slice(0, 10);
  if (!isRealCalendarIso(day)) return false;
  return calendarYear(day) >= ACCRUAL_YEAR_MIN;
}

/**
 * 1996 ve sonrası gerçek gün aynen kalır.
 * Boş, yarım, takvimde olmayan gün ve sıfırla dolmuş yıl (`0202-05-20`) yıl sonuna düşer.
 * 1000–1995 arasındaki tamamlanmış gün burada kesilmez; oran kontrolü reddetmeye devam eder.
 */
export function resolveStandartFmAccrualIso(accrual: number | string): string {
  if (typeof accrual === "number" && Number.isInteger(accrual)) {
    return assertAccrualIso(`${accrual}-12-31`);
  }
  if (typeof accrual === "string") {
    const trimmed = accrual.trim();
    const day = trimmed.slice(0, 10);
    if (isUsableAccrualIso(trimmed)) return assertAccrualIso(trimmed);
    if (isRealCalendarIso(day) && calendarYear(day) >= 1000) return assertAccrualIso(day);
    return assertAccrualIso(`${fallbackAccrualYear(trimmed)}-12-31`);
  }
  return assertAccrualIso(`${currentCalendarYear()}-12-31`);
}

function requireKnownDay(iso: string): string {
  const day = assertAccrualIso(iso);
  if (day < "1996-01-01") {
    throw new WageIncomeTaxError(
      `${day} tarihi için kesinti oranı tanımlı değil. Başka bir dönemin oranı uygulanmadı.`,
    );
  }
  return day;
}

export function standartFmSgkOrani(iso: string): number {
  requireKnownDay(iso);
  return 0.14;
}

export function standartFmIssizlikOrani(iso: string): number {
  const day = requireKnownDay(iso);
  if (day <= "2000-05-31") return 0;
  if (day <= "2001-12-31") return 0.02;
  return 0.01;
}

export function standartFmDamgaOrani(iso: string): number {
  const day = requireKnownDay(iso);
  if (day <= "1999-08-15") return 0.0048;
  if (day <= "2009-12-31") return 0.006;
  if (day <= "2012-12-31") return 0.0066;
  return 0.00759;
}

export function wageIncomeTaxBracketsForDate(iso: string): TaxBracket[] {
  const day = requireKnownDay(iso);
  if (day <= "2009-12-31") {
    const period = WAGE_TARIFF_PERIODS.find((item) => item.start <= day && day <= item.end);
    if (!period) {
      throw new WageIncomeTaxError(
        `${day} tarihi için ücret gelir vergisi tarifesi tanımlı değil. 2010 tarifesine geçilmedi.`,
      );
    }
    return period.brackets;
  }
  return modernWageIncomeTaxBrackets(Number(day.slice(0, 4)));
}

export function wageIncomeTaxForDate(iso: string, matrah: number): { tax: number; brackets: string } {
  return applyWageIncomeTaxBrackets(wageIncomeTaxBracketsForDate(iso), matrah);
}

export function standartFmIssizlikLabel(rate: number): string {
  if (rate === 0) return "İşsizlik (%0)";
  if (rate === 0.02) return "İşsizlik (%2)";
  if (rate === 0.01) return "İşsizlik (%1)";
  return "İşsizlik";
}

export function standartFmDamgaLabel(rate: number): string {
  if (rate === 0.0048) return "Damga Vergisi (Binde 4,8)";
  if (rate === 0.006) return "Damga Vergisi (Binde 6)";
  if (rate === 0.0066) return "Damga Vergisi (Binde 6,6)";
  if (rate === 0.00759) return "Damga Vergisi (Binde 7,59)";
  return "Damga Vergisi";
}

export function standartFmWagePeriods(): TariffPeriod[] {
  return WAGE_TARIFF_PERIODS;
}
