import { createCaseStorage } from "../lib/caseStorage";
import { normalizeForm, normalizeResults, type YillikBorclarForm } from "./model";
import type { YillikResultSnapshot } from "../lib/types";

export const STORAGE_KEY = "bilirkisi-hesap-v35:yillik-izin-borclar:cases:v1";
const api = createCaseStorage<YillikBorclarForm, YillikResultSnapshot>(STORAGE_KEY, normalizeForm, normalizeResults, "yillikBorclar");
export const loadCasesSafe = api.loadCasesSafe;
export const saveCase = api.saveCase;
export const deleteCase = api.deleteCase;
export const clearCorruptCases = api.clearCorruptCases;
