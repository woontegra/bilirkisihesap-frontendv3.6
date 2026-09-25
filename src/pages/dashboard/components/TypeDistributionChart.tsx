import { Inbox } from "lucide-react";
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import type { SavedCase } from "@/api/types";
import { StatePanel } from "@/components/ui/StatePanel";
import { formatCalculationType, normalizePieType } from "@/utils/calculationLabels";
import { formatNumber } from "@/utils/format";
import styles from "./Charts.module.css";

const COLORS = [
  "#1a6f7c",
  "#3d7ea6",
  "#5b8a6a",
  "#b08a4a",
  "#8a5e7a",
  "#5c6b8a",
  "#6a8a9a",
];

type Props = {
  savedCases: SavedCase[];
};

export function TypeDistributionChart({ savedCases }: Props) {
  const counts: Record<string, number> = {};
  savedCases.forEach((c) => {
    const key = normalizePieType(formatCalculationType(c.type || c.hesaplama_tipi || ""));
    counts[key] = (counts[key] || 0) + 1;
  });

  const data = Object.entries(counts)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  const total = data.reduce((sum, d) => sum + d.value, 0);

  return (
    <section className={`anim-fade-up ${styles.card}`}>
      <header className={styles.header}>
        <h2 className={styles.title}>Hesaplama Türü Dağılımı</h2>
        <p className={styles.desc}>Kayıtlara göre kategori payı</p>
      </header>

      {data.length === 0 ? (
        <StatePanel
          icon={Inbox}
          title="Dağılım verisi yok"
          description="Henüz hesaplama kaydı bulunmadığı için grafik oluşturulamıyor."
        />
      ) : (
        <div className={styles.chartRow}>
          <div className={styles.chartBox}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius="58%"
                  outerRadius="82%"
                  paddingAngle={2}
                  strokeWidth={0}
                  isAnimationActive
                  animationDuration={700}
                >
                  {data.map((entry, index) => (
                    <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value) => [
                    `${formatNumber(Number(value))} kayıt`,
                    "Adet",
                  ]}
                  contentStyle={{
                    borderRadius: 10,
                    border: "1px solid var(--border)",
                    boxShadow: "var(--shadow-md)",
                    fontSize: 12,
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className={styles.centerLabel}>
              <p className={styles.centerValue}>{formatNumber(total)}</p>
              <p className={styles.centerHint}>toplam</p>
            </div>
          </div>

          <ul className={styles.legend}>
            {data.map((item, index) => {
              const pct = total ? ((item.value / total) * 100).toFixed(1) : "0";
              return (
                <li key={item.name} className={styles.legendItem}>
                  <span
                    className={styles.swatch}
                    style={{ background: COLORS[index % COLORS.length] }}
                  />
                  <span className={styles.legendName}>{item.name}</span>
                  <span className={styles.legendMeta}>
                    {formatNumber(item.value)} · %{pct}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
