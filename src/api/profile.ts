import { apiClient, apiClientAsUser } from "@/api/client";
import {
  applyAuthMeResponse,
  decodeAccessTokenClaims,
  readAuthMeCache,
  writeAuthMeCache,
} from "@/auth/session";

/* ── User profile ─────────────────────────────────────────────── */

export type UserProfile = {
  id?: number;
  name: string;
  email: string;
  phone: string;
  company: string;
  role?: string;
};

export type BillingProfile = {
  invoiceType: "individual" | "corporate";
  fullName: string;
  email: string;
  phone: string;
  identityNumber: string;
  city: string;
  district: string;
  address: string;
  companyName: string;
  taxOffice: string;
  taxNumber: string;
  complete: boolean;
};

export type AuthMe = {
  id?: number;
  email?: string;
  name?: string;
  role?: string;
  tenantId?: number;
  customerCode?: string;
  subscriptionStartsAt?: string | null;
  subscriptionType?: string | null;
  subscriptionEndsAt?: string | null;
  createdAt?: string | null;
  licenseType?: string | null;
  licenseActive?: boolean;
  licenseAccessCode?: string | null;
  licenseStatus?: string | null;
  profilePicture?: string | null;
  profilePictureUrl?: string | null;
  emailNotifications?: boolean;
  loginAlerts?: boolean;
  /** Demo / geçici şifre — ilk girişte zorunlu şifre değişimi */
  mustChangePassword?: boolean;
  [key: string]: unknown;
};

export type RenewalPeriod = string | number;

export type RenewalCampaign = {
  name: string | null;
  startsAt: string | null;
  endsAt: string | null;
  discountAmount: number | null;
  discountPercent: number | null;
};

export type RenewalOption = {
  productType: string;
  period: RenewalPeriod;
  label: string;
  campaign: RenewalCampaign | null;
  normalPrice: number | null;
  discountAmount: number | null;
  discountPercent: number | null;
  finalAmount: number | null;
  currency: string;
};

export type RenewalOptions = {
  currentPackage: string | null;
  licenseEnd: string | null;
  remainingDays: number | null;
  linkedBaro: string | null;
  canRenew: boolean;
  normalPrice: number | null;
  discountAmount: number | null;
  discountPercent: number | null;
  finalAmount: number | null;
  currency: string;
  campaign: RenewalCampaign | null;
  options: RenewalOption[];
  message: string | null;
};

export type TicketStatus = "open" | "in_progress" | "resolved" | "closed";
export type TicketPriority = "low" | "medium" | "high" | "urgent";

export type TicketReply = {
  id: number;
  ticketId: number;
  userId?: number;
  message: string;
  isAdmin: boolean;
  createdAt: string;
};

export type Ticket = {
  id: number;
  tenantId?: number;
  userId?: number;
  subject: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  createdAt: string;
  updatedAt?: string;
  user?: { id: number; name: string; email: string };
  replies: TicketReply[];
};

export type SubUser = {
  id: number;
  name: string;
  email: string;
  role: "admin" | "user" | "viewer";
};

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function parseUserProfile(payload: unknown): UserProfile {
  const root = asRecord(payload);
  const nested = asRecord(root.data);
  const user = asRecord(nested.user ?? (Object.keys(nested).length ? nested : root));
  return {
    id: typeof user.id === "number" ? user.id : undefined,
    name: typeof user.name === "string" ? user.name : "",
    email: typeof user.email === "string" ? user.email : "",
    phone: typeof user.phone === "string" ? user.phone : "",
    company: typeof user.company === "string" ? user.company : "",
    role: typeof user.role === "string" ? user.role : undefined,
  };
}

const emptyBilling: BillingProfile = {
  invoiceType: "individual",
  fullName: "",
  email: "",
  phone: "",
  identityNumber: "",
  city: "",
  district: "",
  address: "",
  companyName: "",
  taxOffice: "",
  taxNumber: "",
  complete: false,
};

export function parseBillingProfile(payload: unknown): BillingProfile {
  const root = asRecord(payload);
  const data = asRecord(root.data);
  const bp = asRecord(data.billingProfile ?? data);
  const invoiceType = bp.invoiceType === "corporate" ? "corporate" : "individual";
  return {
    ...emptyBilling,
    ...bp,
    invoiceType,
    complete: Boolean(bp.complete),
  };
}

export async function fetchUserProfile(): Promise<UserProfile> {
  const data = await apiClient<unknown>("/api/user/profile");
  return parseUserProfile(data);
}

export async function updateUserProfile(body: {
  name: string;
  phone: string;
}): Promise<UserProfile> {
  const data = await apiClient<unknown>("/api/user/profile", {
    method: "PUT",
    body,
  });
  return parseUserProfile(data);
}

export async function fetchBillingProfile(): Promise<BillingProfile> {
  const data = await apiClient<unknown>("/api/user/billing-profile");
  return parseBillingProfile(data);
}

export async function updateBillingProfile(
  body: Omit<BillingProfile, "complete"> & { complete?: boolean },
): Promise<BillingProfile> {
  const data = await apiClient<unknown>("/api/user/billing-profile", {
    method: "PUT",
    body,
  });
  return parseBillingProfile(data);
}

let authMeInflight: { userId: number | null; promise: Promise<AuthMe> } | null = null;

export async function fetchAuthMe(options?: { force?: boolean }): Promise<AuthMe> {
  const userId = decodeAccessTokenClaims()?.userId ?? null;
  if (!options?.force && userId) {
    const cached = readAuthMeCache(userId);
    if (cached) return cached as AuthMe;
  }
  if (authMeInflight && authMeInflight.userId === userId) {
    return authMeInflight.promise;
  }
  const promise = (async () => {
    const me = await apiClient<AuthMe>("/api/auth/me");
    applyAuthMeResponse(me);
    const resolvedId = Number(me.id ?? userId);
    if (Number.isFinite(resolvedId) && resolvedId > 0) {
      writeAuthMeCache(resolvedId, me as Record<string, unknown>);
    }
    return me;
  })().finally(() => {
    if (authMeInflight?.promise === promise) authMeInflight = null;
  });
  authMeInflight = { userId, promise };
  return promise;
}

export async function changePassword(body: {
  oldPassword?: string;
  newPassword: string;
}): Promise<{ success?: boolean; mustChangePassword?: boolean }> {
  return apiClient<{ success?: boolean; mustChangePassword?: boolean }>("/api/auth/change-password", {
    method: "POST",
    body,
  });
}

export async function updateNotificationPrefs(body: {
  emailNotifications: boolean;
  loginAlerts: boolean;
}): Promise<void> {
  await apiClient("/api/auth/update-notifications", {
    method: "POST",
    body,
  });
}

/* ── Subscription renewal ─────────────────────────────────────── */

type UnknownRecord = Record<string, unknown>;

const firstValue = (source: UnknownRecord, keys: string[]): unknown => {
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null) return source[key];
  }
  return undefined;
};

const asString = (value: unknown): string | null => {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number") return String(value);
  return null;
};

const asLabel = (value: unknown, keys: string[]): string | null =>
  asString(value) ?? asString(firstValue(asRecord(value), keys));

const asNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const normalized = value.replace(/\s/g, "").replace(",", ".");
    const parsed = Number(normalized);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

const asBoolean = (value: unknown): boolean =>
  value === true || value === 1 || value === "1" || value === "true";

const unwrapPayload = (payload: unknown): UnknownRecord => {
  const root = asRecord(payload);
  const data = asRecord(root.data);
  return Object.keys(data).length ? data : root;
};

const priceFields = (source: UnknownRecord) => {
  const pricing = asRecord(firstValue(source, ["pricing", "price", "amounts"]));
  const discount = asRecord(firstValue(pricing, ["discount", "campaignDiscount"]));
  const merged = { ...source, ...pricing, ...discount };
  return {
    normalPrice: asNumber(firstValue(merged, ["normalPrice", "listPrice", "regularPrice", "price"])),
    discountAmount: asNumber(
      firstValue(merged, ["discountAmount", "campaignDiscount", "discount", "amount"]),
    ),
    discountPercent: asNumber(
      firstValue(merged, [
        "discountPercent",
        "discountRate",
        "campaignDiscountPercent",
        "percent",
      ]),
    ),
    finalAmount: asNumber(
      firstValue(merged, ["finalAmount", "finalPrice", "discountedPrice", "payableAmount"]),
    ),
    currency: asString(firstValue(merged, ["currency", "currencyCode"])) ?? "TRY",
  };
};

export function formatProductType(productType: string): string {
  const labels: Record<string, string> = {
    starter: "Başlangıç",
    professional: "Profesyonel",
    premium: "Profesyonel",
    annual: "Yıllık Standart",
    monthly: "Aylık Standart",
    trial: "Deneme",
    demo: "Demo",
  };
  return labels[productType.toLowerCase()] ?? productType;
}

export function formatPeriod(period: RenewalPeriod): string {
  if (typeof period === "number" || /^\d+$/.test(String(period))) {
    const months = Number(period);
    return months === 12 ? "1 yıl" : `${months} ay`;
  }
  const labels: Record<string, string> = {
    monthly: "Aylık",
    annual: "Yıllık",
    yearly: "Yıllık",
    "1_year": "1 yıl",
    "6_months": "6 ay",
    "12_months": "1 yıl",
  };
  return labels[String(period).toLowerCase()] ?? String(period);
}

const campaignFromRecord = (
  source: UnknownRecord,
  fallbackPrices?: ReturnType<typeof priceFields>,
): RenewalCampaign | null => {
  const campaignSource = asRecord(
    firstValue(source, ["campaign", "activeCampaign", "renewalCampaign"]),
  );
  const activeValue = firstValue(campaignSource, ["active", "isActive", "valid"]);
  if (
    Object.keys(campaignSource).length === 0 ||
    (activeValue !== undefined && !asBoolean(activeValue))
  ) {
    return null;
  }
  const campaignPrices = priceFields(campaignSource);
  return {
    name: asString(firstValue(campaignSource, ["name", "title", "campaignName"])),
    startsAt: asString(firstValue(campaignSource, ["startsAt", "startDate", "validFrom"])),
    endsAt: asString(firstValue(campaignSource, ["endsAt", "endDate", "validUntil"])),
    discountAmount: campaignPrices.discountAmount ?? fallbackPrices?.discountAmount ?? null,
    discountPercent: campaignPrices.discountPercent ?? fallbackPrices?.discountPercent ?? null,
  };
};

const optionFromRecord = (
  value: unknown,
  inherited: UnknownRecord = {},
): RenewalOption | null => {
  const option = { ...inherited, ...asRecord(value) };
  const productType = asString(
    firstValue(option, ["productType", "packageType", "package", "product"]),
  );
  const periodValue = firstValue(option, [
    "period",
    "periodCode",
    "duration",
    "periodMonths",
    "months",
    "value",
  ]);
  const period =
    typeof periodValue === "number" || (typeof periodValue === "string" && periodValue.trim())
      ? periodValue
      : null;
  if (!productType || period === null) return null;

  const prices = priceFields(option);
  const suppliedLabel = asString(firstValue(option, ["label", "name", "displayName"]));
  return {
    productType,
    period,
    label: suppliedLabel ?? `${formatProductType(productType)} · ${formatPeriod(period)}`,
    campaign: campaignFromRecord(option, prices),
    ...prices,
  };
};

const isSupportedRenewalOption = (option: RenewalOption): boolean => {
  const productType = option.productType.trim().toLowerCase();
  const period = String(option.period).trim().toLowerCase();
  return (
    (productType === "monthly" && ["0", "p1m", "monthly", "1_month"].includes(period)) ||
    (productType === "annual" && ["1", "p1y", "annual", "yearly", "1_year"].includes(period))
  );
};

const normalizeOptions = (source: UnknownRecord): RenewalOption[] => {
  const rawOptions = firstValue(source, [
    "options",
    "renewalOptions",
    "allowedOptions",
    "packageOptions",
    "allowedPackagePeriodOptions",
    "allowedPackages",
    "products",
  ]);
  const options: RenewalOption[] = [];

  if (Array.isArray(rawOptions)) {
    for (const rawOption of rawOptions) {
      const record = asRecord(rawOption);
      const periods = firstValue(record, ["periods", "allowedPeriods", "durations"]);
      if (Array.isArray(periods)) {
        for (const period of periods) {
          const periodRecord =
            typeof period === "object" && period !== null ? asRecord(period) : { period };
          const option = optionFromRecord(periodRecord, record);
          if (option) options.push(option);
        }
      } else {
        const option = optionFromRecord(record);
        if (option) options.push(option);
      }
    }
  }

  if (!options.length) {
    const productTypes = firstValue(source, ["allowedProductTypes", "productTypes"]);
    const periods = firstValue(source, ["allowedPeriods", "periods"]);
    if (Array.isArray(productTypes) && Array.isArray(periods)) {
      for (const productType of productTypes) {
        for (const period of periods) {
          const option = optionFromRecord({ productType, period });
          if (option) options.push(option);
        }
      }
    }
  }

  return options.filter(
    (option, index, all) =>
      isSupportedRenewalOption(option) &&
      all.findIndex(
        (candidate) =>
          candidate.productType === option.productType &&
          String(candidate.period) === String(option.period),
      ) === index,
  );
};

export function normalizeRenewalOptions(payload: unknown): RenewalOptions {
  const source = unwrapPayload(payload);
  const license = asRecord(firstValue(source, ["license", "subscription", "currentSubscription"]));
  const current = asRecord(firstValue(source, ["current", "currentPackage", "currentLicense"]));
  const prices = priceFields(source);

  return {
    currentPackage:
      asLabel(firstValue(source, ["currentPackage", "package", "packageName", "productType"]), [
        "productType",
        "subscriptionType",
        "package",
        "name",
      ]) ??
      asString(firstValue(current, ["productType", "subscriptionType", "package", "name"])) ??
      asString(firstValue(license, ["productType", "subscriptionType", "package", "name"])),
    licenseEnd: asString(
      firstValue(source, [
        "licenseEnd",
        "licenseEndsAt",
        "subscriptionEndsAt",
        "endsAt",
        "endDate",
      ]) ??
        firstValue(current, ["endsAt", "endDate", "subscriptionEndsAt", "licenseEnd"]) ??
        firstValue(license, ["endsAt", "endDate", "subscriptionEndsAt"]),
    ),
    remainingDays: asNumber(
      firstValue(source, ["remainingDays", "daysRemaining", "licenseRemainingDays"]) ??
        firstValue(current, ["remainingDays", "daysRemaining"]) ??
        firstValue(license, ["remainingDays", "daysRemaining"]),
    ),
    linkedBaro:
      asLabel(firstValue(source, ["linkedBaro", "baro", "barAssociation", "baroName"]), [
        "name",
        "title",
        "baroName",
      ]) ??
      asLabel(firstValue(current, ["linkedBaro", "baro", "baroName"]), [
        "name",
        "title",
        "baroName",
      ]) ??
      asLabel(firstValue(asRecord(source.user), ["baro", "baroName"]), [
        "name",
        "title",
        "baroName",
      ]),
    canRenew: asBoolean(firstValue(source, ["canRenew", "renewalAllowed", "isRenewable"])),
    ...prices,
    campaign: campaignFromRecord(source, prices),
    options: normalizeOptions(source),
    message: asString(firstValue(source, ["message", "renewalMessage", "reason"])),
  };
}

const WOONTEGRA_RENEWAL_CHECKOUT_ORIGIN = "https://www.woontegra.com";
const WOONTEGRA_RENEWAL_CHECKOUT_PATH = "/yazilimlar/bilirkisi-hesap/satin-al";

function buildWoontegraRenewalCheckoutUrl(token: string): string {
  return `${WOONTEGRA_RENEWAL_CHECKOUT_ORIGIN}${WOONTEGRA_RENEWAL_CHECKOUT_PATH}?renew=${encodeURIComponent(token)}`;
}

export function parseRenewalRedirect(payload: unknown): string {
  const source = unwrapPayload(payload);
  // Prefer opaque renewal token → always open Woontegra central checkout.
  // Do not depend on server redirectUrl shape (avoids stale FE allowlist / env mismatches).
  const renewalToken = asString(firstValue(source, ["renewalToken", "token"]));
  if (renewalToken) {
    return buildWoontegraRenewalCheckoutUrl(renewalToken);
  }

  const checkout = asRecord(firstValue(source, ["checkout", "redirect", "payment"]));
  const redirectUrl = asString(
    firstValue(source, ["redirectUrl", "redirectURL", "url", "checkoutUrl"]) ??
      firstValue(checkout, ["redirectUrl", "redirectURL", "url"]),
  );
  if (!redirectUrl) throw new Error("Yenileme yönlendirme adresi alınamadı.");

  const url = new URL(redirectUrl);
  const allowedHosts = new Set([
    "woontegra.com",
    "www.woontegra.com",
    // legacy BH website (in-flight / fallback only)
    "bilirkisihesap.com",
    "www.bilirkisihesap.com",
  ]);
  const pathOk =
    url.pathname === "/yazilimlar/bilirkisi-hesap/satin-al" ||
    url.pathname === "/abonelik-yenile";
  if (url.protocol !== "https:" || !allowedHosts.has(url.hostname) || !pathOk) {
    throw new Error("Geçersiz yenileme yönlendirme adresi.");
  }
  if (!url.searchParams.get("renew")) {
    throw new Error("Yenileme anahtarı alınamadı.");
  }
  const identityKeys = [
    "customer",
    "customercode",
    "customer_code",
    "customernumber",
    "customer_number",
    "email",
    "userid",
    "user_id",
    "user",
    "tenantid",
    "tenant_id",
    "tenant",
    "token",
    "access_token",
    "refresh_token",
    "jwt",
    "name",
    "ad",
    "soyad",
    "fullname",
  ];
  for (const key of url.searchParams.keys()) {
    if (identityKeys.includes(key.toLowerCase())) {
      throw new Error("Yenileme yönlendirme adresi kimlik bilgisi içeremez.");
    }
  }
  return url.toString();
}

export function getOptionPricing(data: RenewalOptions, option: RenewalOption | null) {
  return {
    normalPrice: option?.normalPrice ?? data.normalPrice,
    discountAmount: option?.discountAmount ?? data.discountAmount,
    discountPercent: option?.discountPercent ?? data.discountPercent,
    finalAmount: option?.finalAmount ?? data.finalAmount,
    currency: option?.currency ?? data.currency,
  };
}

export async function fetchRenewalOptions(): Promise<RenewalOptions> {
  const data = await apiClient<unknown>("/api/subscription/renewal/options");
  return normalizeRenewalOptions(data);
}

export async function startRenewal(body: {
  productType: string;
  period: RenewalPeriod;
}): Promise<string> {
  const data = await apiClient<unknown>("/api/subscription/renewal/start", {
    method: "POST",
    body,
  });
  return parseRenewalRedirect(data);
}

/** Demo → paid: opaque upgrade token → Woontegra checkout (?renew=). */
export async function startDemoUpgrade(body?: {
  productType?: string;
  period?: RenewalPeriod;
}): Promise<string> {
  const data = await apiClient<unknown>("/api/subscription/demo-upgrade/start", {
    method: "POST",
    body: {
      productType: body?.productType || "annual",
      period: body?.period ?? "1",
    },
  });
  return parseRenewalRedirect(data);
}

/* ── Tickets ──────────────────────────────────────────────────── */

export async function listTickets(): Promise<Ticket[]> {
  const data = await apiClientAsUser<Ticket[] | { data?: Ticket[] }>("/api/tickets");
  if (Array.isArray(data)) return data;
  return Array.isArray(data?.data) ? data.data : [];
}

export async function createTicket(body: {
  subject: string;
  description: string;
  priority: TicketPriority;
}): Promise<Ticket> {
  return apiClientAsUser<Ticket>("/api/tickets", {
    method: "POST",
    body,
  });
}

export async function addTicketReply(ticketId: number, message: string): Promise<Ticket | void> {
  return apiClientAsUser<Ticket>(`/api/tickets/${ticketId}/replies`, {
    method: "POST",
    body: { message },
  });
}

export async function updateTicketStatus(
  ticketId: number,
  status: TicketStatus,
): Promise<Ticket | void> {
  return apiClientAsUser<Ticket>(`/api/tickets/${ticketId}`, {
    method: "PUT",
    body: { status },
  });
}

/* ── Sub-users ────────────────────────────────────────────────── */

export async function listSubUsers(tenantId: number): Promise<SubUser[]> {
  const data = await apiClient<SubUser[] | { data?: SubUser[] }>(
    `/api/tenants/${tenantId}/subusers`,
  );
  if (Array.isArray(data)) return data;
  return Array.isArray(data?.data) ? data.data : [];
}

export async function createSubUser(
  tenantId: number,
  body: { name: string; email: string; role: SubUser["role"] },
): Promise<SubUser> {
  return apiClient<SubUser>(`/api/tenants/${tenantId}/subusers`, {
    method: "POST",
    body,
  });
}

export async function deleteSubUser(tenantId: number, id: number): Promise<void> {
  await apiClient(`/api/tenants/${tenantId}/subusers/${id}`, { method: "DELETE" });
}
