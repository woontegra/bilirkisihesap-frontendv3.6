/**
 * V3 UbgtExclusionCompactUI — yıl + tatil tipi dışlama kuralları.
 * V3.5 tasarım (KotuNiyet stilleri); çekirdek filtre V3 ile aynı.
 */
import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import {
  UBGT_HOLIDAY_DAYS,
  UBGT_HOLIDAY_TYPES,
  filterExcludedUbgtHolidaysByRules,
  getYearsFromDateRange,
  type UbgtDayEntryTyped,
  type UbgtExclusionRule,
  type UbgtHolidayType,
} from "./filterExcludedUbgtHolidays";
import styles from "./UbgtCalcPage.module.css";

const GROUPS: { title: string; values: UbgtHolidayType[] }[] = [
  { title: "Ulusal bayramlar", values: ["OCT_28_HALF", "OCT_29"] },
  {
    title: "Genel tatiller",
    values: ["APR_23", "MAY_19", "AUG_30", "JAN_1", "MAY_1", "JUL_15"],
  },
  {
    title: "Dini bayramlar",
    values: [
      "RAMADAN_AREFE_HALF",
      "RAMADAN_1",
      "RAMADAN_2",
      "RAMADAN_3",
      "KURBAN_AREFE_HALF",
      "KURBAN_1",
      "KURBAN_2",
      "KURBAN_3",
      "KURBAN_4",
    ],
  },
];

const labelByType: Record<UbgtHolidayType, string> = Object.fromEntries(
  UBGT_HOLIDAY_TYPES.map((t) => [t.value, t.label]),
) as Record<UbgtHolidayType, string>;

function shortLabel(type: UbgtHolidayType): string {
  return labelByType[type].replace(/\s*-\s*0\.5 gün|\s*-\s*1 gün/g, "").trim();
}

function formatDayValue(d: number): string {
  return d.toLocaleString("tr-TR", { minimumFractionDigits: 0, maximumFractionDigits: 1 });
}

function formatRuleSummary(rule: UbgtExclusionRule): string {
  const yearStr =
    rule.startYear === rule.endYear ? String(rule.startYear) : `${rule.startYear}–${rule.endYear}`;
  const types = rule.excludedHolidayTypes;
  if (types.length === 0) return `${yearStr}`;
  const total = types.reduce((s, t) => s + (UBGT_HOLIDAY_DAYS[t] ?? 1), 0);
  if (types.length === 1) {
    const d = UBGT_HOLIDAY_DAYS[types[0]] ?? 1;
    return `${yearStr} – ${shortLabel(types[0])} (${formatDayValue(d)} gün)`;
  }
  const parts = types.map((t) => `${shortLabel(t)} (${formatDayValue(UBGT_HOLIDAY_DAYS[t] ?? 1)})`);
  return `${yearStr} – ${parts.join(" + ")} = ${formatDayValue(total)} gün`;
}

type Props = {
  dateRanges: Array<{ start: string; end: string }>;
  ubgtDayEntries: UbgtDayEntryTyped[];
  ubgtExclusionRules: UbgtExclusionRule[];
  setUbgtExclusionRules: (rules: UbgtExclusionRule[]) => void;
};

export default function UbgtExclusionCompactUI({
  dateRanges = [],
  ubgtDayEntries = [],
  ubgtExclusionRules,
  setUbgtExclusionRules,
}: Props) {
  const { rangeStart, rangeEnd, yearsForDropdown } = useMemo(() => {
    const valid = (dateRanges ?? []).filter((r) => r.start && r.end);
    if (valid.length === 0) {
      return { rangeStart: "", rangeEnd: "", yearsForDropdown: [] as number[] };
    }
    const starts = valid.map((r) => r.start).sort();
    const ends = valid.map((r) => r.end).sort().reverse();
    const rs = starts[0];
    const re = ends[0];
    return { rangeStart: rs, rangeEnd: re, yearsForDropdown: getYearsFromDateRange(rs, re) };
  }, [dateRanges]);

  const [draftYearState, setDraftYearState] = useState<number | null>(null);
  const draftYear =
    draftYearState ?? (yearsForDropdown.length > 0 ? yearsForDropdown[0] : new Date().getFullYear());

  const finalUbgtDays = useMemo(
    () => filterExcludedUbgtHolidaysByRules(ubgtDayEntries, ubgtExclusionRules),
    [ubgtDayEntries, ubgtExclusionRules],
  );

  const hasUbgtDaysForSelectedYear = useMemo(
    () =>
      finalUbgtDays.some(
        (d) =>
          d.date.length >= 4 &&
          parseInt(d.date.slice(0, 4), 10) === draftYear &&
          (d.days ?? 0) > 0,
      ),
    [finalUbgtDays, draftYear],
  );

  const availableTypesForYear = useMemo(() => {
    if (!finalUbgtDays.length) return [] as UbgtHolidayType[];
    const types = new Set<UbgtHolidayType>();
    for (const day of finalUbgtDays) {
      const year = day.date.length >= 4 ? parseInt(day.date.slice(0, 4), 10) : 0;
      if (year !== draftYear || (day.days ?? 0) <= 0) continue;
      if (rangeStart && day.date < rangeStart) continue;
      if (rangeEnd && day.date > rangeEnd) continue;
      types.add(day.holidayType);
    }
    return UBGT_HOLIDAY_TYPES.map((t) => t.value).filter((v) => types.has(v));
  }, [finalUbgtDays, draftYear, rangeStart, rangeEnd]);

  useEffect(() => {
    if (yearsForDropdown.length > 0 && (draftYearState === null || !yearsForDropdown.includes(draftYear))) {
      setDraftYearState(yearsForDropdown[0]);
    }
  }, [yearsForDropdown, draftYearState, draftYear]);

  const [draftTypes, setDraftTypes] = useState<UbgtHolidayType[]>([]);

  useEffect(() => {
    setDraftTypes((prev) => prev.filter((t) => availableTypesForYear.includes(t)));
  }, [availableTypesForYear]);

  const onDisla = () => {
    if (draftTypes.length === 0) return;
    setUbgtExclusionRules([
      ...ubgtExclusionRules,
      { startYear: draftYear, endYear: draftYear, excludedHolidayTypes: [...draftTypes] },
    ]);
    setDraftTypes([]);
  };

  return (
    <div style={{ marginTop: "0.75rem" }}>
      <label className={styles.label}>UBGT hesabından dışlanacak günler</label>
      <p className={styles.helper}>Seçilen yıl için işaretlenen UBGT günleri hesaba dahil edilmez.</p>

      <div className={styles.fields2} style={{ marginTop: "0.35rem", alignItems: "start" }}>
        <div>
          <label className={styles.label}>Yıl</label>
          <select
            className={styles.input}
            value={yearsForDropdown.includes(draftYear) ? draftYear : (yearsForDropdown[0] ?? "")}
            onChange={(e) => {
              const v = e.target.value;
              if (v) setDraftYearState(parseInt(v, 10));
            }}
            disabled={yearsForDropdown.length === 0}
          >
            {yearsForDropdown.length === 0 ? (
              <option value="">—</option>
            ) : (
              yearsForDropdown.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))
            )}
          </select>
        </div>
        <div>
          <label className={styles.label}>UBGT günleri</label>
          {yearsForDropdown.length === 0 ? (
            <span className={styles.helper}>Önce tarih aralığı girin</span>
          ) : !hasUbgtDaysForSelectedYear ? (
            <span className={styles.helper}>{draftYear} için bu aralıkta UBGT günü yok</span>
          ) : (
            <div className={styles.chipGrid} role="group" aria-label="Yıl bazlı UBGT günleri">
              {GROUPS.flatMap((g) =>
                g.values
                  .filter((v) => availableTypesForYear.includes(v))
                  .map((value) => {
                    const on = draftTypes.includes(value);
                    return (
                      <label key={value} className={`${styles.chip} ${on ? styles.chipOn : ""}`}>
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() =>
                            setDraftTypes((prev) =>
                              prev.includes(value) ? prev.filter((x) => x !== value) : [...prev, value],
                            )
                          }
                        />
                        <span>{shortLabel(value)}</span>
                      </label>
                    );
                  }),
              )}
            </div>
          )}
        </div>
      </div>

      {draftTypes.length > 0 ? (
        <div className={styles.chipGrid} style={{ marginTop: "0.35rem" }}>
          {draftTypes.map((t) => (
            <span key={t} className={`${styles.chip} ${styles.chipOn}`}>
              {shortLabel(t)}
              <button
                type="button"
                aria-label="Kaldır"
                style={{ border: 0, background: "transparent", cursor: "pointer", padding: 0, display: "flex" }}
                onClick={() => setDraftTypes((prev) => prev.filter((x) => x !== t))}
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      ) : null}

      <Button
        type="button"
        variant="soft"
        size="sm"
        style={{ marginTop: "0.35rem" }}
        onClick={onDisla}
        disabled={draftTypes.length === 0 || yearsForDropdown.length === 0}
      >
        <Plus size={14} /> Dışla
      </Button>

      {ubgtExclusionRules.length > 0 ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", marginTop: "0.5rem" }}>
          <span className={styles.helper}>{ubgtExclusionRules.length} kural:</span>
          {ubgtExclusionRules.map((rule, idx) => (
            <span
              key={idx}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.25rem",
                fontSize: "0.75rem",
                background: "#f3f4f6",
                borderRadius: "0.25rem",
                padding: "0.15rem 0.4rem",
              }}
            >
              {formatRuleSummary(rule)}
              <button
                type="button"
                aria-label="Kuralı kaldır"
                style={{ border: 0, background: "transparent", cursor: "pointer", padding: 0, display: "flex" }}
                onClick={() => setUbgtExclusionRules(ubgtExclusionRules.filter((_, i) => i !== idx))}
              >
                <Trash2 size={12} />
              </button>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
