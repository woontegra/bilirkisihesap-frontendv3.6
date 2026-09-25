import { Inbox } from "lucide-react";
import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { SavedCase } from "@/api/types";
import { StatePanel } from "@/components/ui/StatePanel";
import { MONTHS } from "@/utils/format";
import styles from "./Charts.module.css";

type Period = "haftalik" | "aylik" | "yillik" | "tum";

type Props = {
  savedCases: SavedCase[];
};

function getDateStr(c: SavedCase): string {
  return c.created_at || c.createdAt || "";
}

export function MonthlyChart({ savedCases }: Props) {
  const [period, setPeriod] = useState<Period>("aylik");

  const barData = useMemo(() => {
    const now = new Date();

    if (period === "haftalik") {
      const getWeekStart = (d: Date) => {
        const day = d.getDay() || 7;
        const monday = new Date(d);
        monday.setDate(d.getDate() - day + 1);
        return `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, "0")}-${String(monday.getDate()).padStart(2, "0")}`;
      };
      const keys: string[] = [];
      const counts: Record<string, number> = {};
      for (let i = 6; i >= 0; i -= 1) {
        const d = new Date(now);
        d.setDate(d.getDate() - 7 * i);
        const key = getWeekStart(d);
        keys.push(key);
        counts[key] = 0;
      }
      savedCases.forEach((c) => {
        const source = getDateStr(c);
        if (!source) return;
        try {
          const key = getWeekStart(new Date(source));
          if (key in counts) counts[key] += 1;
        } catch {
          /* ignore */
        }
      });
      return keys.map((key) => {
        const [, month, day] = key.split("-").map(Number);
        return { name: `${day}.${month}`, Adet: counts[key] };
      });
    }

    if (period === "yillik") {
      const year = now.getFullYear();
      const counts: Record<string, number> = {};
      for (let i = 6; i >= 0; i -= 1) {
        counts[String(year - i)] = 0;
      }
      savedCases.forEach((c) => {
        const source = getDateStr(c);
        if (!source) return;
        try {
          const key = String(new Date(source).getFullYear());
          if (key in counts) counts[key] += 1;
        } catch {
          /* ignore */
        }
      });
      return Object.keys(counts)
        .sort()
        .map((key) => ({ name: key, Adet: counts[key] }));
    }

    if (period === "tum") {
      const map: Record<string, number> = {};
      savedCases.forEach((c) => {
        const source = getDateStr(c);
        if (!source) return;
        try {
          const d = new Date(source);
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
          map[key] = (map[key] || 0) + 1;
        } catch {
          /* ignore */
        }
      });
      return Object.keys(map)
        .sort((a, b) => a.localeCompare(b))
        .slice(-12)
        .map((key) => {
          const [, month] = key.split("-").map(Number);
          return { name: `${MONTHS[month - 1]} ${key.slice(0, 4)}`, Adet: map[key] };
        });
    }

    const months: { key: string; month: number }[] = [];
    for (let i = 5; i >= 0; i -= 1) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({
        key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
        month: d.getMonth(),
      });
    }
    const counts: Record<string, number> = {};
    months.forEach(({ key }) => {
      counts[key] = 0;
    });
    savedCases.forEach((c) => {
      const source = getDateStr(c);
      if (!source) return;
      try {
        const d = new Date(source);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        if (key in counts) counts[key] += 1;
      } catch {
        /* ignore */
      }
    });
    return months.map(({ key, month }) => ({ name: MONTHS[month], Adet: counts[key] }));
  }, [savedCases, period]);

  return (
    <section className={`anim-fade-up ${styles.card}`}>
      <header className={styles.headerRow}>
        <div>
          <h2 className={styles.title}>Aylık Hesaplama</h2>
          <p className={styles.desc}>Zaman içindeki hesaplama yoğunluğu</p>
        </div>
        <select
          className={styles.select}
          value={period}
          onChange={(e) => setPeriod(e.target.value as Period)}
          aria-label="Dönem seçimi"
        >
          <option value="haftalik">Haftalık</option>
          <option value="aylik">Aylık</option>
          <option value="yillik">Yıllık</option>
          <option value="tum">Tümü</option>
        </select>
      </header>

      {savedCases.length === 0 ? (
        <StatePanel
          icon={Inbox}
          title="Henüz hesaplama kaydı yok"
          description="İlk hesaplamanızı kaydettiğinizde bu grafik dolacak."
        />
      ) : (
        <div className={styles.barBox}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={barData} margin={{ top: 8, right: 8, left: -12, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 11, fill: "var(--muted)" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 11, fill: "var(--muted)" }}
                axisLine={false}
                tickLine={false}
                width={32}
              />
              <Tooltip
                cursor={{ fill: "rgba(26, 111, 124, 0.06)" }}
                contentStyle={{
                  borderRadius: 10,
                  border: "1px solid var(--border)",
                  boxShadow: "var(--shadow-md)",
                  fontSize: 12,
                }}
              />
              <Bar
                dataKey="Adet"
                name="Hesaplama"
                fill="#1a6f7c"
                radius={[4, 4, 0, 0]}
                maxBarSize={42}
                isAnimationActive
                animationDuration={700}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}
