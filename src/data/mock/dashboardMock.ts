import type { DashboardData, FinancialSummary, SavedCase, UserInfo } from "@/api/types";

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

function monthsAgo(n: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return d.toISOString();
}

const MOCK_CASES: SavedCase[] = [
  {
    id: 101,
    name: "Ahmet Yılmaz — Kıdem",
    type: "kidem_standart",
    created_at: daysAgo(1),
    updated_at: daysAgo(1),
    brut_total: 245_800,
    net_total: 218_450,
    data: {
      iseGiris: "2018-03-12",
      istenCikis: "2025-11-01",
      brutUcret: 42_500,
    },
  },
  {
    id: 102,
    name: "Elif Demir — Fazla Mesai",
    type: "fazla_mesai_standart",
    created_at: daysAgo(3),
    updated_at: daysAgo(3),
    brut_total: 38_920,
    net_total: 34_100,
  },
  {
    id: 103,
    name: "Murat Kaya — İhbar",
    type: "ihbar_standart",
    created_at: daysAgo(5),
    updated_at: daysAgo(5),
    brut_total: 86_400,
    net_total: 76_200,
  },
  {
    id: 104,
    name: "Zeynep Arslan — Yıllık İzin",
    type: "yillik_izin_standart",
    created_at: daysAgo(8),
    updated_at: daysAgo(8),
    brut_total: 22_150,
    net_total: 19_800,
  },
  {
    id: 105,
    name: "Can Öztürk — UBGT",
    type: "ubgt_alacagi",
    created_at: daysAgo(12),
    updated_at: daysAgo(12),
    brut_total: 15_640,
    net_total: 13_900,
  },
  {
    id: 106,
    name: "Selin Acar — Hafta Tatili",
    type: "hafta_tatili_standart",
    created_at: monthsAgo(1),
    updated_at: monthsAgo(1),
    brut_total: 9_870,
    net_total: 8_750,
  },
  {
    id: 107,
    name: "Burak Şahin — Ücret",
    type: "ucret_alacagi",
    created_at: monthsAgo(1),
    updated_at: monthsAgo(1),
    brut_total: 54_300,
    net_total: 48_100,
  },
  {
    id: 108,
    name: "Ayşe Koç — Kıdem",
    type: "kidem_30isci",
    created_at: monthsAgo(2),
    updated_at: monthsAgo(2),
    brut_total: 312_000,
    net_total: 278_500,
  },
  {
    id: 109,
    name: "Emre Yıldız — İhbar",
    type: "ihbar_standart",
    created_at: monthsAgo(2),
    updated_at: monthsAgo(2),
    brut_total: 41_200,
    net_total: 36_400,
  },
  {
    id: 110,
    name: "Deniz Polat — Fazla Mesai",
    type: "fazla_mesai_vardiya",
    created_at: monthsAgo(3),
    updated_at: monthsAgo(3),
    brut_total: 27_600,
    net_total: 24_300,
  },
];

const MOCK_USER: UserInfo = {
  id: 1,
  email: "demo@bilirkisihesap.com",
  name: "Demo Kullanıcı",
  createdAt: monthsAgo(8),
  subscriptionType: "annual",
  subscriptionStartsAt: (() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 4);
    return d.toISOString();
  })(),
  subscriptionEndsAt: (() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 8);
    return d.toISOString();
  })(),
  status: "active",
};

const MOCK_FINANCIAL: FinancialSummary = {
  activeSubscriptionCount: 248,
  annualPlanCount: 162,
  monthlyPlanCount: 86,
  averageLicenseDurationDays: 287,
  demoUserCount: 54,
  demoToSaleConversionRate: 31.4,
  newSubscriptionsLast30Days: 19,
  licensesExpiringIn7Days: 7,
  estimatedMRR: 186_400,
  hasPriceConfig: true,
};

export async function fetchDashboardMock(isAdmin: boolean): Promise<DashboardData> {
  await new Promise((resolve) => setTimeout(resolve, 650));

  return {
    savedCases: MOCK_CASES,
    userInfo: MOCK_USER,
    financial: isAdmin ? MOCK_FINANCIAL : null,
    financialError: null,
    connectionError: null,
  };
}

export async function fetchDashboardMockEmpty(isAdmin: boolean): Promise<DashboardData> {
  await new Promise((resolve) => setTimeout(resolve, 400));
  return {
    savedCases: [],
    userInfo: {
      ...MOCK_USER,
      subscriptionStartsAt: undefined,
      subscriptionEndsAt: undefined,
    },
    financial: isAdmin
      ? {
          ...MOCK_FINANCIAL,
          activeSubscriptionCount: 0,
          annualPlanCount: 0,
          monthlyPlanCount: 0,
          demoUserCount: 0,
          newSubscriptionsLast30Days: 0,
          licensesExpiringIn7Days: 0,
          estimatedMRR: null,
          hasPriceConfig: false,
        }
      : null,
    financialError: null,
    connectionError: null,
  };
}

export async function fetchDashboardMockError(): Promise<DashboardData> {
  await new Promise((resolve) => setTimeout(resolve, 400));
  return {
    savedCases: [],
    userInfo: null,
    financial: null,
    financialError: "Finansal özet yüklenemedi. Yönetici oturumu ve API bağlantısını kontrol edin.",
    connectionError: "Sunucuya bağlanılamadı. Ağ bağlantınızı veya API adresini kontrol edin.",
  };
}
