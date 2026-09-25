export type SavedCase = {
  id: number;
  name?: string;
  aciklama?: string;
  kayit_adi?: string;
  type: string;
  hesaplama_tipi?: string;
  data?: Record<string, unknown>;
  detay?: Record<string, unknown> | string;
  created_at?: string;
  createdAt?: string;
  updated_at?: string;
  updatedAt?: string;
  brut_total?: number;
  net_total?: number;
  brut_toplam?: number;
  net_toplam?: number;
};

export type DemoLicense = {
  expiresAt: string;
  createdAt: string;
  activatedAt: string;
  type: string;
};

export type UserInfo = {
  id: number;
  email: string;
  name?: string;
  role?: string;
  tenantId?: number;
  createdAt?: string;
  subscriptionType?: string;
  subscriptionStartsAt?: string;
  subscriptionEndsAt?: string;
  licenseActive?: boolean;
  licenseStatus?: string | null;
  licenseType?: string | null;
  status?: string;
  demoLicense?: DemoLicense;
};

export type FinancialSummary = {
  activeSubscriptionCount: number;
  annualPlanCount: number;
  monthlyPlanCount: number;
  averageLicenseDurationDays: number;
  demoUserCount: number;
  demoToSaleConversionRate: number;
  newSubscriptionsLast30Days: number;
  licensesExpiringIn7Days: number;
  estimatedMRR: number | null;
  hasPriceConfig: boolean;
};

export type DashboardData = {
  savedCases: SavedCase[];
  userInfo: UserInfo | null;
  financial: FinancialSummary | null;
  financialError: string | null;
  connectionError: string | null;
};

export type DataSourceMode = "mock" | "api";

export type NotificationItem = {
  id: number;
  title: string;
  message?: string;
  type?: string;
  created_at?: string;
  createdAt?: string;
  read?: boolean;
};
