import { Star } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { apiClient } from "@/api/client";
import { AdminSkeleton } from "@/components/admin/AdminSkeleton";
import { AdminTable } from "@/components/admin/AdminTable";
import { FilterBar } from "@/components/admin/FilterBar";
import { FormField } from "@/components/admin/FormField";
import { MobileCards, MobileRecordCard } from "@/components/admin/MobileCards";
import { PageHeader } from "@/components/admin/PageHeader";
import { StatCard } from "@/components/admin/StatCard";
import { Button } from "@/components/ui/Button";
import { StatePanel } from "@/components/ui/StatePanel";
import { useToast } from "@/context/ToastContext";
import { formatDateTr } from "@/utils/adminLabels";
import shared from "../adminShared.module.css";
import styles from "./FeedbackPage.module.css";

type FeedbackItem = {
  id: number;
  userId: number | null;
  demoSessionId: string | null;
  rating: number;
  comment: string | null;
  pageOrContext: string | null;
  createdAt: string;
};

type Summary = {
  averageRating: number;
  totalCount: number;
  count5Star: number;
  count1Or2Star: number;
};

type ListResponse = {
  items: FeedbackItem[];
  total: number;
  summary: Summary;
};

function userType(item: FeedbackItem): "Demo" | "Paid" {
  return item.demoSessionId != null ? "Demo" : "Paid";
}

function userTypeLabel(type: "Demo" | "Paid"): string {
  return type === "Demo" ? "Demo Kullanıcı" : "Ücretli Kullanıcı";
}

export default function FeedbackPage() {
  const toast = useToast();
  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [ratingFilter, setRatingFilter] = useState("all");
  const [userTypeFilter, setUserTypeFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const queryParams = useMemo(() => {
    const p = new URLSearchParams();
    if (ratingFilter !== "all") p.set("rating", ratingFilter);
    if (userTypeFilter !== "all") p.set("userType", userTypeFilter);
    p.set("limit", "50");
    return p.toString();
  }, [ratingFilter, userTypeFilter]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    apiClient<ListResponse>(`/api/admin/feedback?${queryParams}`)
      .then((body) => {
        if (!cancelled) setData(body);
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setData(null);
          toast.error(err.message || "Geri bildirimler yüklenemedi");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [queryParams, toast]);

  const summary = data?.summary;
  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const pagedItems = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, currentPage, pageSize]);

  useEffect(() => {
    setCurrentPage(1);
  }, [ratingFilter, userTypeFilter]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  return (
    <div className={`${shared.page} ${styles.page}`}>
      <PageHeader
        title="Kullanıcı Geri Bildirimleri"
        description="Ürün memnuniyet geri bildirimleri (tek seferlik, kullanıcı/session başına)."
      />

      {loading ? (
        <AdminSkeleton cards={3} rows={8} />
      ) : !data ? (
        <StatePanel
          icon={Star}
          title="Veri yüklenemedi"
          description="Geri bildirim listesi alınamadı. Bağlantınızı kontrol edip tekrar deneyin."
          actionLabel="Yenile"
          onAction={() => window.location.reload()}
        />
      ) : (
        <>
          {summary ? (
            <div className={shared.stats}>
              <StatCard
                label="Ortalama Puan"
                value={`${summary.averageRating.toFixed(1)} / 5`}
                icon={Star}
                tone="amber"
                index={0}
              />
              <StatCard
                label="5 Yıldız"
                value={summary.count5Star}
                hint="adet"
                tone="green"
                index={1}
              />
              <StatCard
                label="1–2 Yıldız"
                value={summary.count1Or2Star}
                hint="adet"
                tone="danger"
                index={2}
              />
            </div>
          ) : null}

          <FilterBar
            actions={<span className={shared.muted}>Toplam: {total} kayıt</span>}
          >
            <FormField label="Puan">
              <select
                value={ratingFilter}
                onChange={(e) => setRatingFilter(e.target.value)}
              >
                <option value="all">Tümü</option>
                {[1, 2, 3, 4, 5].map((r) => (
                  <option key={r} value={String(r)}>
                    {r} yıldız
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Kullanıcı tipi">
              <select
                value={userTypeFilter}
                onChange={(e) => setUserTypeFilter(e.target.value)}
              >
                <option value="all">Tümü</option>
                <option value="demo">Demo Kullanıcı</option>
                <option value="paid">Ücretli Kullanıcı</option>
              </select>
            </FormField>
          </FilterBar>

          <section className={`${shared.panel} ${styles.tablePanel}`}>
            <h2 className={shared.panelTitle}>Geri Bildirim Listesi</h2>

            <div className={styles.desktopOnly}>
              <AdminTable
                rows={pagedItems}
                rowKey={(row) => row.id}
                empty={
                  <StatePanel
                    icon={Star}
                    title="Henüz geri bildirim yok"
                    description="Kullanıcılar geri bildirim bıraktığında burada görünecek."
                  />
                }
                columns={[
                  {
                    key: "rating",
                    header: "Puan",
                    render: (item) => (
                      <div className={styles.stars} aria-label={`${item.rating} yıldız`}>
                        {[1, 2, 3, 4, 5].map((r) => (
                          <Star
                            key={r}
                            size={14}
                            className={r <= item.rating ? styles.starFilled : styles.starEmpty}
                          />
                        ))}
                      </div>
                    ),
                  },
                  {
                    key: "type",
                    header: "Tip",
                    hideOnMobile: true,
                    render: (item) => (
                      <span className={userType(item) === "Demo" ? styles.demo : styles.paid}>
                        {userTypeLabel(userType(item))}
                      </span>
                    ),
                  },
                  {
                    key: "comment",
                    header: "Yorum",
                    render: (item) =>
                      item.comment ? (
                        <span className={styles.comment}>{item.comment}</span>
                      ) : (
                        <span className={shared.muted}>—</span>
                      ),
                  },
                  {
                    key: "date",
                    header: "Tarih",
                    hideBelowMd: true,
                    render: (item) => formatDateTr(item.createdAt, true),
                  },
                ]}
              />
            </div>

            <MobileCards>
              {pagedItems.map((item, index) => (
                <MobileRecordCard key={item.id} index={index}>
                  <div className={styles.cardHead}>
                    <div className={styles.stars} aria-label={`${item.rating} yıldız`}>
                      {[1, 2, 3, 4, 5].map((r) => (
                        <Star
                          key={r}
                          size={14}
                          className={r <= item.rating ? styles.starFilled : styles.starEmpty}
                        />
                      ))}
                    </div>
                    <span className={userType(item) === "Demo" ? styles.demo : styles.paid}>
                      {userTypeLabel(userType(item))}
                    </span>
                  </div>
                  <p className={styles.cardComment}>{item.comment || "—"}</p>
                  <p className={styles.cardDate}>{formatDateTr(item.createdAt, true)}</p>
                </MobileRecordCard>
              ))}
            </MobileCards>

            {items.length > 0 ? (
              <div className={shared.pagination}>
                <span className={shared.muted}>
                  Sayfa {currentPage}/{totalPages}
                </span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className={styles.pageSelect}
                >
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                </select>
                <Button
                  variant="soft"
                  size="sm"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                >
                  Önceki
                </Button>
                <Button
                  variant="soft"
                  size="sm"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                >
                  Sonraki
                </Button>
              </div>
            ) : null}
          </section>
        </>
      )}
    </div>
  );
}
