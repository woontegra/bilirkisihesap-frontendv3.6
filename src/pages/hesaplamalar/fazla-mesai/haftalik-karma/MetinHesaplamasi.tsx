/**
 * Haftalık Karma — Metin Hesaplaması (V3 generateWeeklyText formatı).
 */

import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import {
  clampWitnessGroupsByIndex,
  generateWeeklyText,
  toNumericDayGroups,
  witnessWeeklyHolidayFromPlaintiffClaim,
} from "./weeklyHours";
import type { DayGroup, Witness } from "./model";
import { MetinHesaplamasiPersonCards } from "../shared/MetinHesaplamasiPersonCards";
import styles from "./HaftalikKarmaFmPage.module.css";

export function MetinHesaplamasi({
  dayGroups,
  hasWeeklyHoliday,
  weeklyHolidayGroup,
  witnesses,
}: {
  dayGroups: DayGroup[];
  hasWeeklyHoliday: boolean;
  weeklyHolidayGroup: number;
  witnesses: Witness[];
}) {
  const [open, setOpen] = useState(false);

  const cards = useMemo(() => {
    const results: Array<{ key: string; label: string; text: string }> = [];
    const davaciGroups = toNumericDayGroups(dayGroups);
    const davaciText = generateWeeklyText(davaciGroups, "DAVACI", hasWeeklyHoliday, weeklyHolidayGroup);
    if (davaciText) results.push({ key: "davaci", label: davaciText.label, text: davaciText.text });

    witnesses.forEach((w, idx) => {
      const rawGroups = w.dayGroups?.length ? toNumericDayGroups(w.dayGroups) : davaciGroups;
      const clamped = clampWitnessGroupsByIndex(rawGroups, davaciGroups);
      const wName = (w.name && String(w.name).trim()) || `TANIK ${idx + 1}`;
      const wHt = witnessWeeklyHolidayFromPlaintiffClaim({
        davaciDayGroups: davaciGroups,
        davaciHasWeeklyHoliday: hasWeeklyHoliday,
        davaciWeeklyHolidayGroup: weeklyHolidayGroup,
        witnessDayGroups: clamped,
      });
      const wText = generateWeeklyText(clamped, wName, wHt.hasWeeklyHoliday, wHt.weeklyHolidayGroup);
      if (wText) results.push({ key: `witness-${w.id ?? idx}`, label: wText.label, text: wText.text });
    });

    return results;
  }, [dayGroups, hasWeeklyHoliday, weeklyHolidayGroup, witnesses]);

  return (
    <section className={styles.card} style={{ animationDelay: "90ms" }}>
      <div className={styles.accordion}>
        <button
          type="button"
          className={styles.accordionHead}
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          <span>Metin Hesaplaması</span>
          {open ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </button>
        {open ? (
          <div className={styles.accordionBody}>
            <MetinHesaplamasiPersonCards
              cards={cards}
              emptyMessage="Gün gruplarını doldurarak haftalık fazla mesai metnini görebilirsiniz."
            />
          </div>
        ) : null}
      </div>
    </section>
  );
}
