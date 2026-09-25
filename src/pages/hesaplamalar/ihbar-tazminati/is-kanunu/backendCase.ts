/**
 * V3/backend kayıt → İhbar Tazminatı (30+ işçi). Re-export (lib/ihbarBackendInstances).
 */

export {
  IHBAR_30ISCI_TYPE,
  buildIhbarSaveResult,
  buildIhbarSaveResult as buildIhbar30SaveResult,
  resolveIhbarSavedCaseDisplayName as resolveSavedCaseDisplayName,
} from "../lib/ihbarBackendCase";
export { ihbar30Backend } from "../lib/ihbarBackendInstances";

import { ihbar30Backend } from "../lib/ihbarBackendInstances";

export const ihbar30IsciCaseCrud = ihbar30Backend.caseCrud;
export const mapIhbar30FormFromBackend = ihbar30Backend.mapFormFromBackend;
export const listIhbar30IsciCasesFromBackend = ihbar30Backend.listCasesFromBackend;

export function isIhbar30IsciRecordType(type: string | undefined | null): boolean {
  return type === "ihbar_30isci";
}
