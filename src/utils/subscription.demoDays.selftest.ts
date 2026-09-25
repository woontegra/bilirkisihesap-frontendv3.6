/**
 * Demo abonelik gün hesabı boundary selftest.
 * Run: npx vite-node --config vite.config.ts src/utils/subscription.demoDays.selftest.ts
 */
import { calculateSubscription } from "./subscription";

const DAY_MS = 86_400_000;

function assertEqual(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

function demoWindow(start: Date) {
  const end = new Date(start.getTime() + 7 * DAY_MS);
  return { start: start.toISOString(), end: end.toISOString() };
}

function check(
  label: string,
  start: Date,
  offsetMs: number,
  expected: { total: number; used: number; remaining: number },
) {
  const { start: s, end } = demoWindow(start);
  const now = new Date(start.getTime() + offsetMs);
  const r = calculateSubscription(s, end, now);
  assertEqual(r.totalDays, expected.total, `${label} total`);
  assertEqual(r.daysUsed, expected.used, `${label} used`);
  assertEqual(r.daysRemaining, expected.remaining, `${label} remaining`);
  console.log(`PASS ${label}: total=${r.totalDays} used=${r.daysUsed} remaining=${r.daysRemaining}`);
}

const startUtc = new Date("2026-09-18T19:30:00.000Z"); // ~TR 22:30
check("0 saat", startUtc, 0, { total: 7, used: 0, remaining: 7 });
check("23:59", startUtc, 23 * 60 * 60 * 1000 + 59 * 60 * 1000, {
  total: 7,
  used: 0,
  remaining: 7,
});
check("24 saat", startUtc, 24 * 60 * 60 * 1000, { total: 7, used: 1, remaining: 6 });
check("48 saat", startUtc, 48 * 60 * 60 * 1000, { total: 7, used: 2, remaining: 5 });
check("6 tam gün", startUtc, 6 * DAY_MS, { total: 7, used: 6, remaining: 1 });
check("7 tam gün", startUtc, 7 * DAY_MS, { total: 7, used: 7, remaining: 0 });

// Türkiye takvim günü kayması: oluşturmadan birkaç saat sonra ertesi yerel güne geçilse bile used=0
const lateEveningTr = new Date("2026-09-18T20:30:00.000Z"); // 23:30 TR
check(
  "TR timezone +3.5s (ertesi takvim gününe yaklaşma)",
  lateEveningTr,
  3.5 * 60 * 60 * 1000,
  { total: 7, used: 0, remaining: 7 },
);

// Inclusive +1 regresyon: 18→25 takvim uçları 8 gün DEĞİL
{
  const start = new Date("2026-09-18T10:00:00.000Z");
  const end = new Date(start.getTime() + 7 * DAY_MS);
  const r = calculateSubscription(start.toISOString(), end.toISOString(), start);
  assertEqual(r.totalDays, 7, "no inclusive +1 total");
  assertEqual(r.daysUsed, 0, "no inclusive +1 used on create");
  console.log("PASS no calendar inclusive +1");
}

// Demo→ücretli kalan gün: 3 tam gün sonra remaining=4 (backend ceil ile uyumlu)
{
  const start = new Date("2026-09-18T12:00:00.000Z");
  const end = new Date(start.getTime() + 7 * DAY_MS);
  const after3 = new Date(start.getTime() + 3 * DAY_MS);
  const r = calculateSubscription(start.toISOString(), end.toISOString(), after3);
  assertEqual(r.daysRemaining, 4, "demo→paid carry remaining after 3d");
  // Backend calculateRemainingDays(expiresAt, now) = ceil((end-now)/DAY)
  const backendStyle = Math.max(0, Math.ceil((end.getTime() - after3.getTime()) / DAY_MS));
  assertEqual(r.daysRemaining, backendStyle, "FE remaining matches backend ceil");
  console.log("PASS demo→paid remaining alignment");
}

console.log("All subscription.demoDays.selftest checks passed.");
