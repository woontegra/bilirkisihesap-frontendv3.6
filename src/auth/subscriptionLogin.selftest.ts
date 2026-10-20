/**
 * Abonelik login UX — selftest (DOM yok).
 */
import {
  ACTIVE_SUBSCRIPTION_REQUIRED,
  SUBSCRIPTION_EXPIRED,
  SUBSCRIPTION_RENEW_URL,
  SUBSCRIPTION_SUPPORT_URL,
  buildSubscriptionRenewUrl,
  buildSubscriptionSupportUrl,
  isSubscriptionAccessCode,
  messageForSubscriptionCode,
  parseSubscriptionDeniedPayload,
} from "./subscriptionLogin";

function check(label: string, actual: unknown, expected: unknown) {
  if (actual !== expected) {
    throw new Error(`subscriptionLogin.selftest FAIL: ${label} got=${String(actual)} expected=${String(expected)}`);
  }
}

check("expired code", isSubscriptionAccessCode(SUBSCRIPTION_EXPIRED), true);
check("required code", isSubscriptionAccessCode(ACTIVE_SUBSCRIPTION_REQUIRED), true);
check("network not expired", isSubscriptionAccessCode("NETWORK"), false);
check("403 alone not enough", isSubscriptionAccessCode(""), false);

check(
  "expired message",
  messageForSubscriptionCode(SUBSCRIPTION_EXPIRED),
  "Aboneliğiniz sona ermiştir. Hesabınıza erişmek için aboneliğinizi yenileyin.",
);
check(
  "required message",
  messageForSubscriptionCode(ACTIVE_SUBSCRIPTION_REQUIRED),
  "Aktif aboneliğiniz bulunmamaktadır.",
);

check("renew url fixed", buildSubscriptionRenewUrl(), SUBSCRIPTION_RENEW_URL);
check("support url fixed", buildSubscriptionSupportUrl(), SUBSCRIPTION_SUPPORT_URL);
check("renew has no email query", buildSubscriptionRenewUrl().includes("email="), false);
check("renew has no userId", buildSubscriptionRenewUrl().includes("userId"), false);
check("renew has no tenantId", buildSubscriptionRenewUrl().includes("tenantId"), false);

check(
  "parse expired",
  parseSubscriptionDeniedPayload({ error: SUBSCRIPTION_EXPIRED, code: SUBSCRIPTION_EXPIRED }),
  SUBSCRIPTION_EXPIRED,
);
check("parse network body", parseSubscriptionDeniedPayload({ error: "Forbidden" }), null);
check("parse plain 403 text", parseSubscriptionDeniedPayload("fail"), null);

console.log("subscriptionLogin.selftest: ok");
