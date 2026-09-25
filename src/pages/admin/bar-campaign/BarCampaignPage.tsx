import { BarChart3, RefreshCw, Users } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { apiClient } from "@/api/client";
import { AdminSkeleton } from "@/components/admin/AdminSkeleton";
import { AdminTable } from "@/components/admin/AdminTable";
import { MobileCards, MobileRecordCard } from "@/components/admin/MobileCards";
import { PageHeader } from "@/components/admin/PageHeader";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { Button } from "@/components/ui/Button";
import { StatePanel } from "@/components/ui/StatePanel";
import { useToast } from "@/context/ToastContext";
import { formatDateTr, formatNumberTr } from "@/utils/adminLabels";
import shared from "../adminShared.module.css";
import styles from "./BarCampaignPage.module.css";

type BarPerformance = {
  barAssociationKey: string;
  barAssociationName: string;
  uniqueUserCount: number;
  firstPurchaseCount: number;
  renewalCount: number;
  totalAmountKurus: number;
  lastPurchaseAt: string | null;
};

type CampaignUser = {
  userId: number;
  name: string;
  email: string;
  sourceAt: string | null;
  firstPurchaseCount: number;
  renewalCount: number;
  totalAmountKurus: number;
  lastPurchaseAt: string | null;
};

type BarsResponse = {
  success: boolean;
  bars?: BarPerformance[];
  message?: string;
};

type UsersResponse = {
  success: boolean;
  users?: CampaignUser[];
  message?: string;
};

const moneyFormatter = new Intl.NumberFormat("tr-TR", {
  style: "currency",
  currency: "TRY",
});

function formatAmount(kurus: number): string {
  return moneyFormatter.format(kurus / 100);
}

export default function BarCampaignPage() {
  const toast = useToast();
  const [includeTest, setIncludeTest] = useState(false);
  const [bars, setBars] = useState<BarPerformance[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBar, setSelectedBar] = useState<BarPerformance | null>(null);
  const [users, setUsers] = useState<CampaignUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);

  const loadBars = useCallback(async () => {
    setLoading(true);
    try {
      const payload = await apiClient<BarsResponse>(
        `/api/admin/bar-campaign-performance?includeTest=${includeTest}`,
      );
      if (payload.success !== true) {
        throw new Error(payload.message || "Performans verileri yüklenemedi.");
      }
      setBars(Array.isArray(payload.bars) ? payload.bars : []);
      setSelectedBar(null);
      setUsers([]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Performans verileri yüklenemedi.");
      setBars([]);
    } finally {
      setLoading(false);
    }
  }, [includeTest, toast]);

  useEffect(() => {
    void loadBars();
  }, [loadBars]);

  const loadUsers = async (bar: BarPerformance) => {
    setSelectedBar(bar);
    setUsersLoading(true);
    try {
      const payload = await apiClient<UsersResponse>(
        `/api/admin/bar-campaign-performance/${encodeURIComponent(bar.barAssociationKey)}/users?includeTest=${includeTest}`,
      );
      if (payload.success !== true) {
        throw new Error(payload.message || "Kampanya kullanıcıları yüklenemedi.");
      }
      setUsers(Array.isArray(payload.users) ? payload.users : []);
    } catch (err) {
      setUsers([]);
      toast.error(err instanceof Error ? err.message : "Kampanya kullanıcıları yüklenemedi.");
    } finally {
      setUsersLoading(false);
    }
  };

  return (
    <div className={`${shared.page} ${styles.page}`}>
      <PageHeader
        title="Baro Kampanya Performansı"
        description="APPLIED satın alma ve yenilemelerin baro bazlı performansını görüntüleyin."
        actions={
          <>
            <label className={styles.testToggle}>
              <input
                type="checkbox"
                checked={includeTest}
                onChange={(e) => setIncludeTest(e.target.checked)}
              />
              Test işlemlerini göster
            </label>
            <Button variant="soft" size="sm" onClick={() => void loadBars()} disabled={loading}>
              <RefreshCw size={14} className={loading ? styles.spin : undefined} />
              Yenile
            </Button>
          </>
        }
      />

      {loading ? (
        <AdminSkeleton rows={6} cards={0} />
      ) : (
        <section className={`${shared.panel} ${styles.summaryPanel}`}>
          <div className={shared.rowBetween}>
            <h2 className={shared.panelTitle}>Baro Özeti</h2>
            <span className={shared.muted}>{bars.length} baro</span>
          </div>
          <p className={shared.muted}>
            Benzersiz kullanıcı sayısı aynı kullanıcının tekrar siparişlerini tekilleştirir.
          </p>

          {bars.length === 0 ? (
            <StatePanel
              icon={BarChart3}
              title="Kampanya verisi yok"
              description="Kampanyaya bağlı başarılı işlem bulunamadı."
            />
          ) : (
            <>
              <div className={styles.desktopOnly}>
                <AdminTable
                  rows={bars}
                  rowKey={(row) => row.barAssociationKey}
                  columns={[
                    {
                      key: "name",
                      header: "Baro",
                      render: (bar) => (
                        <button
                          type="button"
                          className={styles.barLink}
                          onClick={() => void loadUsers(bar)}
                        >
                          {bar.barAssociationName}
                        </button>
                      ),
                    },
                    {
                      key: "unique",
                      header: "Benzersiz Kullanıcı",
                      hideOnMobile: true,
                      render: (bar) => formatNumberTr(bar.uniqueUserCount),
                    },
                    {
                      key: "first",
                      header: "İlk Satın Alma",
                      hideBelowMd: true,
                      render: (bar) => formatNumberTr(bar.firstPurchaseCount),
                    },
                    {
                      key: "renewal",
                      header: "Yenileme",
                      hideBelowMd: true,
                      render: (bar) => formatNumberTr(bar.renewalCount),
                    },
                    {
                      key: "total",
                      header: "Toplam Tahsilat",
                      render: (bar) => (
                        <strong>{formatAmount(bar.totalAmountKurus)}</strong>
                      ),
                    },
                    {
                      key: "last",
                      header: "Son Satın Alma",
                      hideOnMobile: true,
                      render: (bar) => formatDateTr(bar.lastPurchaseAt, true),
                    },
                  ]}
                />
              </div>

              <MobileCards>
                {bars.map((bar, index) => (
                  <MobileRecordCard
                    key={bar.barAssociationKey}
                    index={index}
                    onClick={() => void loadUsers(bar)}
                  >
                    <p className={styles.cardTitle}>{bar.barAssociationName}</p>
                    <div className={styles.cardGrid}>
                      <span>Kullanıcı: {formatNumberTr(bar.uniqueUserCount)}</span>
                      <span>İlk: {formatNumberTr(bar.firstPurchaseCount)}</span>
                      <span>Yenileme: {formatNumberTr(bar.renewalCount)}</span>
                      <strong>{formatAmount(bar.totalAmountKurus)}</strong>
                    </div>
                  </MobileRecordCard>
                ))}
              </MobileCards>
            </>
          )}
        </section>
      )}

      {selectedBar ? (
        <section className={`${shared.panel} ${styles.drillPanel}`}>
          <div className={shared.rowBetween}>
            <h2 className={shared.panelTitle}>
              <Users size={16} className={styles.titleIcon} />
              {selectedBar.barAssociationName} Kullanıcıları
            </h2>
            <Button variant="ghost" size="sm" onClick={() => setSelectedBar(null)}>
              Kapat
            </Button>
          </div>
          <p className={shared.muted}>
            Kampanya üzerinden APPLIED işlemi bulunan benzersiz kullanıcılar.
          </p>

          {usersLoading ? (
            <AdminSkeleton rows={4} cards={0} />
          ) : users.length === 0 ? (
            <StatePanel
              icon={Users}
              title="Kullanıcı bulunamadı"
              description="Bu baro için kampanya kullanıcısı kaydı yok."
            />
          ) : (
            <AdminTable
              rows={users}
              rowKey={(u) => u.userId}
              columns={[
                {
                  key: "name",
                  header: "Kullanıcı",
                  render: (u) => u.name,
                },
                {
                  key: "email",
                  header: "E-posta",
                  hideOnMobile: true,
                  render: (u) => u.email,
                },
                {
                  key: "first",
                  header: "İlk Satın Alma",
                  render: (u) => <StatusBadge tone="info">{String(u.firstPurchaseCount)}</StatusBadge>,
                },
                {
                  key: "renewal",
                  header: "Yenileme",
                  hideBelowMd: true,
                  render: (u) => <StatusBadge tone="neutral">{String(u.renewalCount)}</StatusBadge>,
                },
                {
                  key: "total",
                  header: "Toplam",
                  render: (u) => formatAmount(u.totalAmountKurus),
                },
                {
                  key: "last",
                  header: "Son İşlem",
                  hideOnMobile: true,
                  render: (u) => formatDateTr(u.lastPurchaseAt, true),
                },
              ]}
            />
          )}
        </section>
      ) : null}
    </div>
  );
}
