/** İhbar Tazminatı — Basın İş Kanunu. Lokal depo (localStorage), API yok. */

import { createCaseStorage } from "../lib/caseStorage";
import type { IhbarResultSnapshot } from "../lib/types";
import { normalizeForm, normalizeResults, type IhbarBasinForm } from "./model";

export const STORAGE_KEY = "bilirkisi-hesap-v35:ihbar-basin:cases:v1";

const api = createCaseStorage<IhbarBasinForm, IhbarResultSnapshot>(
  STORAGE_KEY,
  normalizeForm,
  normalizeResults,
  "ihbarbasin",
);

export const loadCasesSafe = api.loadCasesSafe;
export const saveCase = api.saveCase;
export const deleteCase = api.deleteCase;
export const clearCorruptCases = api.clearCorruptCases;
