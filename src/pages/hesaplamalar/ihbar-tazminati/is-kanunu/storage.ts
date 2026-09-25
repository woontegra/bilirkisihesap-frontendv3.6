/**
 * İhbar Tazminatı — İş Kanununa Göre. Lokal depo (localStorage), API yok.
 */

import { createCaseStorage } from "../lib/caseStorage";
import { normalizeForm, normalizeResults, type Ihbar30IsciForm } from "./model";
import type { IhbarResultSnapshot } from "../lib/types";

export const STORAGE_KEY = "bilirkisi-hesap-v35:ihbar-30isci:cases:v1";

const api = createCaseStorage<Ihbar30IsciForm, IhbarResultSnapshot>(
  STORAGE_KEY,
  normalizeForm,
  normalizeResults,
  "ihbar30isci",
);

export const loadCasesSafe = api.loadCasesSafe;
export const saveCase = api.saveCase;
export const deleteCase = api.deleteCase;
export const clearCorruptCases = api.clearCorruptCases;
