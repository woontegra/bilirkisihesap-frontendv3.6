import { Copy, ExternalLink, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchAuthMe,
  fetchRenewalOptions,
  formatProductType,
  getOptionPricing,
  startRenewal,
  startDemoUpgrade,
  type RenewalOption,
  type RenewalOptions,
} from "@/api/profile";
import { readCurrentUser } from "@/auth/session";
import { FormField } from "@/components/admin/FormField";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/context/ToastContext";
import { formatDate } from "@/utils/format";
import { assertSafeCheckoutUrl, RENEWAL_FAILURE_MESSAGE } from "@/license/renewalSafety";
import {
  buildSubscriptionProgress,
  resolveSubscriptionEndsAt,
  resolveSubscriptionStartsAt,
  type SubscriptionDateSource,
} from "@/utils/subscription";
import styles from "./profileTabShared.module.css";

function formatSubscriptionDate(value: string | null) {
  return formatDate(value);
}

function formatMoney(value: number | null, currency: string) {
  if (value === null) return "-";
  const normalizedCurrency = currency.toUpperCase() === "TL" ? "TRY" : currency.toUpperCase();
  try {
    return new Intl.NumberFormat("tr-TR", {
      style: "currency",
      currency: normalizedCurrency,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 }).format(value)} ${currency}`;
  }
}

function subscriptionExpiryWarningThreshold(productType: string | null) {
  const normalized = String(productType || "").trim().toLowerCase();
  if (["monthly", "professional_monthly", "pro_monthly"].includes(normalized)) return 7;
  if (["annual", "yearly", "professional_yearly", "pro_yearly"].includes(normalized)) return 30;
  return null;
}

function getSubscriptionTypeLabel(type: string | null) {
  if (!type) return "Abonelik Yok";
  const labels: Record<string, string> = {
    starter: "Başlangıç",
    professional: "Profesyonel",
    demo: "Demo",
    annual: "Yıllık Standart",
    monthly: "Aylık Standart",
    trial: "Deneme",
    premium: "Profesyonel",
  };
  return labels[type] || type;
}

type LegacySubscriptionData = {
  subscriptionType: string | null;
  subscriptionEndsAt: string | null;
  subscriptionStartsAt: string | null;
  autoRenew: boolean;
};

function resolveSubscriptionFields(source: SubscriptionDateSource) {
  const endsAt = resolveSubscriptionEndsAt(source);
  return {
    startsAt: resolveSubscriptionStartsAt(source, endsAt),
    endsAt,
  };
}

type DemoSubscriptionData = {
  startsAt: string | null;
  endsAt: string | null;
  licenseActive: boolean;
  licenseStatus: string | null;
};

function SubscriptionProgressBar({
  startsAt,
  endsAt,
}: {
  startsAt: string | null;
  endsAt: string | null;
}) {
  const progress = buildSubscriptionProgress({ subscriptionStartsAt: startsAt, subscriptionEndsAt: endsAt });
  if (!progress.hasSubscription || progress.daysRemaining === null) return null;

  const isExpired = progress.daysRemaining <= 0;
  const isExpiringSoon = progress.daysRemaining <= 30;
  const remaining = progress.remainingPct;
  const elapsed = 100 - remaining;

  return (
    <div className={styles.progressSection}>
      <div className={styles.progressHeader}>
        <p className={styles.progressLabel}>
          {isExpired ? "Abonelik Süresi Doldu" : `Kalan Süre: ${progress.daysRemaining} gün`}
        </p>
        <span
          className={`${styles.progressPct} ${
            isExpired || isExpiringSoon
              ? styles.progressPctDanger
              : styles.progressPctOk
          }`}
        >
          {remaining.toFixed(1)}% kaldı
        </span>
      </div>
      <div className={styles.progressTrack}>
        {elapsed > 0 ? (
          <div className={styles.progressElapsed} style={{ width: `${Math.min(100, elapsed)}%` }} />
        ) : null}
        {remaining > 0 ? (
          <div
            className={`${styles.progressRemaining} ${
              isExpired || isExpiringSoon
                ? styles.progressRemainingWarn
                : styles.progressRemainingOk
            }`}
            style={{ width: `${Math.min(100, remaining)}%` }}
          />
        ) : null}
      </div>
      {progress.daysRemaining > 0 ? (
        <p className={styles.progressMeta}>
          {progress.daysUsed} gün geçti, {progress.daysRemaining} gün kaldı
        </p>
      ) : null}
    </div>
  );
}

function LegacySubscriptionSection({ licenseType }: { licenseType: string }) {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [subscriptionData, setSubscriptionData] = useState<LegacySubscriptionData | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      setLoading(true);
      try {
        const data = await fetchAuthMe();
        if (!active) return;
        const resolved = resolveSubscriptionFields(data);
        setSubscriptionData({
          subscriptionType:
            (typeof data.subscriptionType === "string" ? data.subscriptionType : null) ||
            (typeof data.licenseType === "string" ? data.licenseType : null),
          subscriptionEndsAt: resolved.endsAt,
          subscriptionStartsAt: resolved.startsAt,
          autoRenew: data.autoRenew === true,
        });
      } catch {
        if (active) {
          toast.error("Abonelik bilgileri yüklenemedi.");
          setSubscriptionData(null);
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [toast]);

  const typeLabel = subscriptionData?.subscriptionType
    ? getSubscriptionTypeLabel(subscriptionData.subscriptionType)
    : licenseType
      ? getSubscriptionTypeLabel(licenseType)
      : "Abonelik Yok";

  return (
    <section className={styles.panel}>
      <h3 className={styles.panelTitle}>Abonelik Bilgileri</h3>
      <p className={styles.panelDesc}>Mevcut abonelik planınız</p>

      {loading ? (
        <div className={styles.skeletonGrid} aria-busy="true">
          {[1, 2, 3, 4].map((item) => (
            <div key={item} className={styles.skeletonBlock} />
          ))}
        </div>
      ) : (
        <>
          <dl className={styles.dl}>
            <div>
              <dt>Abonelik Tipi</dt>
              <dd>{typeLabel}</dd>
            </div>
            <div>
              <dt>Başlangıç Tarihi</dt>
              <dd>{formatSubscriptionDate(subscriptionData?.subscriptionStartsAt ?? null)}</dd>
            </div>
            <div>
              <dt>Bitiş Tarihi</dt>
              <dd>{formatSubscriptionDate(subscriptionData?.subscriptionEndsAt ?? null)}</dd>
            </div>
            <div>
              <dt>Yenileme Tarihi</dt>
              <dd>{formatSubscriptionDate(subscriptionData?.subscriptionEndsAt ?? null)}</dd>
            </div>
          </dl>

          {subscriptionData?.subscriptionEndsAt ? (
            <SubscriptionProgressBar
              startsAt={subscriptionData.subscriptionStartsAt}
              endsAt={subscriptionData.subscriptionEndsAt}
            />
          ) : null}
        </>
      )}
    </section>
  );
}

function DemoSubscriptionSection() {
  const [loading, setLoading] = useState(true);
  const [demo, setDemo] = useState<DemoSubscriptionData | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      setLoading(true);
      try {
        const payload = await fetchAuthMe();
        if (!active) return;
        const resolved = resolveSubscriptionFields(payload);
        setDemo({
          startsAt: resolved.startsAt,
          endsAt: resolved.endsAt,
          licenseActive: payload.licenseActive === true,
          licenseStatus:
            typeof payload.licenseStatus === "string" && payload.licenseStatus.trim()
              ? payload.licenseStatus
              : null,
        });
      } catch {
        if (active) setDemo(null);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const progress = buildSubscriptionProgress({
    subscriptionStartsAt: demo?.startsAt,
    subscriptionEndsAt: demo?.endsAt,
  });
  const remainingDays = progress.hasSubscription ? Math.max(0, progress.daysRemaining) : 0;
  const expired =
    demo?.licenseStatus === "EXPIRED" ||
    demo?.licenseStatus === "INACTIVE" ||
    (progress.hasSubscription && progress.daysRemaining <= 0);

  return (
    <section className={styles.panel}>
      <h3 className={styles.panelTitle}>Abonelik Bilgileri</h3>
      <p className={styles.panelDesc}>7 günlük demo erişiminizin durumu</p>

      {loading ? (
        <div className={styles.skeletonGrid} aria-busy="true">
          {[1, 2, 3, 4, 5].map((item) => (
            <div key={item} className={styles.skeletonBlock} />
          ))}
        </div>
      ) : demo ? (
        <>
          <dl className={styles.dl}>
            <div>
              <dt>Durum</dt>
              <dd>7 Günlük Demo</dd>
            </div>
            <div>
              <dt>Demo Başlangıç Tarihi</dt>
              <dd>{formatSubscriptionDate(demo.startsAt)}</dd>
            </div>
            <div>
              <dt>Demo Bitiş Tarihi</dt>
              <dd>{formatSubscriptionDate(demo.endsAt)}</dd>
            </div>
            <div>
              <dt>Kalan Gün</dt>
              <dd>{remainingDays} gün</dd>
            </div>
            <div>
              <dt>Hesap Durumu</dt>
              <dd className={expired ? styles.statusExpired : styles.statusActive}>
                {expired ? "Süresi dolmuş" : "Aktif"}
              </dd>
            </div>
          </dl>
          {demo.endsAt ? (
            <SubscriptionProgressBar startsAt={demo.startsAt} endsAt={demo.endsAt} />
          ) : null}
        </>
      ) : (
        <p className={styles.muted}>Demo erişim bilgileri şu anda görüntülenemiyor.</p>
      )}
    </section>
  );
}

function readStoredUser(): {
  customerCode?: string;
  licenseType?: string | null;
} {
  const user = readCurrentUser();
  return {
    customerCode: user?.customerCode,
    licenseType: user?.licenseType ?? null,
  };
}

export default function SubscriptionTab() {
  const toast = useToast();
  const stored = readStoredUser();
  const [customerCode, setCustomerCode] = useState(stored.customerCode || "");
  const [licenseType, setLicenseType] = useState(stored.licenseType || "");
  const [renewal, setRenewal] = useState<RenewalOptions | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [renewalStarting, setRenewalStarting] = useState(false);
  const [demoUpgradeStarting, setDemoUpgradeStarting] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [subscriptionDates, setSubscriptionDates] = useState<{
    startsAt: string | null;
    endsAt: string | null;
  } | null>(null);

  const isDemo = licenseType.toLowerCase() === "demo";

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const me = await fetchAuthMe();
        if (!active) return;
        setSubscriptionDates(resolveSubscriptionFields(me));
        if (typeof me.customerCode === "string") setCustomerCode(me.customerCode);
        if (typeof me.licenseType === "string") setLicenseType(me.licenseType);
        else if (typeof me.subscriptionType === "string") setLicenseType(me.subscriptionType);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (isDemo) {
      setLoading(false);
      setRenewal(null);
      setLoadError(null);
      return;
    }
    let active = true;
    void (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const options = await fetchRenewalOptions();
        if (!active) return;
        setRenewal(options);
        setSelectedIndex(0);
      } catch (err) {
        if (!active) return;
        setLoadError(
          err instanceof Error ? err.message : "Abonelik ve yenileme bilgileri yüklenemedi.",
        );
        setRenewal(null);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [isDemo, reloadKey]);

  const selectedOption: RenewalOption | null = renewal?.options[selectedIndex] ?? null;
  const selectedCampaign = selectedOption?.campaign ?? renewal?.campaign ?? null;
  const pricing = useMemo(
    () => (renewal ? getOptionPricing(renewal, selectedOption) : null),
    [renewal, selectedOption],
  );
  const hasRenewalUi = !isDemo && Boolean(renewal);

  const warningThreshold = subscriptionExpiryWarningThreshold(renewal?.currentPackage ?? null);
  const isExpired =
    renewal?.remainingDays !== null &&
    renewal?.remainingDays !== undefined &&
    renewal.remainingDays <= 0;
  const expiringSoon =
    isExpired ||
    (warningThreshold !== null &&
      renewal?.remainingDays !== null &&
      renewal?.remainingDays !== undefined &&
      renewal.remainingDays <= warningThreshold);

  const copyCustomerCode = async () => {
    if (!customerCode) return;
    try {
      await navigator.clipboard.writeText(customerCode);
      toast.success("Müşteri numaranız kopyalandı.");
    } catch {
      toast.error("Müşteri numarası kopyalanamadı.");
    }
  };

  const startSelectedRenewal = useCallback(async () => {
    if (!selectedOption || renewalStarting) return;
    setRenewalStarting(true);
    try {
      const url = assertSafeCheckoutUrl(
        await startRenewal({
          productType: selectedOption.productType,
          period: selectedOption.period,
        }),
      );
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      toast.error(RENEWAL_FAILURE_MESSAGE);
    } finally {
      setRenewalStarting(false);
    }
  }, [renewalStarting, selectedOption, toast]);

  const startDemoPurchase = useCallback(async () => {
    if (demoUpgradeStarting) return;
    setDemoUpgradeStarting(true);
    try {
      const url = assertSafeCheckoutUrl(
        await startDemoUpgrade({ productType: "annual", period: "1" }),
      );
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      toast.error(RENEWAL_FAILURE_MESSAGE);
    } finally {
      setDemoUpgradeStarting(false);
    }
  }, [demoUpgradeStarting, toast]);

  const handlePrimaryAction = () => {
    if (isDemo) {
      void startDemoPurchase();
      return;
    }
    if (hasRenewalUi && selectedOption) {
      void startSelectedRenewal();
    }
  };

  const primaryActionLabel = isDemo
    ? demoUpgradeStarting
      ? "Hazırlanıyor..."
      : "Abonelik Satın Al"
    : renewalStarting
      ? "Hazırlanıyor..."
      : "Aboneliği Uzat";

  const primaryActionDisabled =
    isDemo
      ? demoUpgradeStarting
      : !hasRenewalUi || !selectedOption || renewalStarting;

  return (
    <div className={styles.stack}>
      <section className={styles.panel}>
        <div className={styles.rowBetween}>
          <div>
            <h3 className={styles.panelTitle}>Müşteri Numaranız</h3>
            <p className={styles.panelDesc}>Abonelik işlemlerinizde bu kodu kullanabilirsiniz.</p>
            <p className={styles.customerCode}>{customerCode || "-"}</p>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
            <Button
              variant="soft"
              size="sm"
              onClick={() => void copyCustomerCode()}
              disabled={!customerCode}
            >
              <Copy size={14} aria-hidden /> Kopyala
            </Button>
            <Button
              variant="primary"
              size="sm"
              disabled={primaryActionDisabled}
              onClick={handlePrimaryAction}
            >
              <ExternalLink size={14} aria-hidden /> {primaryActionLabel}
            </Button>
          </div>
        </div>
      </section>

      {isDemo ? (
        <DemoSubscriptionSection />
      ) : loading ? (
        <section className={styles.panel}>
          <h3 className={styles.panelTitle}>Abonelik Bilgileri</h3>
          <p className={styles.panelDesc}>Mevcut paketiniz ve yenileme seçenekleriniz</p>
          <div className={styles.skeletonGrid} aria-busy="true">
            {[1, 2, 3, 4].map((item) => (
              <div key={item} className={styles.skeletonBlock} />
            ))}
          </div>
        </section>
      ) : renewal ? (
        <section className={styles.panel}>
          <h3 className={styles.panelTitle}>Abonelik Bilgileri</h3>
          <p className={styles.panelDesc}>Mevcut paketiniz ve yenileme seçenekleriniz</p>

          <>
            {expiringSoon ? (
              <div className={styles.warn}>
                <strong>Abonelik süreniz yakında sona eriyor</strong>
                <p style={{ margin: "0.35rem 0 0" }}>
                  {renewal.remainingDays !== null && renewal.remainingDays <= 0
                      ? "Abonelik süreniz sona ermiş."
                      : `Aboneliğinizin bitmesine ${renewal.remainingDays} gün kaldı.`}
                  </p>
                </div>
              ) : null}

              <dl className={styles.dl} style={{ marginTop: "0.75rem" }}>
                <div>
                  <dt>Mevcut Paket</dt>
                  <dd>
                    {renewal.currentPackage
                      ? formatProductType(renewal.currentPackage)
                      : "Paket bilgisi yok"}
                  </dd>
                </div>
                <div>
                  <dt>Başlangıç Tarihi</dt>
                  <dd>{formatSubscriptionDate(subscriptionDates?.startsAt ?? null)}</dd>
                </div>
                <div>
                  <dt>Bitiş Tarihi</dt>
                  <dd>{formatSubscriptionDate(subscriptionDates?.endsAt ?? null)}</dd>
                </div>
                <div>
                  <dt>Yenileme Tarihi</dt>
                  <dd>{formatSubscriptionDate(subscriptionDates?.endsAt ?? null)}</dd>
                </div>
                <div>
                  <dt>Kalan Süre</dt>
                  <dd>
                    {renewal.remainingDays === null ? "—" : `${renewal.remainingDays} gün`}
                  </dd>
                </div>
                <div>
                  <dt>Bağlı Baro</dt>
                  <dd>{renewal.linkedBaro ?? "Bağlı baro yok"}</dd>
                </div>
              </dl>

              {subscriptionDates?.endsAt ? (
                <SubscriptionProgressBar
                  startsAt={subscriptionDates.startsAt}
                  endsAt={subscriptionDates.endsAt}
                />
              ) : null}

              <div className={styles.renewalSection}>
                <h4 className={styles.sectionHeading}>Yenileme Fiyatı</h4>
                {selectedCampaign ? (
                  <div className={styles.success}>
                    <strong>{selectedCampaign.name ?? "Aktif yenileme kampanyası"}</strong>
                    <p style={{ margin: "0.35rem 0 0" }}>
                      Bu kampanya backend tarafından şu anda geçerli olarak bildirildi.
                      {(selectedCampaign.startsAt || selectedCampaign.endsAt) && (
                        <>
                          {" "}
                          ({formatDate(selectedCampaign.startsAt)} – {formatDate(selectedCampaign.endsAt)})
                        </>
                      )}
                    </p>
                  </div>
                ) : (
                  <div className={styles.infoBanner}>
                    <div>
                      <strong>Aktif yenileme kampanyası yok</strong>
                      <span>Kampanya geçerli olmadığında normal fiyat uygulanır.</span>
                    </div>
                  </div>
                )}

                {renewal.options.length > 0 ? (
                  <FormField label="Paket ve süre seçimi">
                    <select
                      value={String(selectedIndex)}
                      onChange={(e) => setSelectedIndex(Number(e.target.value))}
                    >
                      {renewal.options.map((option, index) => (
                        <option key={`${option.productType}-${String(option.period)}`} value={index}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <p className={styles.fieldHint}>
                      Yalnızca backend tarafından izin verilen seçenekler gösterilir.
                    </p>
                  </FormField>
                ) : (
                  <p className={styles.muted}>Kullanılabilir paket seçeneği yok.</p>
                )}

                {pricing ? (
                  <div className={styles.priceGrid} style={{ marginTop: "0.75rem" }}>
                    <div>
                      <dt className={styles.muted}>Normal Fiyat</dt>
                      <dd style={{ margin: "0.2rem 0 0", fontWeight: 600 }}>
                        {formatMoney(pricing.normalPrice, pricing.currency)}
                      </dd>
                    </div>
                    <div>
                      <dt className={styles.muted}>Kampanya İndirimi</dt>
                      <dd
                        style={{
                          margin: "0.2rem 0 0",
                          fontWeight: 600,
                          color: selectedCampaign ? "#15803d" : undefined,
                        }}
                      >
                        {selectedCampaign
                          ? pricing.discountPercent !== null
                            ? `%${pricing.discountPercent}`
                            : pricing.discountAmount !== null
                              ? `-${formatMoney(pricing.discountAmount, pricing.currency)}`
                              : "-"
                          : "Uygulanmıyor"}
                      </dd>
                    </div>
                    <div>
                      <dt className={styles.muted}>Ödenecek Tutar</dt>
                      <dd style={{ margin: "0.2rem 0 0", fontWeight: 700, color: "var(--accent-hover)" }}>
                        {formatMoney(
                          selectedCampaign
                            ? (pricing.finalAmount ?? pricing.normalPrice)
                            : (pricing.normalPrice ?? pricing.finalAmount),
                          pricing.currency,
                        )}
                      </dd>
                    </div>
                  </div>
                ) : null}

                <p className={styles.fieldHint}>
                  {selectedCampaign
                    ? "Kampanya geçerliliği ve tutarlar backend yanıtına göre gösterilir."
                    : "Aktif kampanya olmadığından normal fiyat esas alınır."}
                </p>

                {renewal.message ? <p className={styles.muted}>{renewal.message}</p> : null}
              </div>
          </>
        </section>
      ) : loadError ? (
        <>
          <section className={styles.panel}>
            <h3 className={styles.panelTitle}>Abonelik Bilgileri</h3>
            <div className={styles.error}>
              <p>{loadError}</p>
              <p className={styles.fieldHint} style={{ marginTop: "0.45rem" }}>
                Yenileme servisi yanıt vermediği için temel abonelik bilgileri aşağıda
                gösteriliyor. Backend&apos;de{" "}
                <code>SUBSCRIPTION_RENEWAL_ENABLED=true</code> ve webapi bağlantısını kontrol
                edin.
              </p>
              <div style={{ marginTop: "0.55rem" }}>
                <Button variant="soft" size="sm" onClick={() => setReloadKey((v) => v + 1)}>
                  <RefreshCw size={14} aria-hidden /> Tekrar Dene
                </Button>
              </div>
            </div>
          </section>
          <LegacySubscriptionSection licenseType={licenseType} />
        </>
      ) : (
        <LegacySubscriptionSection licenseType={licenseType} />
      )}
    </div>
  );
}
