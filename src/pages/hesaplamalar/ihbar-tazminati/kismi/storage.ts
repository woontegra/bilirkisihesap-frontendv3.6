/** İhbar Tazminatı — Kısmi Süreli İş Sözleşmesi. Lokal depo (localStorage), API yok. */

import { createCaseStorage } from "../lib/caseStorage";
import type { IhbarResultSnapshot } from "../lib/types";
import { normalizeForm, normalizeResults, type IhbarKismiForm } from "./model";

export const STORAGE_KEY = "bilirkisi-hesap-v35:ihbar-kismi:cases:v1";

const api = createCaseStorage<IhbarKismiForm, IhbarResultSnapshot>(
  STORAGE_KEY,
  normalizeForm,
  normalizeResults,
  "ihbarkismi",
);

export const loadCasesSafe = api.loadCasesSafe;
export const saveCase = api.saveCase;
export const deleteCase = api.deleteCase;
export const clearCorruptCases = api.clearCorruptCases;
