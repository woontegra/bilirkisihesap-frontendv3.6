import { resolveSmartImportFlag, SMART_IMPORT_V2_ENABLED } from "./featureFlagCore";

export { SMART_IMPORT_V2_ENABLED, resolveSmartImportFlag };

/**
 * Akıllı İçe Aktarma V2 özellik bayrağı (tarayıcı).
 * Production'da yalnızca VITE_SMART_IMPORT_V2=true ile açılır.
 */
export function isSmartImportV2Enabled(): boolean {
  return resolveSmartImportFlag(import.meta.env.VITE_SMART_IMPORT_V2);
}
