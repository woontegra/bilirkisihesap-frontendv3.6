import { Inbox, X } from "lucide-react";
import { useMemo, useState } from "react";
import type { SavedCase } from "@/api/types";
import { Button } from "@/components/ui/Button";
import { StatePanel } from "@/components/ui/StatePanel";
import { formatCalculationType } from "@/utils/calculationLabels";
import { formatCurrency, formatNumber, formatShortDate } from "@/utils/format";
import styles from "./RecentRecords.module.css";

type RecentRow = {
  id: number;
  type: string;
  name: string;
  date: string;
  brut: number;
  net: number;
  data: Record<string, unknown> | null;
};

type Props = {
  savedCases: SavedCase[];
};

function tryParse(raw: unknown): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    return typeof raw === "string"
      ? (JSON.parse(raw) as Record<string, unknown>)
      : (raw as Record<string, unknown>);
  } catch {
    return null;
  }
}

function buildRecentRows(cases: SavedCase[]): RecentRow[] {
  return cases.slice(0, 10).map((c) => {
    let brut = Number(c.brut_total || c.brut_toplam || 0);
    let net = Number(c.net_total || c.net_toplam || 0);
    const parsed = tryParse(c.detay) ?? tryParse(c.data);

    if (!brut && parsed) {
      brut = Number(
        parsed.brutTazminat ??
          parsed.brutTazminatTutari ??
          parsed.brut_tazminat ??
          parsed.toplamBrut ??
          parsed.brutTotal ??
          parsed.brut_total ??
          0,
      );
      net = Number(
        parsed.netTazminat ??
          parsed.netTazminatTutari ??
          parsed.net_tazminat ??
          parsed.toplamNet ??
          parsed.netTotal ??
          parsed.net_total ??
          0,
      );
    }

    const dateStr = c.created_at || c.createdAt;
    return {
      id: c.id,
      type: formatCalculationType(c.type || c.hesaplama_tipi || "Hesaplama"),
      name: c.name || c.aciklama || c.kayit_adi || "",
      date: formatShortDate(dateStr),
      brut,
      net,
      data: parsed,
    };
  });
}

export function RecentRecords({ savedCases }: Props) {
  const rows = useMemo(() => buildRecentRows(savedCases), [savedCases]);
  const [detail, setDetail] = useState<RecentRow | null>(null);

  return (
    <section className={`anim-fade-up ${styles.card}`}>
      <header className={styles.header}>
        <div>
          <h2 className={styles.title}>Son Kayıtlar</h2>
          <p className={styles.desc}>En son yapılan hesaplamaların listesi</p>
        </div>
      </header>

      {rows.length === 0 ? (
        <StatePanel
          icon={Inbox}
          title="Kayıt bulunamadı"
          description="Henüz kayıtlı hesaplama bulunmuyor."
        />
      ) : (
        <>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Tür</th>
                  <th className={styles.hideSm}>Kayıt Adı</th>
                  <th className={styles.hideMd}>Tarih</th>
                  <th>Brüt</th>
                  <th className={styles.hideSm}>Net</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <span className={styles.typeChip}>{row.type}</span>
                    </td>
                    <td className={styles.hideSm}>{row.name || "—"}</td>
                    <td className={styles.hideMd}>{row.date}</td>
                    <td>{formatCurrency(row.brut)}</td>
                    <td className={styles.hideSm}>{formatCurrency(row.net)}</td>
                    <td>
                      <Button variant="ghost" size="sm" onClick={() => setDetail(row)}>
                        Detay
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className={styles.cards}>
            {rows.map((row) => (
              <article key={row.id} className={styles.mobileCard}>
                <div className={styles.mobileTop}>
                  <span className={styles.typeChip}>{row.type}</span>
                  <span className={styles.mobileDate}>{row.date}</span>
                </div>
                <p className={styles.mobileName}>{row.name || "Adsız kayıt"}</p>
                <div className={styles.mobileAmounts}>
                  <div>
                    <p className={styles.metaLabel}>Brüt</p>
                    <p className={styles.metaValue}>{formatCurrency(row.brut)}</p>
                  </div>
                  <div>
                    <p className={styles.metaLabel}>Net</p>
                    <p className={styles.metaValue}>{formatCurrency(row.net)}</p>
                  </div>
                </div>
                <Button
                  variant="soft"
                  className={styles.mobileButton}
                  onClick={() => setDetail(row)}
                >
                  Detay görüntüle
                </Button>
              </article>
            ))}
          </div>
        </>
      )}

      {detail ? (
        <div
          className={styles.overlay}
          role="presentation"
          onClick={() => setDetail(null)}
        >
          <div
            className={styles.modal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="record-detail-title"
            onClick={(e) => e.stopPropagation()}
          >
            <header className={styles.modalHeader}>
              <h3 id="record-detail-title" className={styles.title}>
                Kayıt Detayı
              </h3>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Kapat"
                onClick={() => setDetail(null)}
              >
                <X size={18} />
              </Button>
            </header>

            <div className={styles.modalBody}>
              <div className={styles.modalSection}>
                <p className={styles.sectionTitle}>Temel Bilgiler</p>
                <div className={styles.modalGrid}>
                  <div>
                    <p className={styles.metaLabel}>Tür</p>
                    <p className={styles.metaValue}>{detail.type}</p>
                  </div>
                  <div>
                    <p className={styles.metaLabel}>Kayıt Adı</p>
                    <p className={styles.metaValue}>{detail.name || "—"}</p>
                  </div>
                  <div>
                    <p className={styles.metaLabel}>Tarih</p>
                    <p className={styles.metaValue}>{detail.date}</p>
                  </div>
                </div>
              </div>

              {detail.data ? (
                <div className={`${styles.modalSection} ${styles.sectionInfo}`}>
                  <p className={styles.sectionTitle}>Hesaplama Detayları</p>
                  <div className={styles.modalGrid}>
                    {Boolean(detail.data.iseGiris || detail.data.ise_giris) && (
                      <div>
                        <p className={styles.metaLabel}>İşe Giriş</p>
                        <p className={styles.metaValue}>
                          {formatShortDate(
                            String(detail.data.iseGiris ?? detail.data.ise_giris),
                          )}
                        </p>
                      </div>
                    )}
                    {Boolean(detail.data.istenCikis || detail.data.isten_cikis) && (
                      <div>
                        <p className={styles.metaLabel}>İşten Çıkış</p>
                        <p className={styles.metaValue}>
                          {formatShortDate(
                            String(detail.data.istenCikis ?? detail.data.isten_cikis),
                          )}
                        </p>
                      </div>
                    )}
                    {Boolean(
                      detail.data.ucret || detail.data.brut || detail.data.brutUcret,
                    ) && (
                      <div>
                        <p className={styles.metaLabel}>Brüt Ücret</p>
                        <p className={styles.metaValue}>
                          {formatNumber(
                            Number(
                              detail.data.ucret ??
                                detail.data.brut ??
                                detail.data.brutUcret,
                            ),
                          )}{" "}
                          ₺
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              ) : null}

              <div className={`${styles.modalSection} ${styles.sectionSuccess}`}>
                <p className={styles.sectionTitle}>Sonuçlar</p>
                <div className={styles.modalGrid}>
                  <div>
                    <p className={styles.metaLabel}>Brüt Tutar</p>
                    <p className={styles.metaValue}>{formatCurrency(detail.brut)}</p>
                  </div>
                  <div>
                    <p className={styles.metaLabel}>Net Tutar</p>
                    <p className={`${styles.metaValue} ${styles.net}`}>
                      {formatCurrency(detail.net)}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <footer className={styles.modalFooter}>
              <Button variant="soft" onClick={() => setDetail(null)}>
                Kapat
              </Button>
            </footer>
          </div>
        </div>
      ) : null}
    </section>
  );
}
