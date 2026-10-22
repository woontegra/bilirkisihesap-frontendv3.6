/**
 * Guided tour storage + auto-advance helpers — unit checks.
 */
import assert from "node:assert/strict";
import {
  datesReadyIn,
  isValidDatePair,
  isValidTimeValue,
  parseTourMoney,
  scheduleReadyCheck,
  timesReadyIn,
  wageReadyIn,
} from "./autoAdvance";
import {
  AUTO_WELCOME_SEEN_KEY,
  hasSeenAutoWelcome,
  loadTourPrefs,
  markAutoWelcomeSeen,
  saveTourPrefs,
  shouldOfferWelcome,
} from "./storage";
import { readFileSync } from "node:fs";
import { layoutBubble, pickPlacement, placeBubble, type Rect } from "./geometry";
import { hasForeignLayer } from "./layers";

const mem = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
  value: {
    getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
    setItem: (k: string, v: string) => mem.set(k, v),
    removeItem: (k: string) => mem.delete(k),
  },
  configurable: true,
});

mem.clear();
assert.equal(shouldOfferWelcome("__test-tour__", 1), true);
assert.equal(hasSeenAutoWelcome(), false);
markAutoWelcomeSeen();
assert.equal(localStorage.getItem(AUTO_WELCOME_SEEN_KEY), "true");
assert.equal(hasSeenAutoWelcome(), true);
assert.equal(shouldOfferWelcome("__test-tour__", 1), false);
assert.equal(shouldOfferWelcome("other-tour", 99), false);

// Per-tour prefs still persist but no longer gate auto welcome.
mem.clear();
saveTourPrefs("__test-tour__", { version: 1, neverShowWelcome: true });
assert.equal(loadTourPrefs("__test-tour__", 1).neverShowWelcome, true);
assert.equal(shouldOfferWelcome("__test-tour__", 1), true);
assert.equal(shouldOfferWelcome("__test-tour__", 2), true);

assert.equal(isValidDatePair("2020-01-01", "2021-01-01"), true);
assert.equal(isValidDatePair("2021-01-01", "2020-01-01"), false);
assert.equal(isValidDatePair("", "2020-01-01"), false);
assert.equal(parseTourMoney("27.000,50"), 27000.5);
assert.equal(parseTourMoney("27000"), 27000);
assert.equal(parseTourMoney(""), 0);

assert.equal(datesReadyIn(null), false);
assert.equal(wageReadyIn(null), false);
assert.equal(timesReadyIn(null), false);
assert.equal(isValidTimeValue("08:30"), true);
assert.equal(isValidTimeValue("24:00"), false);
assert.equal(isValidTimeValue("8:30"), false);
assert.equal(isValidTimeValue(""), false);

const rect = { top: 100, left: 100, width: 200, height: 40 };
assert.equal(pickPlacement(rect, "auto", 800, 600), "bottom");
const pos = placeBubble(rect, "top", 800, 600, 320, 200);
assert.ok(pos.top < rect.top);

// layoutBubble: balon hedefle çakışmaz ve ekran içinde kalır.
function overlaps(a: Rect, b: Rect): boolean {
  return a.left < b.left + b.width && b.left < a.left + a.width && a.top < b.top + b.height && b.top < a.top + a.height;
}
const VIEWPORTS: Array<[number, number]> = [
  [1920, 1080],
  [1440, 900],
  [1440, 760],
  [1280, 720],
];
const BW = 320;
const BH = 260;
for (const [vw, vh] of VIEWPORTS) {
  const targets: Rect[] = [
    { top: 40, left: 300, width: 600, height: 60 },
    { top: vh - 90, left: 300, width: 600, height: 60 },
    // Uzun form kartı: ekranın çoğunu kaplar (eski "top" yerleşimi düğmeleri örtüyordu).
    { top: 80, left: 260, width: 760, height: vh - 140 },
    { top: 120, left: 40, width: vw - 80, height: vh - 300 },
  ];
  let checkedNoOverlap = 0;
  for (const t of targets) {
    for (const pref of ["top", "bottom", "auto"] as const) {
      const l = layoutBubble(t, pref, vw, vh, BW, BH);
      const box = { top: l.top, left: l.left, width: BW, height: BH };
      assert.ok(l.left >= 0 && l.left + BW <= vw, `yatay taşma ${vw}x${vh}`);
      assert.ok(l.top >= 0 && l.top + BH <= vh, `dikey taşma ${vw}x${vh}`);
      const room = 24;
      const fits =
        t.left >= BW + room ||
        vw - (t.left + t.width) >= BW + room ||
        t.top >= BH + room ||
        vh - (t.top + t.height) >= BH + room;
      if (fits) {
        checkedNoOverlap += 1;
        assert.equal(overlaps(box, t), false, `çakışma ${vw}x${vh} ${JSON.stringify(t)} ${pref}`);
      }
    }
  }
  assert.ok(checkedNoOverlap >= 6, `yetersiz çakışma kontrolü ${vw}x${vh}`);
}
const centered = layoutBubble(null, "auto", 1280, 720, BW, BH);
assert.ok(Math.abs(centered.left - (1280 - BW) / 2) < 1);

// Safari yedekleri: her color-mix ve inset öncesinde düz değer bulunmalı.
const css = readFileSync(new URL("./GuidedTour.module.css", import.meta.url), "utf8");
const cssLines = css.split(/\r?\n/).map((s) => s.trim());
cssLines.forEach((line, i) => {
  if (!line.includes("color-mix(")) return;
  const prop = line.slice(0, line.indexOf(":"));
  assert.ok(cssLines[i - 1]?.startsWith(`${prop}:`), `color-mix yedeği eksik: ${line}`);
});
assert.ok(!/z-index:\s*12001\b/.test(css), "balon hedefin (12010) üstünde olmalı");
const spotlightBlock = /\.spotlight\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
assert.ok(spotlightBlock.includes("position: fixed"), ".spotlight kuralı bulunamadı");
assert.ok(!/transition/.test(spotlightBlock), "vurgu konumu animasyonlu olmamalı (hedeften kayar)");

// Duraklatma: sayfa modalı açıkken kılavuz durur; kılavuzun kendi katmanları ve gizli öğeler sayılmaz.
type FakeLayer = { attrs: Record<string, string>; inTour?: boolean; hidden?: boolean };
const layerDoc = (layers: FakeLayer[]) =>
  ({
    querySelectorAll: () =>
      layers.map((l) => ({
        getAttribute: (k: string) => l.attrs[k] ?? null,
        closest: () => (l.inTour ? {} : null),
        getClientRects: () => ({ length: l.hidden ? 0 : 1 }),
      })),
  }) as unknown as Document;
assert.equal(hasForeignLayer(layerDoc([])), false);
assert.equal(hasForeignLayer(layerDoc([{ attrs: { "aria-modal": "true" } }])), true, "sayfa modalı kılavuzu duraklatmalı");
assert.equal(hasForeignLayer(layerDoc([{ attrs: { "aria-modal": "true" }, inTour: true }])), false, "kılavuzun kendi penceresi sayılmamalı");
assert.equal(hasForeignLayer(layerDoc([{ attrs: { "aria-modal": "true" }, hidden: true }])), false, "gizli modal sayılmamalı");
assert.equal(hasForeignLayer(layerDoc([{ attrs: { "data-tour-pause": "false" } }])), false);

// Kıdem İş Kanunu ve İhbar (ortak görünüm) pencereleri algılanabilir olmalı: her role="dialog" aria-modal taşır.
for (const rel of [
  "../../pages/hesaplamalar/kidem-tazminati/is-kanunu/IsKanunuKidemPage.tsx",
  "../../pages/hesaplamalar/ihbar-tazminati/lib/IhbarPageView.tsx",
]) {
  const lines = readFileSync(new URL(rel, import.meta.url), "utf8").split(/\r?\n/);
  lines.forEach((line, i) => {
    if (!/(^|\s)role="dialog"/.test(line)) return;
    const near = lines.slice(Math.max(0, i - 3), i + 4).join(" ");
    assert.ok(near.includes('aria-modal="true"'), `${rel}:${i + 1} pencere aria-modal değil; kılavuz duraklamaz`);
  });
}

await new Promise<void>((resolve, reject) => {
  let calls = 0;
  let timer: number | null = null;
  scheduleReadyCheck({
    delayMs: 30,
    isReady: () => {
      calls += 1;
      return calls >= 2;
    },
    onReady: () => {
      try {
        assert.ok(calls >= 2);
        resolve();
      } catch (e) {
        reject(e);
      }
    },
    isCancelled: () => false,
    setTimer: (id) => {
      timer = id;
    },
    maxPolls: 5,
    pollMs: 20,
  });
  void timer;
});

mem.clear();
console.log("guided-tour.selftest: geçti ✔");
