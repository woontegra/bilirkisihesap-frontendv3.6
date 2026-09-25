import { useEffect, useState } from "react";
import { Shield } from "lucide-react";
import { apiClient } from "@/api/client";
import { formatNumberTr } from "@/utils/adminLabels";
import { ADMIN_TOOL_CARDS } from "./adminCards";
import { AdminToolCard, type AdminCardPreviewStat } from "./components/AdminToolCard";
import styles from "./AdminPage.module.css";

type CardPreviewResponse = {
  cardPreview?: {
    loggedInDemoUsers?: number;
    neverLoggedInDemoUsers?: number;
    mobileFirstPercent?: number;
    desktopFirstPercent?: number;
    totalUsers?: number;
    loggedInUsers?: number;
    savedUsers?: number;
    returnedOtherDayUsers?: number;
  };
};

export default function AdminPage() {
  const readyCount = ADMIN_TOOL_CARDS.filter((c) => c.status === "ready").length;
  const soonCount = ADMIN_TOOL_CARDS.length - readyCount;
  const [previewById, setPreviewById] = useState<Record<string, AdminCardPreviewStat[]>>({});
  const [previewLoadingId, setPreviewLoadingId] = useState<string | null>(null);

  useEffect(() => {
    const cardsWithPreview = ADMIN_TOOL_CARDS.filter(
      (c) => c.status === "ready" && c.previewEndpoint,
    );
    if (cardsWithPreview.length === 0) return;

    let cancelled = false;
    (async () => {
      for (const card of cardsWithPreview) {
        if (!card.previewEndpoint) continue;
        if (!cancelled) setPreviewLoadingId(card.id);
        try {
          const data = await apiClient<CardPreviewResponse>(card.previewEndpoint, {
            adminRole: true,
          });
          if (cancelled) return;
          const p = data.cardPreview;
          if (!p) continue;
          if (card.id === "demo-usage-funnel") {
            setPreviewById((prev) => ({
              ...prev,
              [card.id]: [
                { label: "Toplam demo", value: formatNumberTr(p.totalUsers ?? 0) },
                { label: "Giriş yapan", value: formatNumberTr(p.loggedInUsers ?? 0) },
                { label: "Kaydeden", value: formatNumberTr(p.savedUsers ?? 0) },
                {
                  label: "Farklı gün dönen",
                  value: formatNumberTr(p.returnedOtherDayUsers ?? 0),
                },
              ],
            }));
          } else {
            setPreviewById((prev) => ({
              ...prev,
              [card.id]: [
                { label: "Giriş yapan", value: formatNumberTr(p.loggedInDemoUsers ?? 0) },
                { label: "Giriş yapmayan", value: formatNumberTr(p.neverLoggedInDemoUsers ?? 0) },
                {
                  label: "Mobil ilk giriş",
                  value: `%${String(p.mobileFirstPercent ?? 0).replace(".", ",")}`,
                },
                {
                  label: "Masaüstü ilk giriş",
                  value: `%${String(p.desktopFirstPercent ?? 0).replace(".", ",")}`,
                },
              ],
            }));
          }
        } catch {
          /* card remains without live stats */
        } finally {
          if (!cancelled) setPreviewLoadingId(null);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerIcon} aria-hidden>
          <Shield size={20} strokeWidth={1.75} />
        </div>
        <div className={styles.headerCopy}>
          <h1 className={styles.title}>Admin Paneli</h1>
          <p className={styles.subtitle}>
            Sistem yönetim araçlarına erişiyorsunuz. Kullanıcı, abonelik, destek ve denetim
            modüllerini buradan yönetin.
          </p>
        </div>
        <div className={styles.meta}>
          <span className={styles.metaChip}>{ADMIN_TOOL_CARDS.length} araç</span>
          {soonCount > 0 ? (
            <span className={styles.metaChipMuted}>{soonCount} yakında</span>
          ) : null}
          {readyCount > 0 ? (
            <span className={styles.metaChipReady}>{readyCount} hazır</span>
          ) : null}
        </div>
      </header>

      <section className={styles.grid} aria-label="Yönetim araçları">
        {ADMIN_TOOL_CARDS.map((card, index) => (
          <AdminToolCard
            key={card.id}
            card={card}
            index={index}
            previewStats={previewById[card.id] || null}
            previewLoading={previewLoadingId === card.id}
          />
        ))}
      </section>
    </div>
  );
}
