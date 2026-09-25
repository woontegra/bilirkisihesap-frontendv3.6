/** Varsayılan: kapalı. Açmak için VITE_SMART_IMPORT_V2=true */
export const SMART_IMPORT_V2_ENABLED = false;

export function resolveSmartImportFlag(envValue: string | undefined): boolean {
  return envValue === "true" || envValue === "1";
}
