/**
 * Deterministic auto-advance helpers for guided tours.
 * Reads live DOM values (not stale React closures) so native date inputs
 * and typing advance without requiring blur.
 */

export function readDatePair(root: Element | null): { start: string; end: string } {
  if (!root) return { start: "", end: "" };
  const dates = root.querySelectorAll<HTMLInputElement>('input[type="date"]');
  return {
    start: (dates[0]?.value ?? "").trim(),
    end: (dates[1]?.value ?? "").trim(),
  };
}

export function isValidDatePair(start: string, end: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) return false;
  return end >= start;
}

export function datesReadyIn(root: Element | null): boolean {
  const { start, end } = readDatePair(root);
  return isValidDatePair(start, end);
}

/** First N date inputs in order must be valid YYYY-MM-DD; consecutive pairs end >= start. */
export function datesReadyCountIn(root: Element | null, count: number): boolean {
  if (!root || count < 1) return false;
  const dates = root.querySelectorAll<HTMLInputElement>('input[type="date"]');
  if (dates.length < count) return false;
  const values: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const v = (dates[i]?.value ?? "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
    values.push(v);
  }
  for (let i = 1; i < values.length; i += 1) {
    if (values[i]! < values[i - 1]!) return false;
  }
  return true;
}

/** At least one period row with a valid start/end date pair. */
export function periodRowsReadyIn(root: Element | null): boolean {
  if (!root) return false;
  const rows = root.querySelectorAll<HTMLElement>("[data-tour-period-row], .periodRow, [class*='periodRow']");
  const candidates = rows.length > 0 ? rows : [root];
  for (const row of candidates) {
    const dates = row.querySelectorAll<HTMLInputElement>('input[type="date"]');
    if (dates.length >= 2) {
      const start = (dates[0]?.value ?? "").trim();
      const end = (dates[1]?.value ?? "").trim();
      if (isValidDatePair(start, end)) return true;
    }
  }
  return datesReadyIn(root);
}

/** Turkish money string → number (binlik nokta, ondalık virgül). */
export function parseTourMoney(value: string): number {
  const n = Number(String(value ?? "").replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n || 0 : 0;
}

export function wageReadyIn(root: Element | null): boolean {
  if (!root) return false;
  const input = root.querySelector<HTMLInputElement>("input:not([readonly])");
  return parseTourMoney(input?.value ?? "") > 0;
}

const TIME_RE = /^\d{2}:\d{2}$/;

/** Valid HH:MM (00–23 / 00–59). Overnight pairs are allowed — no start≤end check. */
export function isValidTimeValue(value: string): boolean {
  if (!TIME_RE.test(value)) return false;
  const [hs, ms] = value.split(":");
  const h = Number(hs);
  const m = Number(ms);
  return Number.isFinite(h) && Number.isFinite(m) && h >= 0 && h <= 23 && m >= 0 && m <= 59;
}

/**
 * First two `input[type=time]` in root must both be complete HH:MM.
 * Does not invent extra validation beyond native time completeness.
 */
export function timesReadyIn(root: Element | null): boolean {
  if (!root) return false;
  const times = root.querySelectorAll<HTMLInputElement>('input[type="time"]');
  if (times.length < 2) return false;
  const a = (times[0]?.value ?? "").trim();
  const b = (times[1]?.value ?? "").trim();
  return isValidTimeValue(a) && isValidTimeValue(b);
}

/**
 * After a trusted edit, wait `delayMs` then re-check readiness (with a short
 * poll) so controlled/native inputs that commit value slightly after the event
 * still advance — without requiring blur.
 */
export function scheduleReadyCheck(options: {
  delayMs: number;
  isReady: () => boolean;
  onReady: () => void;
  isCancelled: () => boolean;
  setTimer: (id: number | null) => void;
  maxPolls?: number;
  pollMs?: number;
}): void {
  const { delayMs, isReady, onReady, isCancelled, setTimer, maxPolls = 6, pollMs = 80 } = options;
  let polls = 0;

  const tick = () => {
    setTimer(null);
    if (isCancelled()) return;
    if (isReady()) {
      onReady();
      return;
    }
    polls += 1;
    if (polls >= maxPolls) return;
    const id = globalThis.setTimeout(tick, pollMs) as unknown as number;
    setTimer(id);
  };

  const id = globalThis.setTimeout(tick, delayMs) as unknown as number;
  setTimer(id);
}
