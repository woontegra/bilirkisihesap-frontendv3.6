/** İhbar Tazminatı — Borçlar Kanunu. Lokal depo (localStorage), API yok. */

import { createCaseStorage } from "../lib/caseStorage";
import type { IhbarResultSnapshot } from "../lib/types";
import { normalizeForm, normalizeResults, type IhbarBorclarForm } from "./model";

export const STORAGE_KEY = "bilirkisi-hesap-v35:ihbar-borclar:cases:v1";

const api = createCaseStorage<IhbarBorclarForm, IhbarResultSnapshot>(
  STORAGE_KEY,
  normalizeForm,
  normalizeResults,
  "ihbarborclar",
);

export const loadCasesSafe = api.loadCasesSafe;
export const saveCase = api.saveCase;
export const deleteCase = api.deleteCase;
export const clearCorruptCases = api.clearCorruptCases;
