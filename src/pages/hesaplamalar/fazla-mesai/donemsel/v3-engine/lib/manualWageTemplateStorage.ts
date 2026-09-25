/**
 * İsimlendirilmiş manuel brüt ücret şablonları (asgari ücret dönemlerine göre).
 */

import { asgariUcretler, type AsgariUcret } from "./fazlaMesaiShared";

export const MANUAL_WAGE_TEMPLATE_STORAGE_KEY = "aktuerya:manual-wage-template:v3" as const;

export const MANUAL_WAGE_YEAR_MIN = 2010;
export const MANUAL_WAGE_YEAR_MAX = 2026;

export type ManualWagePeriodsMap = Record<string, number>;

export interface ManualWageTemplateEntry {
  id: string;
  name: string;
  periods: ManualWagePeriodsMap;
}

interface TemplatesPayload {
  version: 3;
  templates: ManualWageTemplateEntry[];
}

export type ManualWageCatalogPeriod = {
  key: string;
  year: number;
  indexInYear: number;
  start: string;
  end: string;
  floorBrut: number;
};

function newTemplateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `mw-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function getAsgariPeriodsForCalendarYear(year: number): AsgariUcret[] {
  return asgariUcretler
    .filter((u) => Number(String(u.start).slice(0, 4)) === year)
    .sort((a, b) => String(a.start).localeCompare(String(b.start)));
}

export function periodStorageKey(u: { start: string; end: string }): string {
  return `${String(u.start).slice(0, 10)}_${String(u.end).slice(0, 10)}`;
}

export function getManualWagePeriodCatalogByYear(): { year: number; periods: ManualWageCatalogPeriod[] }[] {
  const rows: { year: number; periods: ManualWageCatalogPeriod[] }[] = [];
  for (let year = MANUAL_WAGE_YEAR_MIN; year <= MANUAL_WAGE_YEAR_MAX; year += 1) {
    const raw = getAsgariPeriodsForCalendarYear(year);
    const periods: ManualWageCatalogPeriod[] = raw.map((u, i) => ({
      key: periodStorageKey(u),
      year,
      indexInYear: i + 1,
      start: String(u.start).slice(0, 10),
      end: String(u.end).slice(0, 10),
      floorBrut: u.brut,
    }));
    rows.push({ year, periods });
  }
  return rows;
}

export function findAsgariPeriodForStartISO(isoDate: string): AsgariUcret | null {
  const d = String(isoDate).trim().slice(0, 10);
  if (d.length < 10) {
    return null;
  }
  const found = asgariUcretler.find((u) => {
    const s = String(u.start).slice(0, 10);
    const e = String(u.end).slice(0, 10);
    return d >= s && d <= e;
  });
  return found ?? null;
}

function readPayload(): TemplatesPayload {
  if (typeof window === "undefined") {
    return { version: 3, templates: [] };
  }
  try {
    const raw = localStorage.getItem(MANUAL_WAGE_TEMPLATE_STORAGE_KEY);
    if (!raw) {
      return { version: 3, templates: [] };
    }
    const parsed = JSON.parse(raw) as TemplatesPayload;
    if (parsed?.version !== 3 || !Array.isArray(parsed.templates)) {
      return { version: 3, templates: [] };
    }
    return {
      version: 3,
      templates: parsed.templates.filter(
        (t) => t && typeof t.id === "string" && typeof t.name === "string" && t.periods && typeof t.periods === "object",
      ),
    };
  } catch {
    return { version: 3, templates: [] };
  }
}

function writePayload(payload: TemplatesPayload): void {
  if (typeof window === "undefined") {
    return;
  }
  localStorage.setItem(MANUAL_WAGE_TEMPLATE_STORAGE_KEY, JSON.stringify(payload));
}

export function loadAllManualWageTemplates(): ManualWageTemplateEntry[] {
  return readPayload().templates;
}

export function getManualWageTemplateById(id: string): ManualWageTemplateEntry | undefined {
  return loadAllManualWageTemplates().find((t) => t.id === id);
}

function normalizeTemplateName(s: string): string {
  return String(s).trim().toLowerCase();
}

export function findManualWageTemplateByNameCaseInsensitive(name: string): ManualWageTemplateEntry | undefined {
  const n = normalizeTemplateName(name);
  if (!n) {
    return undefined;
  }
  return loadAllManualWageTemplates().find((t) => normalizeTemplateName(t.name) === n);
}

export function countFilledPeriods(periods: ManualWagePeriodsMap): number {
  return Object.values(periods).filter((v) => typeof v === "number" && Number.isFinite(v) && v > 0).length;
}

export function addManualWageTemplate(name: string, periods: ManualWagePeriodsMap): ManualWageTemplateEntry | null {
  const trimmed = name.trim();
  if (!trimmed) {
    return null;
  }
  if (findManualWageTemplateByNameCaseInsensitive(trimmed)) {
    return null;
  }
  const cleaned: ManualWagePeriodsMap = {};
  for (const [k, v] of Object.entries(periods)) {
    if (typeof v === "number" && Number.isFinite(v) && v > 0) {
      cleaned[k] = v;
    }
  }
  if (Object.keys(cleaned).length === 0) {
    return null;
  }
  if (findManualWagePeriodFloorViolations(cleaned).length > 0) {
    return null;
  }

  const payload = readPayload();
  const entry: ManualWageTemplateEntry = { id: newTemplateId(), name: trimmed, periods: cleaned };
  payload.templates.push(entry);
  writePayload(payload);
  return entry;
}

export function updateManualWageTemplate(id: string, name: string, periods: ManualWagePeriodsMap): boolean {
  const trimmed = name.trim();
  if (!trimmed) {
    return false;
  }
  const cleaned: ManualWagePeriodsMap = {};
  for (const [k, v] of Object.entries(periods)) {
    if (typeof v === "number" && Number.isFinite(v) && v > 0) {
      cleaned[k] = v;
    }
  }
  if (Object.keys(cleaned).length === 0) {
    return false;
  }
  if (findManualWagePeriodFloorViolations(cleaned).length > 0) {
    return false;
  }

  const payload = readPayload();
  const idx = payload.templates.findIndex((t) => t.id === id);
  if (idx < 0) {
    return false;
  }
  const dup = payload.templates.find(
    (t, i) => i !== idx && normalizeTemplateName(t.name) === normalizeTemplateName(trimmed),
  );
  if (dup) {
    return false;
  }

  payload.templates[idx] = { ...payload.templates[idx], name: trimmed, periods: cleaned };
  writePayload(payload);
  return true;
}

export function deleteManualWageTemplate(id: string): void {
  const payload = readPayload();
  payload.templates = payload.templates.filter((t) => t.id !== id);
  writePayload(payload);
}

export function isManualWageTemplateNonEmpty(): boolean {
  return loadAllManualWageTemplates().length > 0;
}

export function formatTrDateFromIso(iso: string): string {
  const s = String(iso).slice(0, 10);
  const [y, m, d] = s.split("-");
  if (!d || !m || !y) {
    return s;
  }
  return `${d.padStart(2, "0")}.${m.padStart(2, "0")}.${y}`;
}

export type ManualWageApplyRowStub = { id?: string; startISO?: string };

export function applyManualWagePeriodsToRowBruts(
  periods: ManualWagePeriodsMap,
  rows: ManualWageApplyRowStub[],
): { brutById: Record<string, number>; applied: number; skipped: number } {
  const brutById: Record<string, number> = {};
  let applied = 0;
  let skipped = 0;
  for (const r of rows) {
    const rowId = r.id;
    if (!rowId) {
      skipped += 1;
      continue;
    }
    const start = String(r.startISO ?? "").trim();
    if (start.length < 10) {
      skipped += 1;
      continue;
    }
    const asgariRow = findAsgariPeriodForStartISO(start);
    if (!asgariRow) {
      skipped += 1;
      continue;
    }
    const key = periodStorageKey(asgariRow);
    const wage = periods[key];
    if (wage == null || !(wage > 0)) {
      skipped += 1;
      continue;
    }
    if (wage < asgariRow.brut) {
      skipped += 1;
      continue;
    }
    brutById[rowId] = wage;
    applied += 1;
  }
  return { brutById, applied, skipped };
}

export function formatPeriodRangeLabelFromKey(periodKey: string): string {
  const idx = periodKey.indexOf("_");
  if (idx < 0) {
    return periodKey;
  }
  const s = periodKey.slice(0, idx);
  const e = periodKey.slice(idx + 1);
  return `${formatTrDateFromIso(s)} - ${formatTrDateFromIso(e)}`;
}

export function formatManualWagePeriodLabel(year: number, indexInYear: number, totalInYear: number): string {
  if (totalInYear <= 1) {
    return `${year}`;
  }
  return `${year} ${indexInYear}. dönem`;
}

let manualWagePeriodFloorByKey: Record<string, number> | null = null;

function getManualWagePeriodFloorByKey(): Record<string, number> {
  if (!manualWagePeriodFloorByKey) {
    const next: Record<string, number> = {};
    for (const { periods } of getManualWagePeriodCatalogByYear()) {
      for (const period of periods) {
        next[period.key] = period.floorBrut;
      }
    }
    manualWagePeriodFloorByKey = next;
  }
  return manualWagePeriodFloorByKey;
}

export type ManualWageFloorViolation = {
  key: string;
  amount: number;
  floorBrut: number;
};

export function findManualWagePeriodFloorViolations(periods: ManualWagePeriodsMap): ManualWageFloorViolation[] {
  const floors = getManualWagePeriodFloorByKey();
  const violations: ManualWageFloorViolation[] = [];
  for (const [key, amount] of Object.entries(periods)) {
    if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
      continue;
    }
    const floorBrut = floors[key];
    if (floorBrut == null || amount >= floorBrut) {
      continue;
    }
    violations.push({ key, amount, floorBrut });
  }
  return violations;
}

export function formatManualWageFloorViolationMessage(violation: ManualWageFloorViolation): string {
  const label = formatPeriodRangeLabelFromKey(violation.key);
  const floor = violation.floorBrut.toLocaleString("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${label} için brüt ücret ${floor} TL'den az olamaz.`;
}
