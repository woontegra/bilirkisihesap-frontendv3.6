/**
 * Standart Fazla Mesai — UBGT (Ulusal Bayram ve Genel Tatil) yıl gruplu çoklu
 * seçim penceresi. Statik lokal katalogdan (ubgtCatalog.ts) besler; ağ isteği
 * yoktur. Uygulandığında formdaki mevcut UBGT türü istisnaları TAMAMEN
 * seçilenlerle değiştirir (tek kaynak — hayalet kayıt kalmaz).
 */

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { groupUbgtCatalogByYear, getUbgtCatalogForRange, UBGT_RELIGIOUS_DATA_MAX_YEAR } from "./ubgtCatalog";
import { newLocalId, type ExclusionItem } from "./model";
import { UbgtYearTabs } from "../shared/UbgtYearTabs";
import { addDatesToSet, removeDatesFromSet, useUbgtYearView } from "../shared/useUbgtYearView";
import styles from "./GemiGunlukFmPage.module.css";

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

  const invalidRange = !rangeStart || !rangeEnd || rangeStart > rangeEnd;

  return (
    <div className={styles.modalOverlay} role="presentation" onClick={onClose}>
      <div
        className={`${styles.modalCard} ${styles.modalCardWide}`}
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className={styles.modalTitle}>UBGT günleri (FM düşümü)</h2>
        <p className={styles.modalDesc}>
          Aşağıda, seçilen döneme ait UBGT günleri listelenir. İşaretlediğiniz günler, işçinin çalışmadığı
          UBGT günleri olarak kabul edilir ve fazla mesai hesabında dışlanır.
        </p>

        {invalidRange ? (
          <p className={styles.emptyText}>
            UBGT gün seçimi için hesap döneminin başlangıç ve bitiş tarihlerini girin (sayfada tanımlanan aralık
            kullanılır).
          </p>
        ) : yearView.visibleGroups.length === 0 ? (
          <p className={styles.emptyText}>Bu dönem için listelenecek UBGT günü bulunamadı.</p>
        ) : (
          <>
            <div className={styles.inlineActions} style={{ marginBottom: "0.6rem" }}>
              <Button variant="soft" size="sm" onClick={selectAll}>
                Tümünü seç
              </Button>
              <Button variant="soft" size="sm" onClick={clearAll}>
                Seçimi temizle
              </Button>
            </div>
            <UbgtYearTabs
              years={yearView.years}
              activeYear={yearView.activeYear}
              selectedCounts={yearView.selectedCounts}
              onChange={yearView.setActiveYear}
            />
            <div className={styles.ubgtYearScroll}>
              {yearView.activeGroup ? ([yearView.activeGroup] as typeof yearView.visibleGroups).map((group) => (
                <div key={group.year} className={styles.ubgtYearGroup}>
                  <div className={styles.ubgtYearLabel}>
                    {group.year}
                    {group.year > UBGT_RELIGIOUS_DATA_MAX_YEAR ? (
                      <span className={styles.ubgtYearNote}></span>
                    ) : null}
                  </div>
                  <ul className={styles.ubgtDayList}>
                    {group.entries.map((entry) => (
                      <li key={entry.date}>
                        <label className={styles.ubgtDayLabel}>
                          <input
                            type="checkbox"
                            checked={selected.has(entry.date)}
                            onChange={() => toggle(entry.date)}
                          />
                          <span className={styles.ubgtDayDate}>{formatTrDate(entry.date)}</span>
                          <span className={styles.ubgtDayName}>
                            {entry.label}
                            {entry.days < 1 ? "" : ""}
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </div>
              )) : null}
            </div>
          </>
        )}

        <div className={styles.modalActions}>
          <Button variant="soft" onClick={onClose}>
            İptal
          </Button>
          <Button variant="primary" onClick={apply} disabled={invalidRange}>
            Uygula ({selected.size} gün)
          </Button>
        </div>
      </div>
    </div>
  );
}
