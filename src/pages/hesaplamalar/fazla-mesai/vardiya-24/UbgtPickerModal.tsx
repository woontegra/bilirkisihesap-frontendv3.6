/**
 * 24 Saat Vardiya — UBGT yıl gruplu çoklu seçim penceresi.
 */

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { groupUbgtCatalogByYear, getUbgtCatalogForRange, UBGT_RELIGIOUS_DATA_MAX_YEAR } from "./ubgtCatalog";
import { newLocalId, type ExclusionItem } from "./model";
import { UbgtYearTabs } from "../shared/UbgtYearTabs";
import { addDatesToSet, removeDatesFromSet, useUbgtYearView } from "../shared/useUbgtYearView";
import styles from "./Vardiya24FmPage.module.css";

function formatTrDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}.${m}.${y}`;
}

export function UbgtPickerModal({
  open,
  rangeStart,
  rangeEnd,
  exclusions,
  onApply,
  onClose,
  visibleAfterIso = null,
}: {
  open: boolean;
  rangeStart: string;
  rangeEnd: string;
  exclusions: ExclusionItem[];
  onApply: (next: ExclusionItem[]) => void;
  onClose: () => void;
  visibleAfterIso?: string | null;
}) {
  const catalog = useMemo(() => getUbgtCatalogForRange(rangeStart, rangeEnd), [rangeStart, rangeEnd]);
  const groups = useMemo(() => groupUbgtCatalogByYear(catalog), [catalog]);

  const initialSelected = useMemo(() => {
    const s = new Set<string>();
    for (const ex of exclusions) {
      if (ex.type !== "UBGT") continue;
      if (ex.start && ex.start === ex.end) s.add(ex.start);
    }
    return s;
  }, [exclusions]);

  const [selected, setSelected] = useState<Set<string>>(initialSelected);
  const yearView = useUbgtYearView(groups, visibleAfterIso, open, selected);

  useEffect(() => {
    if (open) setSelected(initialSelected);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const toggle = (iso: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(iso)) next.delete(iso);
      else next.add(iso);
      return next;
    });
  };

  const selectAll = () => setSelected((prev) => addDatesToSet(prev, yearView.activeDates));
  const clearAll = () => setSelected((prev) => removeDatesFromSet(prev, yearView.activeDates));

  const apply = () => {
    const meta = new Map(catalog.map((c) => [c.date, c]));
    const nonUbgt = exclusions.filter((e) => e.type !== "UBGT");
    const ubgtItems: ExclusionItem[] = Array.from(selected)
      .sort()
      .map((date) => {
        const entry = meta.get(date);
        const days = entry ? Math.max(1, Math.round(entry.days)) : 1;
        return { id: newLocalId(), type: "UBGT" as const, start: date, end: date, days };
      });
    onApply([...nonUbgt, ...ubgtItems]);
    onClose();
  };

  return (
    <div className={styles.modalOverlay} role="presentation" onClick={onClose}>
      <div
        className={styles.modalCard}
        role="dialog"
        aria-modal="true"
        style={{ maxWidth: "36rem", maxHeight: "85vh", overflow: "auto" }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className={styles.modalTitle}>UBGT günleri (FM düşümü)</h2>
        <p className={styles.modalDesc}>
          {rangeStart && rangeEnd
            ? `${formatTrDate(rangeStart)} – ${formatTrDate(rangeEnd)} aralığındaki resmi tatiller.`
            : "Tarih aralığı giriniz."}
          {catalog.some((c) => Number(c.date.slice(0, 4)) > UBGT_RELIGIOUS_DATA_MAX_YEAR)
            ? " (Dini bayram verisi sınırlı olabilir.)"
            : ""}
        </p>
        <div className={styles.inlineActions} style={{ marginBottom: "0.75rem" }}>
          <Button variant="soft" size="sm" onClick={selectAll} disabled={catalog.length === 0}>
            Tümünü seç
          </Button>
          <Button variant="soft" size="sm" onClick={clearAll} disabled={selected.size === 0}>
            Seçimi temizle
          </Button>
        </div>
        {yearView.visibleGroups.length === 0 ? (
          <p className={styles.emptyText}>Bu aralıkta UBGT günü yok.</p>
        ) : (
          <>
            <UbgtYearTabs
              years={yearView.years}
              activeYear={yearView.activeYear}
              selectedCounts={yearView.selectedCounts}
              onChange={yearView.setActiveYear}
            />
            {yearView.activeGroup ? (
              <div key={yearView.activeGroup.year} style={{ marginBottom: "0.85rem" }}>
                <strong style={{ fontSize: "0.85rem" }}>{yearView.activeGroup.year}</strong>
                <ul className={styles.setList}>
                  {yearView.activeGroup.entries.map((item) => (
                    <li key={item.date} className={styles.setRow}>
                      <label style={{ display: "flex", gap: "0.5rem", alignItems: "center", flex: 1 }}>
                        <input
                          type="checkbox"
                          checked={selected.has(item.date)}
                          onChange={() => toggle(item.date)}
                        />
                        <span>
                          {formatTrDate(item.date)} — {item.label}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </>
        )}
        <div className={styles.modalActions}>
          <Button variant="soft" onClick={onClose}>
            İptal
          </Button>
          <Button variant="primary" onClick={apply}>
            Uygula ({selected.size} gün)
          </Button>
        </div>
      </div>
    </div>
  );
}
