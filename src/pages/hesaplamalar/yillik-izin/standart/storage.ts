import { createCaseStorage } from "../lib/caseStorage";
import { normalizeForm, normalizeResults, type YillikStandartForm } from "./model";
import type { YillikResultSnapshot } from "../lib/types";

export const STORAGE_KEY = "bilirkisi-hesap-v35:yillik-izin-standart:cases:v1";

const api = createCaseStorage<YillikStandartForm, YillikResultSnapshot>(
  STORAGE_KEY,
  normalizeForm,
  normalizeResults,
  "yillikStandart",
);

export const loadCasesSafe = api.loadCasesSafe;
export const saveCase = api.saveCase;
export const deleteCase = api.deleteCase;
export const clearCorruptCases = api.clearCorruptCases;
