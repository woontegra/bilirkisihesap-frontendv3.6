import { createCaseStorage } from "../lib/caseStorage";
import { normalizeForm, normalizeResults, type YillikKismiForm } from "./model";
import type { YillikResultSnapshot } from "../lib/types";
export const STORAGE_KEY = "bilirkisi-hesap-v35:yillik-izin-kismi:cases:v1";
const api = createCaseStorage<YillikKismiForm, YillikResultSnapshot>(STORAGE_KEY, normalizeForm, normalizeResults, "yillikKismi");
export const loadCasesSafe = api.loadCasesSafe;
export const saveCase = api.saveCase;
export const deleteCase = api.deleteCase;
export const clearCorruptCases = api.clearCorruptCases;
