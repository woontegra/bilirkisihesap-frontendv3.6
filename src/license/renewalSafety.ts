export const RENEWAL_FAILURE_MESSAGE =
  "Satın alma işlemi şu anda başlatılamadı. Lütfen tekrar deneyin veya destek ekibimizle iletişime geçin.";

export const RENEWAL_SUPPORT_PATH = "/profile?tab=tickets";

const IDENTITY_QUERY_KEYS = new Set([
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
  "name",
  "ad",
  "soyad",
  "fullname",
  "token",
  "access_token",
  "refresh_token",
  "jwt",
]);

export function checkoutUrlHasIdentityQuery(url: string): boolean {
  try {
    const parsed = new URL(url);
    for (const key of parsed.searchParams.keys()) {
      if (IDENTITY_QUERY_KEYS.has(key.toLowerCase())) return true;
    }
    return false;
  } catch {
    return true;
  }
}

export function assertSafeCheckoutUrl(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(RENEWAL_FAILURE_MESSAGE);
  }
  if (parsed.protocol !== "https:") {
    throw new Error(RENEWAL_FAILURE_MESSAGE);
  }
  if (checkoutUrlHasIdentityQuery(url)) {
    throw new Error(RENEWAL_FAILURE_MESSAGE);
  }
  return url;
}

export type ExpiredRenewalDeps = {
  isDemo: boolean;
  fetchOptions: () => Promise<{ options: Array<{ productType: string; period: string | number }> }>;
  startRenewal: (body: { productType: string; period: string | number }) => Promise<string>;
  startDemoUpgrade: (body: { productType: string; period: string }) => Promise<string>;
};

export async function startExpiredSubscriptionCheckout(deps: ExpiredRenewalDeps): Promise<string> {
  try {
    if (deps.isDemo) {
      return assertSafeCheckoutUrl(await deps.startDemoUpgrade({ productType: "annual", period: "1" }));
    }
    const options = await deps.fetchOptions();
    const first = options.options[0];
    if (!first) {
      throw new Error(RENEWAL_FAILURE_MESSAGE);
    }
    return assertSafeCheckoutUrl(
      await deps.startRenewal({
        productType: first.productType,
        period: first.period,
      }),
    );
  } catch {
    throw new Error(RENEWAL_FAILURE_MESSAGE);
  }
}
