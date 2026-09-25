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
import { pickPlacement, placeBubble } from "./geometry";

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
