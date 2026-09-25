import { minutesToTime, parseTimeToMinutes } from "../utils";

const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30);

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function formatIsoDate(y: number, m: number, d: number): string {
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

function fromJsDate(d: Date): string {
  return formatIsoDate(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

/** Excel serial date (gün) veya kesirli tarih+saat. */
function fromExcelSerial(n: number): { date?: string; time?: string } {
  if (!Number.isFinite(n)) return {};
  const whole = Math.floor(n);
  const frac = n - whole;
  const ms = EXCEL_EPOCH_MS + whole * 86400000;
  const d = new Date(ms);
  const out: { date?: string; time?: string } = { date: fromJsDate(d) };
  if (frac > 0.0001) {
    const mins = Math.round(frac * 1440);
    out.time = minutesToTime(mins);
  }
  return out;
}

export function normalizeSmartDate(raw: unknown): { value: string; valid: boolean } {
  if (raw == null) return { value: "", valid: false };
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    return { value: fromJsDate(raw), valid: true };
  }

  const s = raw.toString().trim();
  if (!s) return { value: "", valid: false };

  const num = Number(s);
  if (Number.isFinite(num) && num > 30000 && num < 60000) {
    const parsed = fromExcelSerial(num);
    return { value: parsed.date ?? s, valid: !!parsed.date };
  }

  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return { value: `${iso[1]}-${iso[2]}-${iso[3]}`, valid: true };

  const dmy = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/);
  if (dmy) {
    const dd = Number(dmy[1]);
    const mm = Number(dmy[2]);
    let yy = Number(dmy[3]);
    if (yy < 100) yy += yy >= 70 ? 1900 : 2000;
    if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
      return { value: formatIsoDate(yy, mm, dd), valid: true };
    }
  }

  return { value: s, valid: false };
}

export function normalizeSmartTime(raw: unknown): { value: string; valid: boolean } {
  if (raw == null) return { value: "", valid: false };
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    return { value: minutesToTime(raw.getHours() * 60 + raw.getMinutes()), valid: true };
  }

  const s = raw.toString().trim();
  if (!s) return { value: "", valid: false };

  const num = Number(s);
  if (Number.isFinite(num) && num >= 0 && num < 1) {
    const mins = Math.round(num * 1440);
    return { value: minutesToTime(mins), valid: true };
  }

  const mins = parseTimeToMinutes(s);
  if (mins != null) {
    const parts = s.match(/^(\d{1,2})[:.,](\d{2})/);
    if (parts && s.includes(":") && s.split(":").length >= 3) {
      return { value: s.match(/^\d{1,2}:\d{2}:\d{2}/)?.[0] ?? minutesToTime(mins), valid: true };
    }
    return { value: minutesToTime(mins), valid: true };
  }

  return { value: s, valid: false };
}

export function parseShiftRange(raw: string): {
  raw: string;
  start?: string;
  end?: string;
  overnight?: boolean;
} {
  const s = (raw ?? "").toString().trim().replace(/^\*+/, "");
  const m = s.match(/^(\d{1,2}[:.,]\d{2})\s*[-/]\s*(\d{1,2}[:.,]\d{2})$/);
  if (!m) return { raw };
  const start = normalizeSmartTime(m[1]);
  const end = normalizeSmartTime(m[2]);
  if (!start.valid || !end.valid) return { raw };
  const sm = parseTimeToMinutes(start.value);
  const em = parseTimeToMinutes(end.value);
  const overnight = sm != null && em != null && em < sm;
  return { raw, start: start.value, end: end.value, overnight };
}
