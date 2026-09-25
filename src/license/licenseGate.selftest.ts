/**
 * Frontend lisans kapısı birim testleri — mock/fixture, gerçek API yok.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  clearLicenseAccessSnapshot,
  isLicenseDeniedCode,
  isLicenseFreePath,
  isPaymentOrRenewalReturn,
  LICENSE_ACCESS_CACHE_KEY,
  paidAccessAllowedFromMe,
  postLoginPath,
  readLicenseAccessSnapshot,
  SUBSCRIPTION_EXPIRED_PATH,
  writeLicenseAccessSnapshot,
} from "@/license/access";
import {
  assertSafeCheckoutUrl,
  checkoutUrlHasIdentityQuery,
  RENEWAL_FAILURE_MESSAGE,
  RENEWAL_SUPPORT_PATH,
  startExpiredSubscriptionCheckout,
} from "@/license/renewalSafety";
import { getAccountStatusLabel } from "@/utils/adminLabels";
import { parseRenewalRedirect } from "@/api/profile";

function check(label: string, actual: unknown, expected: unknown) {
  assert.deepEqual(actual, expected, label);
}

check("token+active dashboard", postLoginPath({ licenseActive: true, role: "user" }), "/dashboard");
check(
  "token+expired expired screen",
  postLoginPath({ licenseActive: false, licenseAccessCode: "LICENSE_EXPIRED", role: "user" }),
  SUBSCRIPTION_EXPIRED_PATH,
);
check("admin dashboard", postLoginPath({ licenseActive: false, role: "admin" }), "/dashboard");
check("demo expired", postLoginPath({ licenseActive: false, licenseAccessCode: "DEMO_EXPIRED" }), SUBSCRIPTION_EXPIRED_PATH);

check("paid me admin", paidAccessAllowedFromMe({ role: "admin", licenseActive: false }), true);
check("paid me active", paidAccessAllowedFromMe({ role: "user", licenseActive: true }), true);
check("paid me expired", paidAccessAllowedFromMe({ role: "user", licenseActive: false, licenseAccessCode: "LICENSE_EXPIRED" }), false);

check("free profile", isLicenseFreePath("/profile"), true);
check("free profile tickets", isLicenseFreePath("/profile?tab=tickets"), true);
check("free expired page", isLicenseFreePath("/subscription-expired"), true);
check("calc not free", isLicenseFreePath("/kidem-tazminati/30isci"), false);
check("dashboard not free", isLicenseFreePath("/dashboard"), false);

check("denied codes", isLicenseDeniedCode("LICENSE_EXPIRED"), true);
check("denied demo", isLicenseDeniedCode("DEMO_EXPIRED"), true);
check("denied inactive", isLicenseDeniedCode("LICENSE_INACTIVE"), true);
check("denied required", isLicenseDeniedCode("ACTIVE_PAID_LICENSE_REQUIRED"), true);
check("not denied device", isLicenseDeniedCode("DEVICE_LIMIT_EXCEEDED"), false);

check("account active label", getAccountStatusLabel("active"), "Hesap aktif");
check("account suspended label", getAccountStatusLabel("suspended"), "Hesap askıda");

const appSrc = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../App.tsx"), "utf8");
check("expired route exists", appSrc.includes('path="subscription-expired"'), true);
check("no placeholder activation route", appSrc.includes("professional-license-activation"), false);
check("subscription gate used", appSrc.includes("SubscriptionGate"), true);
check("license provider used", appSrc.includes("LicenseAccessProvider"), true);

const clientSrc = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../api/client.ts"), "utf8");
check("client has no activation redirect", clientSrc.includes("/professional-license-activation"), false);
check("client listens for license denied codes", clientSrc.includes("LICENSE_DENIED_EVENT"), true);

const loginSrc = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../pages/login/LoginPage.tsx"), "utf8");
check("login uses postLoginPath", loginSrc.includes("postLoginPath"), true);
check("login shows LicenseLoadingScreen during check", loginSrc.includes("LicenseLoadingScreen"), true);
check("login writes license snapshot", loginSrc.includes("writeLicenseAccessSnapshot"), true);
check("login fetches /me once after password", loginSrc.includes("fetchAuthMe({ force: true })"), true);
check("login checkingLicense gate", loginSrc.includes("checkingLicense"), true);

const gateSrc = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../routes/SubscriptionGate.tsx"), "utf8");
check("gate redirects to expired", gateSrc.includes("SUBSCRIPTION_EXPIRED_PATH"), true);
check("gate allows free paths", gateSrc.includes("isLicenseFreePath"), true);

const providerSrc = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../context/LicenseAccessContext.tsx"),
  "utf8",
);
const profileSrc = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../api/profile.ts"),
  "utf8",
);
const sessionSrc = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../auth/session.ts"), "utf8");

check("provider never mounts LicenseLoadingScreen", providerSrc.includes("LicenseLoadingScreen"), false);
check("provider has no showBootScreen", providerSrc.includes("showBootScreen"), false);
check("provider hydrates from snapshot", providerSrc.includes("readLicenseAccessSnapshot"), true);
check("provider writes snapshot", providerSrc.includes("writeLicenseAccessSnapshot"), true);
check("provider clears snapshot on logout path", providerSrc.includes("clearLicenseAccessSnapshot"), true);
check("provider has no visibilitychange auto /me", providerSrc.includes("visibilitychange"), false);
check("provider has no mount auto refresh silent false", /useEffect\(\(\) => \{\s*void refresh\(\{ silent: false \}\)/.test(providerSrc), false);
check("provider supports silent refresh API", providerSrc.includes("silent"), true);
check("provider payment return silent refresh", providerSrc.includes("isPaymentOrRenewalReturn"), true);
check("gate uses hydrated not loading", gateSrc.includes("hydrated"), true);
check("profile fetchAuthMe is cacheable", profileSrc.includes("readAuthMeCache"), true);
check("session clear drops license snapshot", sessionSrc.includes("clearLicenseAccessSnapshot"), true);

check("support path is tickets", RENEWAL_SUPPORT_PATH, "/profile?tab=tickets");
check(
  "customer query is identity",
  checkoutUrlHasIdentityQuery("https://bilirkisihesap.com/abonelik-yenile?customer=ANT-123"),
  true,
);
check("email query is identity", checkoutUrlHasIdentityQuery("https://example.com/x?email=a@b.com"), true);
check("userId query is identity", checkoutUrlHasIdentityQuery("https://example.com/x?userId=12"), true);
check("tenantId query is identity", checkoutUrlHasIdentityQuery("https://example.com/x?tenantId=1"), true);
check(
  "opaque renew query is not identity",
  checkoutUrlHasIdentityQuery("https://www.woontegra.com/yazilimlar/bilirkisi-hesap/satin-al?renew=abc"),
  false,
);

try {
  assertSafeCheckoutUrl("https://bilirkisihesap.com/abonelik-yenile?customer=ANT-1");
  throw new Error("identity checkout should fail");
} catch (err) {
  check("unsafe checkout message", err instanceof Error ? err.message : "", RENEWAL_FAILURE_MESSAGE);
}

const expiredPage = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../pages/subscription-expired/SubscriptionExpiredPage.tsx"),
  "utf8",
);
check("expired page has no customer=", expiredPage.includes("customer="), false);
check("expired page has no customerCode fallback", expiredPage.includes("customerCode"), false);
check("expired page uses backend checkout", expiredPage.includes("startExpiredSubscriptionCheckout"), true);
check("expired page uses support path", expiredPage.includes("RENEWAL_SUPPORT_PATH"), true);
check("expired purchase does not force-navigate support", expiredPage.includes("navigate(RENEWAL_SUPPORT_PATH)"), false);
check("expired check button silent refresh", expiredPage.includes("refresh({ silent: true })"), true);
const shellSrc = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../shell/AppShell.tsx"), "utf8");
const forcePwSrc = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../components/auth/ForcePasswordChangeModal.tsx"),
  "utf8",
);
check("force password modal hosted by license provider", providerSrc.includes("ForcePasswordChangeModal"), true);
check("force password modal not remounted by AppShell", shellSrc.includes("ForcePasswordChangeModal"), false);
check("force password trusts /me boolean", forcePwSrc.includes("me.mustChangePassword === true || isMustChangePasswordRequired()"), false);
check("force password refreshes /me after save", forcePwSrc.includes("await fetchAuthMe({ force: true })"), true);
check("failed save keeps modal open", /catch \(err\) \{[\s\S]*setError\(/.test(forcePwSrc), true);
check("expired page has no email=", expiredPage.includes("email="), false);
check("expired page has no userId=", expiredPage.includes("userId="), false);
check("expired page has no tenantId=", expiredPage.includes("tenantId="), false);

const subscriptionTab = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../pages/profile/tabs/SubscriptionTab.tsx"),
  "utf8",
);
check("profile renewal has no customer query builder", subscriptionTab.includes("searchParams.set(\"customer\""), false);
check("profile renewal has no abonelik-yenile fallback", subscriptionTab.includes("/abonelik-yenile"), false);
check("profile renewal uses safe checkout assert", subscriptionTab.includes("assertSafeCheckoutUrl"), true);

const safeCheckout = parseRenewalRedirect({
  renewalToken: "opaque-renew-token",
});
check("backend checkout host", new URL(safeCheckout).hostname, "www.woontegra.com");
check("backend checkout uses renew", new URL(safeCheckout).searchParams.has("renew"), true);
check("backend checkout has no customer", new URL(safeCheckout).searchParams.has("customer"), false);

try {
  parseRenewalRedirect({
    redirectUrl: "https://www.woontegra.com/yazilimlar/bilirkisi-hesap/satin-al?renew=x&email=a@b.com",
  });
  throw new Error("pii checkout should fail");
} catch (err) {
  check(
    "parseRenewalRedirect rejects email",
    err instanceof Error && err.message.includes("kimlik"),
    true,
  );
}

check("payment return success", isPaymentOrRenewalReturn("?payment=success"), true);
check("payment return renewal", isPaymentOrRenewalReturn("renewal=1"), true);
check("payment return unrelated", isPaymentOrRenewalReturn("?tab=tickets"), false);

// Per-user snapshot: A → B karışmaz; logout temizler
const memory = new Map<string, string>();
const localStorageMock = {
  getItem: (k: string) => memory.get(k) ?? null,
  setItem: (k: string, v: string) => {
    memory.set(k, v);
  },
  removeItem: (k: string) => {
    memory.delete(k);
  },
};
(globalThis as { localStorage?: typeof localStorageMock }).localStorage = localStorageMock;

writeLicenseAccessSnapshot({
  userId: 1,
  allowed: true,
  isAdmin: false,
  code: null,
  licenseType: "yearly",
  subscriptionType: "yearly",
  expiresAt: "2099-01-01",
});
check("snapshot read for user 1", readLicenseAccessSnapshot(1)?.allowed, true);
check("snapshot not for user 2", readLicenseAccessSnapshot(2), null);
writeLicenseAccessSnapshot({
  userId: 2,
  allowed: false,
  isAdmin: false,
  code: "LICENSE_EXPIRED",
  licenseType: "monthly",
  subscriptionType: "monthly",
  expiresAt: "2020-01-01",
});
check("user 2 overwrites cache", readLicenseAccessSnapshot(2)?.allowed, false);
check("user 1 cache gone after user 2 write", readLicenseAccessSnapshot(1), null);
clearLicenseAccessSnapshot();
check("logout clears license cache", readLicenseAccessSnapshot(2), null);
check("cache key constant", LICENSE_ACCESS_CACHE_KEY, "v35_license_access_v1");

// Bozuk şema yok sayılır
memory.set(LICENSE_ACCESS_CACHE_KEY, JSON.stringify({ v: 999, userId: 9, allowed: true }));
check("corrupt schema ignored", readLicenseAccessSnapshot(9), null);

void (async () => {
  const url = await startExpiredSubscriptionCheckout({
    isDemo: false,
    fetchOptions: async () => ({ options: [{ productType: "monthly", period: "1" }] }),
    startRenewal: async () => "https://www.woontegra.com/yazilimlar/bilirkisi-hesap/satin-al?renew=ok",
    startDemoUpgrade: async () => {
      throw new Error("not used");
    },
  });
  check("renewal start uses opaque renew", new URL(url).searchParams.get("renew"), "ok");

  try {
    await startExpiredSubscriptionCheckout({
      isDemo: false,
      fetchOptions: async () => ({ options: [{ productType: "monthly", period: "1" }] }),
      startRenewal: async () => {
        throw new Error("backend down");
      },
      startDemoUpgrade: async () => "https://example.com",
    });
    throw new Error("failed start should throw");
  } catch (err) {
    check(
      "renewal failure message",
      err instanceof Error ? err.message : "",
      RENEWAL_FAILURE_MESSAGE,
    );
  }

  try {
    await startExpiredSubscriptionCheckout({
      isDemo: false,
      fetchOptions: async () => ({ options: [] }),
      startRenewal: async () => "https://www.woontegra.com/yazilimlar/bilirkisi-hesap/satin-al?renew=x",
      startDemoUpgrade: async () => {
        throw new Error("not used");
      },
    });
    throw new Error("empty options should fail");
  } catch (err) {
    check("empty options uses support message", err instanceof Error ? err.message : "", RENEWAL_FAILURE_MESSAGE);
  }

  console.log("licenseGate.selftest: ok");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
