import { RefreshCw, Star } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiClient } from "@/api/client";
import { AdminSkeleton } from "@/components/admin/AdminSkeleton";
import { AdminTable } from "@/components/admin/AdminTable";
import { StatCard } from "@/components/admin/StatCard";
import { StatusBadge, statusToneFromRaw } from "@/components/admin/StatusBadge";
import { Button } from "@/components/ui/Button";
import { StatePanel } from "@/components/ui/StatePanel";
import { useToast } from "@/context/ToastContext";
import shared from "../adminShared.module.css";
import { formatTrackingDate } from "./emailHelpers";
import pageStyles from "./EmailNotificationsPage.module.css";
import styles from "./SurveyResultsPanel.module.css";

type SurveyRow = {
  id: number;
  recipientEmail: string;
  recipientName: string | null;
  subject: string | null;
  sendStatus: "PENDING" | "SENT" | "FAILED";
  errorMessage: string | null;
  sentAt: string | null;
  rating: number | null;
  respondedAt: string | null;
  isTest: boolean;
  createdAt: string | null;
};

type SurveySummary = {
  total: number;
  sent: number;
  failed: number;
  pending: number;
  responded: number;
  averageRating: number | null;
  distribution: Record<string, number>;
};

const RATING_OPTIONS = [
  { rating: 5, label: "Mükemmel" },
  { rating: 4, label: "Başarılı" },
  { rating: 3, label: "Ortalama" },
  { rating: 2, label: "Geliştirilmeli" },
  { rating: 1, label: "Yetersiz" },
];

const PAGE_SIZE = 20;

function ratingLabel(rating: number | null): string {
  return RATING_OPTIONS.find((o) => o.rating === rating)?.label ?? "";
}

function sendStatusLabel(status: string): string {
  if (status === "SENT") return "Gönderildi";
  if (status === "FAILED") return "Hatalı";
  if (status === "PENDING") return "Bekliyor";
  return status;
}

function Stars({ rating }: { rating: number }) {
  return (
    <span className={styles.stars} aria-label={`${rating} yıldız`}>
      <span className={styles.starsOn}>{"★".repeat(rating)}</span>
      <span className={styles.starsOff}>{"★".repeat(5 - rating)}</span>
    </span>
  );
}

export function SurveyResultsPanel() {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<SurveySummary | null>(null);
  const [rows, setRows] = useState<SurveyRow[]>([]);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiClient<{
        success: boolean;
        summary?: SurveySummary;
        items?: SurveyRow[];
        error?: string;
      }>("/api/email-notifications/survey-results");
      if (!data.success) throw new Error(data.error || "Anket sonuçları yüklenemedi");
      setSummary(data.summary ?? null);
      setRows(Array.isArray(data.items) ? data.items : []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Anket sonuçları yüklenemedi");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLocaleLowerCase("tr-TR");
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.recipientEmail.toLocaleLowerCase("tr-TR").includes(q) ||
        (r.recipientName || "").toLocaleLowerCase("tr-TR").includes(q),
    );
  }, [rows, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paged = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const responded = summary?.responded ?? 0;
  const responseRate = summary && summary.sent > 0 ? Math.round((responded / summary.sent) * 100) : 0;
  const average = summary?.averageRating;

  return (
    <section className={shared.panel}>
      <div className={shared.rowBetween}>
        <h2 className={shared.panelTitle}>Memnuniyet Anketi Sonuçları</h2>
        <Button variant="soft" size="sm" onClick={() => void load()}>
          <RefreshCw size={14} className={loading ? pageStyles.spin : undefined} />
          Yenile
        </Button>
      </div>

      <div className={shared.stats}>
        <StatCard label="Gönderilen" value={summary?.sent ?? 0} index={0} />
        <StatCard label="Yanıtlayan" value={responded} hint={`Yanıt oranı %${responseRate}`} index={1} />
        <StatCard
          label="Ortalama Puan"
          value={average != null ? `${average.toLocaleString("tr-TR", { maximumFractionDigits: 2 })} / 5` : "—"}
          icon={Star}
          tone="amber"
          index={2}
        />
        <StatCard label="Hatalı Gönderim" value={summary?.failed ?? 0} tone="danger" index={3} />
      </div>

      <div className={styles.distribution}>
        <h3 className={styles.distributionTitle}>Puan Dağılımı</h3>
        {RATING_OPTIONS.map(({ rating, label }) => {
          const count = summary?.distribution?.[String(rating)] ?? 0;
          const pct = responded > 0 ? Math.round((count / responded) * 100) : 0;
          return (
            <div key={rating} className={styles.distRow}>
              <span className={styles.distLabel}>
                <Stars rating={rating} />
                <span>{label}</span>
              </span>
              <span className={styles.distTrack} aria-hidden="true">
                <span className={styles.distFill} style={{ width: `${pct}%` }} />
              </span>
              <span className={styles.distValue}>
                {count} <span className={shared.muted}>(%{pct})</span>
              </span>
            </div>
          );
        })}
        <p className={`${shared.muted} ${styles.note}`}>Test gönderimleri özet ve dağılıma dahil edilmez.</p>
      </div>

      <div className={pageStyles.toolbar}>
        <input
          className={pageStyles.inlineInput}
          placeholder="Ad / e-posta ara..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
      </div>

      {loading && rows.length === 0 ? (
        <AdminSkeleton rows={6} cards={0} />
      ) : (
        <AdminTable
          rows={paged}
          rowKey={(r) => r.id}
          empty={<StatePanel icon={Star} title="Kayıt yok" description="Henüz anket gönderimi bulunmuyor." />}
          columns={[
            {
              key: "recipient",
              header: "Müşteri",
              render: (r) => (
                <div>
                  <div>{r.recipientName || "—"}</div>
                  <div className={shared.muted}>{r.recipientEmail}</div>
                </div>
              ),
            },
            {
              key: "rating",
              header: "Puan",
              render: (r) =>
                r.rating != null ? (
                  <span className={styles.ratingCell}>
                    <Stars rating={r.rating} />
                    <span>{ratingLabel(r.rating)}</span>
                  </span>
                ) : (
                  <span className={shared.muted}>Yanıt yok</span>
                ),
            },
            {
              key: "respondedAt",
              header: "Yanıt Tarihi",
              hideOnMobile: true,
              render: (r) => formatTrackingDate(r.respondedAt),
            },
            {
              key: "status",
              header: "Gönderim",
              render: (r) => (
                <span className={styles.statusCell}>
                  <StatusBadge tone={statusToneFromRaw(r.sendStatus)}>{sendStatusLabel(r.sendStatus)}</StatusBadge>
                  {r.isTest ? <StatusBadge>Test</StatusBadge> : null}
                </span>
              ),
            },
            {
              key: "sentAt",
              header: "Gönderim Tarihi",
              hideBelowMd: true,
              render: (r) => (r.sendStatus === "FAILED" ? r.errorMessage || "—" : formatTrackingDate(r.sentAt)),
            },
          ]}
        />
      )}

      {filtered.length > PAGE_SIZE ? (
        <div className={shared.pagination}>
          <span className={shared.muted}>
            Sayfa {currentPage}/{totalPages}
          </span>
          <Button
            variant="soft"
            size="sm"
            disabled={currentPage <= 1}
            onClick={() => setPage(Math.max(1, currentPage - 1))}
          >
            Önceki
          </Button>
          <Button
            variant="soft"
            size="sm"
            disabled={currentPage >= totalPages}
            onClick={() => setPage(Math.min(totalPages, currentPage + 1))}
          >
            Sonraki
          </Button>
        </div>
      ) : null}
    </section>
  );
}
