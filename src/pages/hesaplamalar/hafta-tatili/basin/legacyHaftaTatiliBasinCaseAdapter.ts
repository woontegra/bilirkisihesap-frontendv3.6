/**
 * V3 `hafta_tatili_basin_is` kayıtları → V3.5 BasinForm.
 */
import type { SavedCaseRecord } from "@/api/savedCases";
import { unwrapCalcData } from "../../shared/calcBackendCrud";
import {
  mapLegacyStandardHaftaTatiliCase,
  resolveSavedCaseDisplayName,
} from "../standard/legacyHaftaTatiliCaseAdapter";
import type { BasinForm } from "./model";

export { resolveSavedCaseDisplayName };

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function pickForm(payload: Record<string, unknown>): Record<string, unknown> {
  const data = asRecord(payload.data);
  const nested = asRecord(data?.form);
  const flat = asRecord(payload.form);
  return nested ?? flat ?? payload;
}

export function mapLegacyBasinHaftaTatiliCase(
  data: unknown,
  record?: SavedCaseRecord,
): BasinForm | null {
  const mapped = mapLegacyStandardHaftaTatiliCase(data, record);
  if (!mapped) return null;

  try {
    const payload = unwrapCalcData(data);
    const form = pickForm(payload);
    const geceCalisan = Boolean(form.isGeceCalisan ?? form.geceCalisan ?? false);
    return {
      dateRanges: mapped.dateRanges,
      excludedDays: mapped.excludedDays,
      expiryStart: mapped.expiryStart,
      selectedHolidayIds: mapped.selectedHolidayIds,
      rows: mapped.rows,
      settleAmount: mapped.settleAmount,
      globalCoefficient: mapped.globalCoefficient,
      geceCalisan,
    };
  } catch {
    return {
      dateRanges: mapped.dateRanges,
      excludedDays: mapped.excludedDays,
      expiryStart: mapped.expiryStart,
      selectedHolidayIds: mapped.selectedHolidayIds,
      rows: mapped.rows,
      settleAmount: mapped.settleAmount,
      globalCoefficient: mapped.globalCoefficient,
      geceCalisan: false,
    };
  }
}
