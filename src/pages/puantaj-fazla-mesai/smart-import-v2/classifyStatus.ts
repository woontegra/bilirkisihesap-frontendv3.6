import { normalizeText } from "../utils";
import type { CanonicalAttendanceStatus } from "./types";

const OFF_SYNONYMS = [
  "off",
  "*off",
  "fazla mesai izni",
  "fm izni",
  "fazla calisma izni",
];

const WEEKLY_REST_SYNONYMS = ["hafta tatili", "*hafta tatili", "ht"];

const LEAVE_SYNONYMS = [
  "yillik izin",
  "rapor",
  "ucretsiz izin",
  "mazeret izni",
  "hastalik izni",
  "izin",
];

function matchesAny(norm: string, list: string[]): boolean {
  return list.some((k) => norm === k || norm.includes(k));
}

function isShiftRangeText(val: string): boolean {
  const raw = (val ?? "").toString().trim();
  if (!raw) return false;
  return /^\*?\d{1,2}[:.,]\d{2}\s*[-/]\s*\d{1,2}[:.,]\d{2}/i.test(raw);
}

export function classifyAttendanceStatus(
  plannedShiftText?: string,
  leaveText?: string,
): CanonicalAttendanceStatus {
  const rawShift = (plannedShiftText ?? "").toString().trim();
  const p = normalizeText(plannedShiftText ?? "");
  const l = normalizeText(leaveText ?? "");
  const combined = `${p} ${l}`.trim();

  if (!combined && !rawShift) return "UNKNOWN";
  if (matchesAny(p, OFF_SYNONYMS) || matchesAny(l, OFF_SYNONYMS)) return "OFF";
  if (matchesAny(p, WEEKLY_REST_SYNONYMS) || matchesAny(l, WEEKLY_REST_SYNONYMS)) return "WEEKLY_REST";
  if (matchesAny(l, LEAVE_SYNONYMS) || matchesAny(p, LEAVE_SYNONYMS)) return "LEAVE";
  if (isShiftRangeText(rawShift) || rawShift.includes(":") || /^\d{1,2}[-/]\d{1,2}/.test(rawShift)) {
    return "WORK";
  }
  return "UNKNOWN";
}
