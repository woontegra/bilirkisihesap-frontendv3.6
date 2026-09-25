/**
 * V3 `hafta_tatili_gemi_adami` kayıtları → V3.5 GemiForm.
 */
import type { SavedCaseRecord } from "@/api/savedCases";
import {
  mapLegacyStandardHaftaTatiliCase,
  resolveSavedCaseDisplayName,
} from "../standard/legacyHaftaTatiliCaseAdapter";
import type { GemiForm } from "./model";

export { resolveSavedCaseDisplayName };

export function mapLegacyGemiHaftaTatiliCase(
  data: unknown,
  record?: SavedCaseRecord,
): GemiForm | null {
  const mapped = mapLegacyStandardHaftaTatiliCase(data, record);
  if (!mapped) return null;
  return {
    dateRanges: mapped.dateRanges,
    excludedDays: mapped.excludedDays,
    expiryStart: mapped.expiryStart,
    selectedHolidayIds: mapped.selectedHolidayIds,
    rows: mapped.rows,
    settleAmount: mapped.settleAmount,
    globalCoefficient: mapped.globalCoefficient,
  };
}
