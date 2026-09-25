/** İhbar Tazminatı — Gemi Adamları. Lokal depo (localStorage), API yok. */

import { createCaseStorage } from "../lib/caseStorage";
import type { IhbarResultSnapshot } from "../lib/types";
import { normalizeForm, normalizeResults, type IhbarGemiForm } from "./model";

export const STORAGE_KEY = "bilirkisi-hesap-v35:ihbar-gemi:cases:v1";

const api = createCaseStorage<IhbarGemiForm, IhbarResultSnapshot>(
  STORAGE_KEY,
  normalizeForm,
  normalizeResults,
  "ihbargemi",
);

export const loadCasesSafe = api.loadCasesSafe;
export const saveCase = api.saveCase;
export const deleteCase = api.deleteCase;
export const clearCorruptCases = api.clearCorruptCases;
