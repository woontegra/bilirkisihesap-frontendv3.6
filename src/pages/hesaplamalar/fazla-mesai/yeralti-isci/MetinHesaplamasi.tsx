/**
 * Yeraltı İşçisi Fazla Mesai — Metin Hesaplaması (Tanıklı Standart düzeni).
 * Davacı için 1 kart, her tanık için 1 kart; kişi başına tek özet metin.
 * Metin biçimi ve ara dinlenme kademeleri V3 `groupYeraltiMetinCards` ile birebir
 * aynıdır (yeraltı usulü, 37:30 haftalık sınır, 6:15 hafta tatili referansı).
 */

import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { SevenDayMode, WitnessInput } from "./model";
import { MetinHesaplamasiPersonCards } from "../shared/MetinHesaplamasiPersonCards";
import styles from "./YeraltiFmPage.module.css";

const WEEKLY_LIMIT_Y = 37.5;
const STANDARD_DAILY_REF = 6.25;

type MetinKarti = { key: string; label: string; text: string };

function normalizeHm(t: string): string {
  const clean = String(t || "").trim().replace(".", ":");
  const [hs, ms] = clean.split(":");
  const h = Number(hs);
  const m = Number(ms);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return clean;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function applyYargitayRounding(decimalHours: number): number {
  const hours = Math.floor(decimalHours);
  const minutes = Math.round((decimalHours - hours) * 60);
  if (minutes === 0) return hours;
  if (minutes <= 30) return hours + 0.5;
  return hours + 1;
}

/** V3 metin kartı ara dinlenme kademeleri (backend `computeBreakHours` değil, V3 metin usulü). */
function yeraltiBreakHours(brut: number): number {
  if (!Number.isFinite(brut) || brut <= 0) return 0;
  if (brut <= 4) return 0.25;
  if (brut <= 7.5) return 0.5;
  if (brut <= 11) return 1;
  if (brut < 14) return 1.5;
  if (brut < 15) return 2;
  return 3;
}

function fmtSaat(n: number): string {
  if (!Number.isFinite(n)) return "0";
  const rounded = Math.round(n * 100) / 100;
  if (Math.abs(rounded - Math.round(rounded)) < 0.001) return String(Math.round(rounded));
  return rounded.toFixed(2).replace(/\.?0+$/, "").replace(".", ",");
}

function fmtFm(n: number): string {
  return Number(n).toFixed(2).replace(".", ",");
}

function resolveWitnessWeeklyDays(witnessHg: number | "" | undefined, davaciHg: number): number {
  if (witnessHg === "" || witnessHg == null) return davaciHg;
  const n = Number(witnessHg);
  return Number.isFinite(n) && n >= 1 && n <= 7 ? Math.floor(n) : davaciHg;
}

function buildMetinText(params: {
  giris: string;
  cikis: string;
  brut: number;
  brk: number;
  net: number;
  weeklyDays: number;
  activeTab: SevenDayMode;
}): string {
  const { giris, cikis, brut, brk, net, weeklyDays, activeTab } = params;
  const inFmt = normalizeHm(giris);
  const outFmt = normalizeHm(cikis);
  const hg = weeklyDays || 6;

  const lines: string[] = [
    `${inFmt} - ${outFmt} = ${fmtSaat(brut)} saat çalışma`,
    ` - ${fmtSaat(brk)} saat ara dinlenme`,
    `= ${fmtSaat(net)} saat günlük çalışma`,
  ];

  let netHaftalik: number;
  if (hg === 7 && activeTab === "tatilli") {
    const weeklyNormal = 6 * net;
    const extra = Math.max(0, net - STANDARD_DAILY_REF);
    const weeklyCalc = weeklyNormal + extra;
    netHaftalik = applyYargitayRounding(weeklyCalc);
    lines.push(`6 × ${fmtSaat(net)} = ${fmtSaat(weeklyNormal)} saat`);
    lines.push(`${fmtSaat(net)} - 6:15 = ${fmtSaat(extra)} saat hafta tatili mesaisi`);
    lines.push(`= ${fmtSaat(weeklyCalc)} saat → Net haftalık: ${fmtSaat(netHaftalik)} saat`);
  } else {
    const days = hg === 7 && activeTab === "tatilsiz" ? 7 : hg;
    const weeklyCalc = net * days;
    netHaftalik = applyYargitayRounding(weeklyCalc);
    lines.push(`${days} × ${fmtSaat(net)} = ${fmtSaat(weeklyCalc)} saat → Net haftalık: ${fmtSaat(netHaftalik)} saat`);
  }

  const fm = Math.max(0, netHaftalik - WEEKLY_LIMIT_Y);
  lines.push(`${fmtSaat(netHaftalik)} saat - 37:30 saat = ${fmtFm(fm)} saat haftalık fazla mesai`);

  return lines.join("\n");
}

function toMin(t: string): number {
  const [h, m] = normalizeHm(t).split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function buildDavaciText(
  davaciIn: string,
  davaciOut: string,
  weeklyDays: number,
  activeTab: SevenDayMode,
): string | null {
  if (!davaciIn?.trim() || !davaciOut?.trim()) return null;
  const brut = Math.max(0, (toMin(davaciOut) - toMin(davaciIn)) / 60);
  const brk = yeraltiBreakHours(brut);
  const net = Math.max(0, brut - brk);
  return buildMetinText({ giris: davaciIn, cikis: davaciOut, brut, brk, net, weeklyDays, activeTab });
}

function buildWitnessText(
  w: WitnessInput,
  davaciIn: string,
  davaciOut: string,
  weeklyDays: number,
  activeTab: SevenDayMode,
): string | null {
  if (!w.dateIn || !w.dateOut || !w.in?.trim() || !w.out?.trim()) return null;
  const dIn = toMin(davaciIn);
  const dOut = toMin(davaciOut);
  let tIn = toMin(w.in);
  let tOut = toMin(w.out);
  tIn = Math.max(tIn, dIn);
  tOut = Math.min(tOut, dOut);
  const brut = Math.max(0, (tOut - tIn) / 60);
  const brk = yeraltiBreakHours(brut);
  const net = Math.max(0, brut - brk);
  const kesikGir = normalizeHm(`${String(Math.floor(tIn / 60)).padStart(2, "0")}:${String(tIn % 60).padStart(2, "0")}`);
  const kesikCik = normalizeHm(`${String(Math.floor(tOut / 60)).padStart(2, "0")}:${String(tOut % 60).padStart(2, "0")}`);
  const hg = resolveWitnessWeeklyDays(w.weeklyDays, weeklyDays || 6);
  return buildMetinText({ giris: kesikGir, cikis: kesikCik, brut, brk, net, weeklyDays: hg, activeTab });
}

export function MetinHesaplamasi({
  davaciIn,
  davaciOut,
  weeklyDays,
  sevenDayMode,
  onSevenDayModeChange,
  witnesses,
}: {
  davaciIn: string;
  davaciOut: string;
  weeklyDays: number;
  sevenDayMode: SevenDayMode;
  onSevenDayModeChange: (mode: SevenDayMode) => void;
  witnesses: WitnessInput[];
}) {
  const [open, setOpen] = useState(false);
  const isSevenDay = Math.round(weeklyDays) === 7;
  const activeTab: SevenDayMode = isSevenDay && sevenDayMode === "tatilli" ? "tatilli" : "tatilsiz";

  const cards = useMemo<MetinKarti[]>(() => {
    const out: MetinKarti[] = [];
    const davaciText = buildDavaciText(davaciIn, davaciOut, weeklyDays || 6, activeTab);
    if (davaciText) out.push({ key: "davaci", label: "DAVACI", text: davaciText });
    witnesses.forEach((w, idx) => {
      const text = buildWitnessText(w, davaciIn, davaciOut, weeklyDays || 6, activeTab);
      if (!text) return;
      const label = (w.name?.trim() || `TANIK ${idx + 1}`).toUpperCase();
      out.push({ key: `witness:${w.id}`, label, text });
    });
    return out;
  }, [davaciIn, davaciOut, weeklyDays, activeTab, witnesses]);

  return (
    <div className={styles.accordion}>
      <button type="button" className={styles.accordionHead} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span>Metin Hesaplaması</span>
        {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>
      {open ? (
        <div className={styles.accordionBody}>
          <p className={styles.metinIntro}>
            Özet metinler girilen saatlere göre hesaplanır (yeraltı usulü, 37:30 haftalık sınır, 6:15 hafta tatili
            referansı).
          </p>
          {isSevenDay ? (
            <div className={styles.sevenDayTabs}>
              <button
                type="button"
                className={`${styles.sevenDayTab} ${activeTab === "tatilsiz" ? styles.sevenDayTabActive : ""}`}
                onClick={() => onSevenDayModeChange("tatilsiz")}
              >
                Hafta Tatilsiz
              </button>
              <button
                type="button"
                className={`${styles.sevenDayTab} ${activeTab === "tatilli" ? styles.sevenDayTabActive : ""}`}
                onClick={() => onSevenDayModeChange("tatilli")}
              >
                Hafta Tatilli
              </button>
            </div>
          ) : null}
          {cards.length > 0 ? (
            <MetinHesaplamasiPersonCards cards={cards} />
          ) : (
            <p className={styles.metinText}>
              İşe giriş/çıkış ve davacı saatlerini girin; tanık aralığı opsiyoneldir.
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
