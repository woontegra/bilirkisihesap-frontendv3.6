/** İhbar Tazminatı — Belirli Süreli İş Sözleşmesi. Lokal depo (localStorage), API yok. */

import { createCaseStorage } from "../lib/caseStorage";
import type { IhbarResultSnapshot } from "../lib/types";
import { normalizeForm, normalizeResults, type IhbarBelirliForm } from "./model";

export const STORAGE_KEY = "bilirkisi-hesap-v35:ihbar-belirli:cases:v1";

const api = createCaseStorage<IhbarBelirliForm, IhbarResultSnapshot>(
  STORAGE_KEY,
  normalizeForm,
  normalizeResults,
  "ihbarbelirli",
);

export const loadCasesSafe = api.loadCasesSafe;
export const saveCase = api.saveCase;
export const deleteCase = api.deleteCase;
export const clearCorruptCases = api.clearCorruptCases;
