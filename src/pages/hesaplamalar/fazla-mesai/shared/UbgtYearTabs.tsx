import type { CSSProperties } from "react";

const wrap: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "0.35rem",
  marginBottom: "0.65rem",
  maxHeight: "6.5rem",
  overflowY: "auto",
  overflowX: "auto",
};

const chip = (active: boolean): CSSProperties => ({
  border: active ? "1px solid var(--accent)" : "1px solid var(--border)",
  background: active ? "var(--accent-soft)" : "var(--surface-muted)",
  color: "var(--text-strong)",
  borderRadius: "999px",
  padding: "0.22rem 0.55rem",
  fontSize: "0.75rem",
  fontWeight: 600,
  cursor: "pointer",
  whiteSpace: "nowrap",
});

export function UbgtYearTabs({
  years,
  activeYear,
  onChange,
}: {
  years: number[];
  activeYear: number | null;
  selectedCounts?: Record<number, number>;
  onChange: (year: number) => void;
}) {
  if (years.length === 0) return null;
  return (
    <div className="ubgt-year-tabs" style={wrap} role="tablist" aria-label="UBGT yılı">
      {years.map((year) => {
        const active = year === activeYear;
        return (
          <button
            key={year}
            type="button"
            role="tab"
            aria-selected={active}
            style={chip(active)}
            onClick={() => onChange(year)}
          >
            {year}
          </button>
        );
      })}
    </div>
  );
}
