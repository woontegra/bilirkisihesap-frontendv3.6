/**
 * UBGT gün satırları — yıl accordion + çerçeveli tablo + satır +/-.
 * Kullanıcıya görünen metinler V3 ile uyumlu tutulur.
 */
import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { UbgtDayEntry } from "./lib/holidays";
import { formatDateTR, formatMoney } from "./engine";
import {
  createEmptyManualDay,
  dayRowKey,
  type ManualDayRow,
} from "./ubgtCetvelRows";
import styles from "./UbgtCalcPage.module.css";

type DisplayDay = {
  key: string;
  source: "auto" | "manual";
  date: string;
  holidayId: string;
  holidayLabel: string;
  days: number;
  periodIndex?: number;
  manualId?: string;
};

type Props = {
  entries: UbgtDayEntry[];
  manualDayRows: ManualDayRow[];
  holidayNameById: Record<string, string>;
  periodLabelByIndex?: Record<number, string>;
  amountByDate?: Record<string, number>;
  onManualDayRowsChange: (rows: ManualDayRow[]) => void;
  onExcludeAutoDay: (date: string) => void;
  dateRanges: Array<{ start: string; end: string }>;
  onValidationError?: (msg: string) => void;
};

function yearOf(iso: string): number {
  const y = Number(String(iso).slice(0, 4));
  return Number.isFinite(y) ? y : 0;
}

/** Görsel sıralama için ISO/date → timestamp; dd.MM.yyyy string kullanılmaz. Tarihsiz satırlar sonda. */
function dateTimestamp(iso: string): number {
  const raw = String(iso || "").trim();
  if (!raw) return Number.POSITIVE_INFINITY;
  const normalized = raw.length === 10 ? `${raw}T00:00:00` : raw;
  const t = Date.parse(normalized);
  return Number.isNaN(t) ? Number.POSITIVE_INFINITY : t;
}

export default function UbgtDayYearAccordion({
  entries,
  manualDayRows,
  holidayNameById,
  periodLabelByIndex = {},
  amountByDate = {},
  onManualDayRowsChange,
  onExcludeAutoDay,
  dateRanges,
  onValidationError,
}: Props) {
  const displayDays = useMemo((): DisplayDay[] => {
    const autos: DisplayDay[] = entries.map((e) => ({
      key: dayRowKey(e.date, e.holidayId),
      source: "auto" as const,
      date: e.date,
      holidayId: e.holidayId,
      holidayLabel: holidayNameById[e.holidayId] || e.holidayId || "—",
      days: e.days,
      periodIndex: e.periodIndex,
    }));
    const out = [...autos];
    for (const m of manualDayRows) {
      const row: DisplayDay = {
        key: dayRowKey(m.date, "manual", m.id),
        source: "manual",
        date: m.date,
        holidayId: "manual",
        holidayLabel: m.holidayLabel || "Manuel",
        days: m.days,
        manualId: m.id,
      };
      const idx = out.findIndex((d) => d.key === m.insertAfterKey);
      const at = idx >= 0 ? idx + 1 : out.length;
      out.splice(at, 0, row);
    }
    return out;
  }, [entries, manualDayRows, holidayNameById]);

  const groups = useMemo(() => {
    const keyYear = new Map<string, number>();
    for (const e of displayDays) {
      if (e.date) keyYear.set(e.key, yearOf(e.date));
    }
    // Tarihsiz manuel satırlar, eklendikleri satırın yılında kalsın (accordion görünürlüğü).
    for (const m of manualDayRows) {
      if (m.date) continue;
      const afterYear = keyYear.get(m.insertAfterKey);
      const manualKey = dayRowKey(m.date, "manual", m.id);
      keyYear.set(manualKey, afterYear ?? groupsFallbackYear(displayDays));
    }

    const map = new Map<number, DisplayDay[]>();
    for (const e of displayDays) {
      const y = e.date ? yearOf(e.date) : (keyYear.get(e.key) ?? 0);
      const list = map.get(y) ?? [];
      list.push(e);
      map.set(y, list);
    }
    return [...map.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([year, days]) => {
        // Yıl-içi görsel sıra: gerçek date timestamp (motor dizisini mutate etme).
        const sortedDays = [...days].sort((a, b) => dateTimestamp(a.date) - dateTimestamp(b.date));
        return {
          year,
          days: sortedDays,
          daySum: sortedDays.reduce((s, d) => s + (d.days || 0), 0),
        };
      });
  }, [displayDays, manualDayRows]);

  function groupsFallbackYear(days: DisplayDay[]): number {
    const dated = days.find((d) => d.date);
    return dated ? yearOf(dated.date) : 0;
  }

  const totals = useMemo(() => {
    let full = 0;
    let half = 0;
    let daySum = 0;
    for (const d of displayDays) {
      daySum += d.days || 0;
      if (d.days === 0.5) half += 1;
      else if (d.days) full += 1;
    }
    return { full, half, daySum };
  }, [displayDays]);

  const [openYears, setOpenYears] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (groups.length === 0) {
      setOpenYears(new Set());
      return;
    }
    setOpenYears((prev) => {
      if (prev.size > 0) {
        const valid = new Set([...prev].filter((y) => groups.some((g) => g.year === y)));
        if (valid.size > 0) return valid;
      }
      return new Set([groups[0]!.year]);
    });
  }, [groups]);

  const patchManual = (id: string, patch: Partial<ManualDayRow>) => {
    onManualDayRowsChange(manualDayRows.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  };

  const handleDateBlur = (id: string, date: string) => {
    if (!date) return;
    const others = displayDays.filter((d) => d.manualId !== id && d.date === date);
    if (others.length > 0) {
      onValidationError?.("Bu tarih zaten cetvelde var (mükerrer tarih).");
      patchManual(id, { date: "" });
      return;
    }
    const inRange = dateRanges.some((r) => r.start && r.end && date >= r.start && date <= r.end);
    if (!inRange) {
      onValidationError?.("Tarih, seçili çalışma aralığı dışında.");
      patchManual(id, { date: "" });
    }
  };

  const addBelow = (afterKey: string) => {
    onManualDayRowsChange([...manualDayRows, createEmptyManualDay(afterKey)]);
  };

  const removeRow = (row: DisplayDay) => {
    if (row.source === "manual" && row.manualId) {
      onManualDayRowsChange(manualDayRows.filter((m) => m.id !== row.manualId));
      return;
    }
    // V3’te ayrı gün satırı yok; otomatik gün silinince tarihi hariç tut (mevcut motor girdisi).
    if (row.date) onExcludeAutoDay(row.date);
  };

  const canDelete = displayDays.length > 1;

  return (
    <article className={styles.panel} data-testid="ubgt-day-cetvel">
      <header className={styles.panelHead}>
        <div className={styles.rowActions}>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setOpenYears(new Set(groups.map((g) => g.year)))}
          >
            Tümünü Aç
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setOpenYears(new Set())}>
            Tümünü Kapat
          </Button>
          {displayDays.length === 0 ? (
            <Button
              type="button"
              variant="soft"
              size="sm"
              onClick={() => addBelow("")}
              aria-label="Satır ekle"
            >
              Satır ekle
            </Button>
          ) : null}
        </div>
      </header>

      {displayDays.length === 0 ? (
        <div className={styles.panelBody}>
          <p className={styles.helper} style={{ margin: 0 }}>
            Hesaplama yapmak için lütfen tarih aralıkları girin ve tatilleri seçin.
          </p>
        </div>
      ) : (
        <>
          <div className={styles.accordionList} style={{ padding: "0.55rem 0.65rem 0" }}>
            {groups.map((g) => {
              const open = openYears.has(g.year);
              const title = `${g.year} — ${g.days.length} kayıt`;
              return (
                <div key={g.year} className={styles.accordionItem}>
                  <button
                    type="button"
                    className={styles.accordionHead}
                    aria-expanded={open}
                    onClick={() =>
                      setOpenYears((prev) => {
                        const next = new Set(prev);
                        if (next.has(g.year)) next.delete(g.year);
                        else next.add(g.year);
                        return next;
                      })
                    }
                  >
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
                      {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                      {title}
                    </span>
                    <span className={styles.accordionMeta}>{g.daySum} gün</span>
                  </button>
                  {open ? (
                    <div className={styles.accordionBody}>
                      <div className={styles.tableWrap}>
                        <table className={`${styles.resultTable} ${styles.framedTable}`}>
                          <thead>
                            <tr>
                              <th>Tarih</th>
                              <th>Tatil</th>
                              <th>Tam/Yarım</th>
                              <th>Durum</th>
                              <th className={styles.moneyRight}>Gün</th>
                              <th>Ücret dönemi</th>
                              <th className={styles.moneyRight}>Tutar</th>
                              <th aria-label="İşlemler" />
                            </tr>
                          </thead>
                          <tbody>
                            {g.days.map((e, i) => {
                              const amt =
                                amountByDate[`${e.date}|${e.holidayId}`] ?? amountByDate[e.date];
                              const period =
                                e.periodIndex != null
                                  ? periodLabelByIndex[e.periodIndex]
                                  : undefined;
                              return (
                                <tr
                                  key={e.key}
                                  className={e.source === "manual" ? styles.manualRow : undefined}
                                  style={{ animationDelay: `${Math.min(i, 24) * 18}ms` }}
                                >
                                  <td>
                                    {e.source === "manual" && e.manualId ? (
                                      <input
                                        type="date"
                                        className={styles.cellInput}
                                        value={e.date}
                                        onChange={(ev) =>
                                          patchManual(e.manualId!, { date: ev.target.value })
                                        }
                                        onBlur={(ev) => handleDateBlur(e.manualId!, ev.target.value)}
                                        aria-label="UBGT gün tarihi"
                                      />
                                    ) : (
                                      formatDateTR(e.date)
                                    )}
                                  </td>
                                  <td>
                                    {e.source === "manual" && e.manualId ? (
                                      <input
                                        className={styles.cellInput}
                                        style={{ width: "8rem" }}
                                        value={e.holidayLabel}
                                        onChange={(ev) =>
                                          patchManual(e.manualId!, {
                                            holidayLabel: ev.target.value,
                                          })
                                        }
                                        aria-label="Tatil adı"
                                      />
                                    ) : (
                                      e.holidayLabel
                                    )}
                                  </td>
                                  <td>
                                    {e.source === "manual" && e.manualId ? (
                                      <select
                                        className={styles.cellInput}
                                        style={{ width: "5.5rem" }}
                                        value={e.days === 0.5 ? "0.5" : "1"}
                                        onChange={(ev) =>
                                          patchManual(e.manualId!, {
                                            days: ev.target.value === "0.5" ? 0.5 : 1,
                                          })
                                        }
                                        aria-label="Tam veya yarım gün"
                                      >
                                        <option value="1">Tam</option>
                                        <option value="0.5">Yarım</option>
                                      </select>
                                    ) : e.days === 0.5 ? (
                                      "Yarım"
                                    ) : (
                                      "Tam"
                                    )}
                                  </td>
                                  <td>{e.source === "manual" ? "Manuel" : "Dahil"}</td>
                                  <td className={styles.moneyRight}>{e.days}</td>
                                  <td>{period || "—"}</td>
                                  <td className={`${styles.moneyCell} ${styles.moneyRight}`}>
                                    {amt != null ? `${formatMoney(amt)} ₺` : "—"}
                                  </td>
                                  <td>
                                    <div className={styles.rowActions}>
                                      <button
                                        type="button"
                                        className={styles.rowAddBtn}
                                        onClick={() => addBelow(e.key)}
                                        aria-label="Satır ekle"
                                        title="Satır ekle"
                                      >
                                        +
                                      </button>
                                      <button
                                        type="button"
                                        className={styles.rowRemoveBtn}
                                        onClick={() => removeRow(e)}
                                        disabled={!canDelete}
                                        aria-label="Sil"
                                        title="Sil"
                                      >
                                        −
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
            <div className={styles.accordionTotalRow}>
              <span>Toplam UBGT Günü</span>
              <span className={styles.accordionMeta}>{totals.daySum} gün</span>
            </div>
          </div>
        </>
      )}
    </article>
  );
}
