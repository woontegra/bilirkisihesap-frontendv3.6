import { STORAGE_KEY } from "./storage";
/**
 * V3/backend kayıt → Yıllık Ücretli İzin (İş Kanunu standart).
 */

import { createYillikBackendCase, isYillikStandartRecordType, YILLIK_STANDART_TYPE } from "../lib/yillikBackendCase";
import { normalizeForm, normalizeResults } from "./model";

export { YILLIK_STANDART_TYPE };

export const yillikStandartBackend = createYillikBackendCase({
  recordType: YILLIK_STANDART_TYPE,
  isRecordType: isYillikStandartRecordType,
  normalizeForm,
  normalizeResults,
  localStorageKey: STORAGE_KEY,
});

export const yillikStandartCaseCrud = yillikStandartBackend.caseCrud;
export const mapYillikStandartFormFromBackend = yillikStandartBackend.mapFormFromBackend;
export const listYillikStandartCasesFromBackend = yillikStandartBackend.listCasesFromBackend;
