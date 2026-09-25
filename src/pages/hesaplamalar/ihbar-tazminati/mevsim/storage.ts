/** İhbar Tazminatı — Mevsimlik İşçi. Lokal depo (localStorage), API yok. */

import { createCaseStorage } from "../lib/caseStorage";
import type { IhbarResultSnapshot } from "../lib/types";
import { normalizeForm, normalizeResults, type IhbarMevsimForm } from "./model";

export const STORAGE_KEY = "bilirkisi-hesap-v35:ihbar-mevsim:cases:v1";

const api = createCaseStorage<IhbarMevsimForm, IhbarResultSnapshot>(
  STORAGE_KEY,
  normalizeForm,
  normalizeResults,
  "ihbarmevsim",
);

export const loadCasesSafe = api.loadCasesSafe;
export const saveCase = api.saveCase;
export const deleteCase = api.deleteCase;
export const clearCorruptCases = api.clearCorruptCases;
