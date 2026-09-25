/**
 * Gemi Adamı Günlük — Metin Hesaplaması (V3 gemiMetinCards birebir).
 */

import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import {
  ceilWeeklyWorkHoursToHalfHour,
  calculateDailyWorkHours,
  computeBreakHours,
} from "./engine";
import { METIN_DAILY_REF_HOURS, WEEKLY_WORK_LIMIT } from "./constants";
import type { SevenDayMode, Witness } from "./model";
import { MetinHesaplamasiPersonCards } from "../shared/MetinHesaplamasiPersonCards";
import styles from "./GemiGunlukFmPage.module.css";

function fmtH(n: number): string {
  return String(n ?? 0).replace(".", ",");
}

function fmt(n: number): string {
  const s = Number(n || 0).toFixed(2);
  return s.replace(".", ",");
}

function resolveWitnessWeeklyDays(t: Witness, davaciHg: number): number {
  const raw = t.weeklyDays;
  if (raw === "" || raw == null) return davaciHg;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 1 && n <= 7 ? Math.floor(n) : davaciHg;
}

function resolveWitnessSevenDayMode(t: Witness): SevenDayMode {
  return t.sevenDayMode === "tatilli" ? "tatilli" : "tatilsiz";
}

export function MetinHesaplamasi({
  davaciIn,
  davaciOut,
  weeklyDays,
  sevenDayMode,
  witnesses,
}: {
  davaciIn: string;
  davaciOut: string;
  weeklyDays: number;
  sevenDayMode: SevenDayMode;
  witnesses: Witness[];
}) {
  const [open, setOpen] = useState(false);

  const cards = useMemo(() => {
    const hg = Number(weeklyDays) || 6;
    const inT = davaciIn || "";
    const outT = davaciOut || "";
    const result: Array<{ key: string; title: string; body: string }> = [];

    if (!inT || !outT) {
      result.push({
        key: "davaci",
        title: "",
        body: "Davacı için giriş ve çıkış saatlerini giriniz.",
      });
      witnesses.forEach((tanik, idx) => {
        const tanikName = (tanik.name?.trim() || `TANIK ${idx + 1}`).toUpperCase();
        result.push({
          key: `tanik-${tanik.id}`,
          title: "",
          body: `${tanikName}:\nDavacı saatleri girildikten sonra bu tanığın hesap metni gösterilir.`,
        });
      });
      return result;
    }

    const brut = calculateDailyWorkHours(inT, outT);
    const brk = computeBreakHours(brut);
    const netGunluk = Math.max(0, brut - brk);

    let davaciText: string;
    if (hg === 7 && sevenDayMode === "tatilli") {
      const weeklyNormal = 6 * netGunluk;
      const extraHT = Math.max(0, netGunluk - METIN_DAILY_REF_HOURS);
      const toplamCalisma = weeklyNormal + extraHT;
      const roundedWeekly = ceilWeeklyWorkHoursToHalfHour(toplamCalisma);
      const davaciWeeklyFM = Math.max(0, roundedWeekly - WEEKLY_WORK_LIMIT);
      davaciText =
        `DAVACI:\n` +
        `${inT} - ${outT} = ${fmtH(brut)} saat çalışma\n` +
        `- ${fmtH(brk)} saat ara dinlenme\n` +
        `= ${fmtH(netGunluk)} saat günlük çalışma\n` +
        `6 x ${fmtH(netGunluk)} = ${fmtH(weeklyNormal)} saat çalışma\n` +
        `${fmtH(netGunluk)} - 7,5 = ${fmtH(extraHT)} saat hafta tatili fazla çalışma\n` +
        `= ${fmtH(toplamCalisma)} saat haftalık çalışma\n` +
        `- 48 saat haftalık çalışma saati\n` +
        `= ${fmt(davaciWeeklyFM)} saat haftalık fazla mesai`;
    } else if (hg === 7 && sevenDayMode === "tatilsiz") {
      const weeklyTotal = netGunluk * 7;
      const roundedWeekly = ceilWeeklyWorkHoursToHalfHour(weeklyTotal);
      const davaciWeeklyFM = Math.max(0, roundedWeekly - WEEKLY_WORK_LIMIT);
      davaciText =
        `DAVACI:\n` +
        `${inT} - ${outT} = ${fmtH(brut)} saat çalışma\n` +
        `- ${fmtH(brk)} saat ara dinlenme\n` +
        `= ${fmtH(netGunluk)} saat günlük çalışma\n` +
        `7 x ${fmtH(netGunluk)} = ${fmtH(weeklyTotal)} saat çalışma\n` +
        `= ${fmt(roundedWeekly)} saat haftalık çalışma\n` +
        `- 48 saat haftalık çalışma saati\n` +
        `= ${fmt(davaciWeeklyFM)} saat haftalık fazla mesai`;
    } else {
      const weeklyTotal = netGunluk * hg;
      const roundedWeekly = ceilWeeklyWorkHoursToHalfHour(weeklyTotal);
      const davaciWeeklyFM = Math.max(0, roundedWeekly - WEEKLY_WORK_LIMIT);
      davaciText =
        `DAVACI:\n` +
        `${inT} - ${outT} = ${fmtH(brut)} saat çalışma\n` +
        `- ${fmtH(brk)} saat ara dinlenme\n` +
        `= ${fmtH(netGunluk)} saat günlük çalışma\n` +
        `${hg} x ${fmtH(netGunluk)} = ${fmtH(weeklyTotal)} saat çalışma\n` +
        `= ${fmt(roundedWeekly)} saat haftalık çalışma\n` +
        `- 48 saat haftalık çalışma saati\n` +
        `= ${fmt(davaciWeeklyFM)} saat haftalık fazla mesai`;
    }
    result.push({ key: "davaci", title: "", body: davaciText });

    const [dGirH, dGirM] = inT.split(":").map(Number);
    const [dCikH, dCikM] = outT.split(":").map(Number);
    const dGirMinutes = dGirH * 60 + dGirM;
    const dCikMinutes = dCikH * 60 + dCikM;

    witnesses.forEach((tanik, idx) => {
      const tanikName = (tanik.name?.trim() || `TANIK ${idx + 1}`).toUpperCase();
      if (!tanik.dateIn || !tanik.dateOut || !tanik.in || !tanik.out) {
        result.push({
          key: `tanik-${tanik.id}`,
          title: "",
          body: `${tanikName}:\nTarih aralığı ve giriş–çıkış saatlerini giriniz.`,
        });
        return;
      }
      const [tGirH, tGirM] = tanik.in.split(":").map(Number);
      const [tCikH, tCikM] = tanik.out.split(":").map(Number);
      let tGirMinutes = tGirH * 60 + tGirM;
      let tCikMinutes = tCikH * 60 + tCikM;
      tGirMinutes = Math.max(tGirMinutes, dGirMinutes);
      tCikMinutes = Math.min(tCikMinutes, dCikMinutes);
      const tDailyBrut = Math.max(0, (tCikMinutes - tGirMinutes) / 60);
      const tBrk = computeBreakHours(tDailyBrut);
      const tDailyNet = Math.max(0, tDailyBrut - tBrk);
      const kesikGir = `${String(Math.floor(tGirMinutes / 60)).padStart(2, "0")}:${String(tGirMinutes % 60).padStart(2, "0")}`;
      const kesikCik = `${String(Math.floor(tCikMinutes / 60)).padStart(2, "0")}:${String(tCikMinutes % 60).padStart(2, "0")}`;

      const tWorkDays = resolveWitnessWeeklyDays(tanik, hg);
      const tSeven = resolveWitnessSevenDayMode(tanik);

      let tanikText: string;
      if (tWorkDays === 7 && tSeven === "tatilli") {
        const weeklyNormal = 6 * tDailyNet;
        const holidayOvertime = Math.max(0, tDailyNet - METIN_DAILY_REF_HOURS);
        const weeklyTotal = weeklyNormal + holidayOvertime;
        const roundedWeekly = ceilWeeklyWorkHoursToHalfHour(weeklyTotal);
        const tWeeklyFM = Math.max(0, roundedWeekly - WEEKLY_WORK_LIMIT);
        tanikText =
          `${tanikName}:\n` +
          `${kesikGir} - ${kesikCik} = ${fmtH(tDailyBrut)} saat çalışma\n` +
          `- ${fmtH(tBrk)} saat ara dinlenme\n` +
          `= ${fmtH(tDailyNet)} saat günlük çalışma\n` +
          `6 x ${fmtH(tDailyNet)} = ${fmtH(weeklyNormal)} saat çalışma\n` +
          `${fmtH(tDailyNet)} - 7,5 = ${fmtH(holidayOvertime)} saat hafta tatili fazla çalışma\n` +
          `= ${fmtH(weeklyTotal)} saat çalışma\n` +
          `Net haftalık çalışma = ${fmt(roundedWeekly)} saat,\n` +
          `${fmt(roundedWeekly)} – 48 saat yasal haftalık çalışma = ${fmt(tWeeklyFM)} saat haftalık fazla mesai`;
      } else {
        const tWeeklyTotal = tDailyNet * tWorkDays;
        const roundedWeekly = ceilWeeklyWorkHoursToHalfHour(tWeeklyTotal);
        const tWeeklyFM = Math.max(0, roundedWeekly - WEEKLY_WORK_LIMIT);
        tanikText =
          `${tanikName}:\n` +
          `${kesikGir} - ${kesikCik} = ${fmtH(tDailyBrut)} saat çalışma\n` +
          `- ${fmtH(tBrk)} saat ara dinlenme\n` +
          `= ${fmtH(tDailyNet)} saat günlük çalışma\n` +
          `${tWorkDays} x ${fmtH(tDailyNet)} = ${fmtH(tWeeklyTotal)} saat çalışma\n` +
          `Net haftalık çalışma = ${fmt(roundedWeekly)} saat,\n` +
          `${fmt(roundedWeekly)} – 48 saat yasal haftalık çalışma = ${fmt(tWeeklyFM)} saat haftalık fazla mesai`;
      }
      result.push({ key: `tanik-${tanik.id}`, title: "", body: tanikText });
    });

    return result;
  }, [davaciIn, davaciOut, weeklyDays, sevenDayMode, witnesses]);

  return (
    <div className={styles.accordion}>
      <button type="button" className={styles.accordionHead} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span>
          <span>Metin Hesaplaması</span>
          <span className={styles.panelHint}>Metin üzerinden hesaplama yapmak için tıklayın</span>
        </span>
        {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>
      {open ? (
        <div className={styles.accordionBody}>
          <p className={styles.errorText} style={{ marginBottom: "0.75rem" }}>
            Aşağıdaki metin kartları yalnızca davacı ve tanık beyanlarına göre üretilir (Tanıklı Standart ile aynı yapı). Cetvel satırları sunucuda dönemsel olarak hesaplanır; haftalık yasal çalışma 48 saattir.
          </p>
          <MetinHesaplamasiPersonCards
            cards={cards.map((c, i) => {
              const first = c.body.split("\n")[0]?.trim() ?? "";
              const label =
                c.title?.trim() ||
                (first.endsWith(":") ? first.slice(0, -1) : "") ||
                (i === 0 ? "DAVACI" : `TANIK ${i}`);
              return { key: c.key, label, text: c.body };
            })}
          />
        </div>
      ) : null}
    </div>
  );
}
