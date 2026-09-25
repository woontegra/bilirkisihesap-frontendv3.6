import { createCaseStorage } from "../lib/caseStorage";
import { normalizeForm, normalizeResults, type YillikBelirliForm } from "./model";
import type { YillikResultSnapshot } from "../lib/types";
export const STORAGE_KEY = "bilirkisi-hesap-v35:yillik-izin-belirli:cases:v1";
const api = createCaseStorage<YillikBelirliForm, YillikResultSnapshot>(STORAGE_KEY, normalizeForm, normalizeResults, "yillikBelirli");
export const loadCasesSafe = api.loadCasesSafe;
export const saveCase = api.saveCase;
export const deleteCase = api.deleteCase;
export const clearCorruptCases = api.clearCorruptCases;
