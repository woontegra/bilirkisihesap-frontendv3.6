/**
 * Standart Fazla Mesai — "Metin Hesaplaması" (V3 satır formatı).
 * Örnek (6 gün):
 *   08:00–19:00 = 11,00 saat çalışma
 *   - 1,50 saat ara dinlenme = 9,50 saat günlük çalışma
 *   6 x 9,50 = 57,00 saat
 *   Net haftalık çalışma = 57,00 saat,
 *   57,00 – 45 saat yasal haftalık çalışma = 12,00 saat haftalık fazla mesai
 */

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { SevenDayMode } from "./model";
import { STANDARD_DAILY_REFERENCE_HOURS, WEEKLY_WORK_LIMIT } from "./constants";
import styles from "./StandartFmPage.module.css";

function fmtH(n: number): string {
  return n.toFixed(2).replace(".", ",");
}

function buildMetin({
  davaciIn,
  davaciOut,
  weeklyDays,
  sevenDayMode,
  dailyGrossHours,
  breakHours,
  dailyNetHours,
  weeklyRawHours,
  weeklyRoundedHours,
  baselineWeeklyFmHours,
}: {
  davaciIn: string;
  davaciOut: string;
  weeklyDays: number;
  sevenDayMode: SevenDayMode;
  dailyGrossHours: number;
  breakHours: number;
  dailyNetHours: number;
  weeklyRawHours: number;
  weeklyRoundedHours: number;
  baselineWeeklyFmHours: number;
}): string {
  const inT = davaciIn.trim();
  const outT = davaciOut.trim();
  if (!inT || !outT || dailyNetHours <= 0) {
    return "Giriş ve çıkış saatlerini giriniz.";
  }

  const hg = Math.round(weeklyDays) || 6;
  const header =
    `${inT}–${outT} = ${fmtH(dailyGrossHours)} saat çalışma\n` +
    `- ${fmtH(breakHours)} saat ara dinlenme = ${fmtH(dailyNetHours)} saat günlük çalışma\n`;

  if (hg === 7) {
    if (sevenDayMode === "tatilsiz") {
      return (
        header +
        `7 x ${fmtH(dailyNetHours)} = ${fmtH(weeklyRawHours)} saat çalışma\n` +
        `Net haftalık çalışma = ${fmtH(weeklyRoundedHours)} saat,\n` +
        `${fmtH(weeklyRoundedHours)} – ${WEEKLY_WORK_LIMIT} saat yasal haftalık çalışma = ${fmtH(baselineWeeklyFmHours)} saat haftalık fazla mesai`
      );
    }
    const weeklyWork = dailyNetHours * 6;
    const extraHT = Math.max(0, dailyNetHours - STANDARD_DAILY_REFERENCE_HOURS);
    return (
      header +
      `6 x ${fmtH(dailyNetHours)} = ${fmtH(weeklyWork)} saat çalışma\n` +
      `${fmtH(dailyNetHours)} - 7,5 = ${fmtH(extraHT)} saat hafta tatili fazla çalışma mesaisi\n` +
      `= ${fmtH(weeklyRawHours)} saat çalışma\n` +
      `Net haftalık çalışma = ${fmtH(weeklyRoundedHours)} saat,\n` +
      `${fmtH(weeklyRoundedHours)} – ${WEEKLY_WORK_LIMIT} saat yasal haftalık çalışma = ${fmtH(baselineWeeklyFmHours)} saat haftalık fazla mesai`
    );
  }

  return (
    header +
    `${hg} x ${fmtH(dailyNetHours)} = ${fmtH(weeklyRawHours)} saat\n` +
    `Net haftalık çalışma = ${fmtH(weeklyRoundedHours)} saat,\n` +
    `${fmtH(weeklyRoundedHours)} – ${WEEKLY_WORK_LIMIT} saat yasal haftalık çalışma = ${fmtH(baselineWeeklyFmHours)} saat haftalık fazla mesai`
  );
}

export function MetinHesaplamasi({
  davaciIn,
  davaciOut,
  weeklyDays,
  sevenDayMode,
  onSevenDayModeChange,
  dailyGrossHours,
  breakHours,
  dailyNetHours,
  weeklyRawHours,
  weeklyRoundedHours,
  baselineWeeklyFmHours,
}: {
  davaciIn: string;
  davaciOut: string;
  weeklyDays: number;
  sevenDayMode: SevenDayMode;
  onSevenDayModeChange: (mode: SevenDayMode) => void;
  dailyGrossHours: number;
  breakHours: number;
  dailyNetHours: number;
  weeklyRawHours: number;
  weeklyRoundedHours: number;
  baselineWeeklyFmHours: number;
}) {
  const [open, setOpen] = useState(false);
  const isSevenDay = Math.round(weeklyDays) === 7;
  const text = buildMetin({
    davaciIn,
    davaciOut,
    weeklyDays,
    sevenDayMode,
    dailyGrossHours,
    breakHours,
    dailyNetHours,
    weeklyRawHours,
    weeklyRoundedHours,
    baselineWeeklyFmHours,
  });

  return (
    <div className={styles.accordion}>
      <button type="button" className={styles.accordionHead} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span>Metin Hesaplaması</span>
        {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>
      {open ? (
        <div className={styles.accordionBody}>
          {isSevenDay ? (
            <div className={styles.sevenDayTabs}>
              <button
                type="button"
                className={`${styles.sevenDayTab} ${sevenDayMode === "tatilsiz" ? styles.sevenDayTabActive : ""}`}
                onClick={() => onSevenDayModeChange("tatilsiz")}
              >
                Hafta Tatilsiz
              </button>
              <button
                type="button"
                className={`${styles.sevenDayTab} ${sevenDayMode === "tatilli" ? styles.sevenDayTabActive : ""}`}
                onClick={() => onSevenDayModeChange("tatilli")}
              >
                Hafta Tatilli
              </button>
            </div>
          ) : null}
          <pre className={styles.metinText}>{text}</pre>
        </div>
      ) : null}
    </div>
  );
}
