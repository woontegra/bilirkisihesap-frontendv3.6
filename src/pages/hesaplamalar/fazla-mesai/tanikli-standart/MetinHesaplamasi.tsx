/**
 * Tanıklı Standart — Metin Hesaplaması (V3 satır formatı).
 * Davacı bloğu + her tanık için ayrı blok (saatler davacıya kırpılmış).
 * 7 gün sekmeleri: davacı VEYA herhangi tanık 7 günse göster.
 */

import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import {
  computeDailyNetHours,
  computeWitnessClippedFm,
  resolveWitnessWeeklyDays,
} from "./engine";
import { STANDARD_DAILY_REFERENCE_HOURS, WEEKLY_WORK_LIMIT } from "./constants";
import type { SevenDayMode, Witness } from "./model";
import { MetinHesaplamasiPersonCards } from "../shared/MetinHesaplamasiPersonCards";
import styles from "./TanikliStandartFmPage.module.css";

function fmtH(n: number): string {
  return n.toFixed(2).replace(".", ",");
}

function fmt(n: number): string {
  return n.toFixed(2).replace(/\.00$/, "").replace(".", ",");
}

function buildDavaciBlock(params: {
  inT: string;
  outT: string;
  weeklyDays: number;
  sevenDayMode: SevenDayMode;
}): { text: string; fmHours: number } {
  const { inT, outT, weeklyDays, sevenDayMode } = params;
  if (!inT || !outT) {
    return {
      text: "Davacı için tarih ve saat bilgilerini giriniz.",
      fmHours: 0,
    };
  }
  const { gross: brut, breakHours: brk, net: netGunluk } = computeDailyNetHours(inT, outT);
  if (netGunluk <= 0) {
    return { text: "Davacı için geçerli giriş/çıkış saatlerini giriniz.", fmHours: 0 };
  }
  const hg = Math.round(weeklyDays) || 6;

  if (hg === 7 && sevenDayMode === "tatilli") {
    const weeklyNormal = 6 * netGunluk;
    const extraHT = Math.max(0, netGunluk - STANDARD_DAILY_REFERENCE_HOURS);
    const toplamCalisma = weeklyNormal + extraHT;
    const roundedWeekly = Math.max(0, toplamCalisma);
    // V3: ceilWeeklyWorkHoursToHalfHour — engine üzerinden tutarlılık için computeWitnessClippedFm formülü
    const clipped = computeWitnessClippedFm({
      davaciIn: inT,
      davaciOut: outT,
      witnessIn: inT,
      witnessOut: outT,
      weeklyDays: 7,
      sevenDayMode: "tatilli",
    });
    const davaciWeeklyFM = clipped?.fmHours ?? Math.max(0, roundedWeekly - WEEKLY_WORK_LIMIT);
    const text =
      `DAVACI:\n` +
      `${inT} - ${outT} = ${fmtH(brut)} saat çalışma\n` +
      `- ${fmtH(brk)} saat ara dinlenme\n` +
      `= ${fmtH(netGunluk)} saat günlük çalışma\n` +
      `6 x ${fmtH(netGunluk)} = ${fmtH(weeklyNormal)} saat çalışma\n` +
      `${fmtH(netGunluk)} - 7,5 = ${fmtH(extraHT)} saat hafta tatili fazla çalışma\n` +
      `= ${fmtH(toplamCalisma)} saat haftalık çalışma\n` +
      `- 45 saat haftalık çalışma saati\n` +
      `= ${fmt(davaciWeeklyFM)} saat haftalık fazla mesai`;
    return { text, fmHours: davaciWeeklyFM };
  }

  if (hg === 7 && sevenDayMode === "tatilsiz") {
    const clipped = computeWitnessClippedFm({
      davaciIn: inT,
      davaciOut: outT,
      witnessIn: inT,
      witnessOut: outT,
      weeklyDays: 7,
      sevenDayMode: "tatilsiz",
    });
    const weeklyTotal = netGunluk * 7;
    const davaciWeeklyFM = clipped?.fmHours ?? 0;
    const roundedWeekly = davaciWeeklyFM + WEEKLY_WORK_LIMIT;
    const text =
      `DAVACI:\n` +
      `${inT} - ${outT} = ${fmtH(brut)} saat çalışma\n` +
      `- ${fmtH(brk)} saat ara dinlenme\n` +
      `= ${fmtH(netGunluk)} saat günlük çalışma\n` +
      `7 x ${fmtH(netGunluk)} = ${fmtH(weeklyTotal)} saat çalışma\n` +
      `= ${fmt(roundedWeekly)} saat haftalık çalışma\n` +
      `- 45 saat haftalık çalışma saati\n` +
      `= ${fmt(davaciWeeklyFM)} saat haftalık fazla mesai`;
    return { text, fmHours: davaciWeeklyFM };
  }

  const clipped = computeWitnessClippedFm({
    davaciIn: inT,
    davaciOut: outT,
    witnessIn: inT,
    witnessOut: outT,
    weeklyDays: hg,
    sevenDayMode,
  });
  const weeklyTotal = netGunluk * hg;
  const davaciWeeklyFM = clipped?.fmHours ?? 0;
  const roundedWeekly = davaciWeeklyFM + WEEKLY_WORK_LIMIT;
  const text =
    `DAVACI:\n` +
    `${inT} - ${outT} = ${fmtH(brut)} saat çalışma\n` +
    `- ${fmtH(brk)} saat ara dinlenme\n` +
    `= ${fmtH(netGunluk)} saat günlük çalışma\n` +
    `${hg} x ${fmtH(netGunluk)} = ${fmtH(weeklyTotal)} saat çalışma\n` +
    `= ${fmt(roundedWeekly)} saat haftalık çalışma\n` +
    `- 45 saat haftalık çalışma saati\n` +
    `= ${fmt(davaciWeeklyFM)} saat haftalık fazla mesai`;
  return { text, fmHours: davaciWeeklyFM };
}

function buildWitnessBlock(
  tanik: Witness,
  idx: number,
  davaciIn: string,
  davaciOut: string,
  davaciHg: number,
  sevenDayMode: SevenDayMode,
): string | null {
  if (!tanik.dateIn || !tanik.dateOut || !tanik.in || !tanik.out) return null;
  if (!davaciIn || !davaciOut) return null;
  const tHg = resolveWitnessWeeklyDays(tanik, davaciHg);
  const clipped = computeWitnessClippedFm({
    davaciIn,
    davaciOut,
    witnessIn: tanik.in,
    witnessOut: tanik.out,
    weeklyDays: tHg,
    sevenDayMode,
  });
  if (!clipped) return null;

  const tanikName = (tanik.name?.trim() || `TANIK ${idx + 1}`).toUpperCase();
  const { clippedIn: kesikGir, clippedOut: kesikCik, dailyGross: tDailyBrut, breakHours: tBrk, dailyNet: tDailyNet, fmHours: tWeeklyFM } =
    clipped;

  if (tHg === 7 && sevenDayMode === "tatilli") {
    const weeklyNormal = 6 * tDailyNet;
    const holidayOvertime = Math.max(0, tDailyNet - STANDARD_DAILY_REFERENCE_HOURS);
    const weeklyTotal = weeklyNormal + holidayOvertime;
    const roundedWeekly = tWeeklyFM + WEEKLY_WORK_LIMIT;
    return (
      `${tanikName}:\n` +
      `${kesikGir} - ${kesikCik} = ${fmtH(tDailyBrut)} saat çalışma\n` +
      `- ${fmtH(tBrk)} saat ara dinlenme\n` +
      `= ${fmtH(tDailyNet)} saat günlük çalışma\n` +
      `6 x ${fmtH(tDailyNet)} = ${fmtH(weeklyNormal)} saat çalışma\n` +
      `${fmtH(tDailyNet)} - 7,5 = ${fmtH(holidayOvertime)} saat hafta tatili fazla çalışma\n` +
      `= ${fmtH(weeklyTotal)} saat çalışma\n` +
      `Net haftalık çalışma = ${fmt(roundedWeekly)} saat,\n` +
      `${fmt(roundedWeekly)} – 45 saat yasal haftalık çalışma = ${fmt(tWeeklyFM)} saat haftalık fazla mesai`
    );
  }

  const tWeeklyTotal = tDailyNet * tHg;
  const roundedWeekly = tWeeklyFM + WEEKLY_WORK_LIMIT;
  return (
    `${tanikName}:\n` +
    `${kesikGir} - ${kesikCik} = ${fmtH(tDailyBrut)} saat çalışma\n` +
    `- ${fmtH(tBrk)} saat ara dinlenme\n` +
    `= ${fmtH(tDailyNet)} saat günlük çalışma\n` +
    `${tHg} x ${fmtH(tDailyNet)} = ${fmtH(tWeeklyTotal)} saat çalışma\n` +
    `Net haftalık çalışma = ${fmt(roundedWeekly)} saat,\n` +
    `${fmt(roundedWeekly)} – 45 saat yasal haftalık çalışma = ${fmt(tWeeklyFM)} saat haftalık fazla mesai`
  );
}

export function MetinHesaplamasi({
  weeklyDays,
  sevenDayMode,
  onSevenDayModeChange,
  davaciIn,
  davaciOut,
  taniklar,
}: {
  weeklyDays: number;
  sevenDayMode: SevenDayMode;
  onSevenDayModeChange: (mode: SevenDayMode) => void;
  davaciIn: string;
  davaciOut: string;
  taniklar: Witness[];
}) {
  const [open, setOpen] = useState(false);

  const showSevenDayMetinTabs = useMemo(() => {
    const h = Number(weeklyDays) || 6;
    return h === 7 || taniklar.some((t) => resolveWitnessWeeklyDays(t, h) === 7);
  }, [weeklyDays, taniklar]);

  const cards = useMemo(() => {
    const davaci = buildDavaciBlock({
      inT: davaciIn,
      outT: davaciOut,
      weeklyDays,
      sevenDayMode,
    });
    const out: Array<{ key: string; label: string; text: string }> = [
      { key: "davaci", label: "DAVACI", text: davaci.text },
    ];
    taniklar.forEach((t, idx) => {
      const block = buildWitnessBlock(t, idx, davaciIn, davaciOut, Number(weeklyDays) || 6, sevenDayMode);
      if (!block) return;
      const label = (t.name?.trim() || `TANIK ${idx + 1}`).toUpperCase();
      out.push({ key: `witness-${t.id ?? idx}`, label, text: block });
    });
    return out;
  }, [davaciIn, davaciOut, weeklyDays, sevenDayMode, taniklar]);

  return (
    <div className={styles.accordion}>
      <button type="button" className={styles.accordionHead} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span>Metin Hesaplaması</span>
        {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>
      {open ? (
        <div className={styles.accordionBody}>
          {showSevenDayMetinTabs ? (
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
          <MetinHesaplamasiPersonCards cards={cards} />
        </div>
      ) : null}
    </div>
  );
}
