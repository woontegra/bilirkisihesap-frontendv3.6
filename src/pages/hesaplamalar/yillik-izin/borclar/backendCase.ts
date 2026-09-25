import { STORAGE_KEY } from "./storage";
/**
 * V3/backend kayıt → Yıllık Ücretli İzin (Borçlar Kanunu).
 */

import {
  createYillikBackendCase,
  isYillikBorclarRecordType,
  YILLIK_BORCLAR_TYPE,
} from "../lib/yillikBackendCase";
import { normalizeForm, normalizeResults } from "./model";

export { YILLIK_BORCLAR_TYPE };

export const yillikBorclarBackend = createYillikBackendCase({
  recordType: YILLIK_BORCLAR_TYPE,
  isRecordType: isYillikBorclarRecordType,
  normalizeForm,
  normalizeResults,
  localStorageKey: STORAGE_KEY,
});

export const yillikBorclarCaseCrud = yillikBorclarBackend.caseCrud;
export const mapYillikBorclarFormFromBackend = yillikBorclarBackend.mapFormFromBackend;
export const listYillikBorclarCasesFromBackend = yillikBorclarBackend.listCasesFromBackend;
