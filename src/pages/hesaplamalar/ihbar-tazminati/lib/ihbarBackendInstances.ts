/**
 * İhbar Tazminatı — varyant backend CRUD örnekleri (tek kaynak).
 */

import { normalizeForm as normalize30, normalizeResults as normalizeResults30 } from "../is-kanunu/model";
import { STORAGE_KEY as IHBAR_30_STORAGE_KEY } from "../is-kanunu/storage";
import { normalizeForm as normalizeBasin, normalizeResults as normalizeResultsBasin } from "../basin/model";
import { STORAGE_KEY as IHBAR_BASIN_STORAGE_KEY } from "../basin/storage";
import { normalizeForm as normalizeBelirli, normalizeResults as normalizeResultsBelirli } from "../belirli/model";
import { STORAGE_KEY as IHBAR_BELIRLI_STORAGE_KEY } from "../belirli/storage";
import { normalizeForm as normalizeBorclar, normalizeResults as normalizeResultsBorclar } from "../borclar/model";
import { STORAGE_KEY as IHBAR_BORCLAR_STORAGE_KEY } from "../borclar/storage";
import { normalizeForm as normalizeGemi, normalizeResults as normalizeResultsGemi } from "../gemi/model";
import { STORAGE_KEY as IHBAR_GEMI_STORAGE_KEY } from "../gemi/storage";
import { normalizeForm as normalizeKismi, normalizeResults as normalizeResultsKismi } from "../kismi/model";
import { STORAGE_KEY as IHBAR_KISMI_STORAGE_KEY } from "../kismi/storage";
import { normalizeForm as normalizeMevsim, normalizeResults as normalizeResultsMevsim } from "../mevsim/model";
import { STORAGE_KEY as IHBAR_MEVSIM_STORAGE_KEY } from "../mevsim/storage";
import {
  createIhbarVariantBackendCase,
  IHBAR_30ISCI_TYPE,
  IHBAR_BASIN_TYPE,
  IHBAR_BELIRLI_TYPE,
  IHBAR_BORCLAR_TYPE,
  IHBAR_GEMI_TYPE,
  IHBAR_KISMI_TYPE,
  IHBAR_MEVSIM_TYPE,
} from "./ihbarBackendCase";

function str(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value);
}

export const ihbar30Backend = createIhbarVariantBackendCase({
  recordType: IHBAR_30ISCI_TYPE,
  normalizeForm: normalize30,
  normalizeResults: normalizeResults30,
  localStorageKey: IHBAR_30_STORAGE_KEY,
});

export const ihbarKismiBackend = createIhbarVariantBackendCase({
  recordType: IHBAR_KISMI_TYPE,
  normalizeForm: normalizeKismi,
  normalizeResults: normalizeResultsKismi,
  localStorageKey: IHBAR_KISMI_STORAGE_KEY,
});

export const ihbarMevsimBackend = createIhbarVariantBackendCase({
  recordType: IHBAR_MEVSIM_TYPE,
  normalizeForm: normalizeMevsim,
  normalizeResults: normalizeResultsMevsim,
  localStorageKey: IHBAR_MEVSIM_STORAGE_KEY,
});

export const ihbarGemiBackend = createIhbarVariantBackendCase({
  recordType: IHBAR_GEMI_TYPE,
  normalizeForm: normalizeGemi,
  normalizeResults: normalizeResultsGemi,
  localStorageKey: IHBAR_GEMI_STORAGE_KEY,
});

export const ihbarBasinBackend = createIhbarVariantBackendCase({
  recordType: IHBAR_BASIN_TYPE,
  normalizeForm: normalizeBasin,
  normalizeResults: normalizeResultsBasin,
  localStorageKey: IHBAR_BASIN_STORAGE_KEY,
  mapExtraFormFields: (form) => ({
    meslegeBaslangic: str(form.meslegeBaslangic),
  }),
  extendV3Form: (form) => ({
    ...form,
    brutUcret: form.brut,
    iseGiris: form.startDate,
    istenCikis: form.endDate,
    exitDate: form.endDate,
    meslegeBaslangic: form.meslegeBaslangic,
  }),
});

export const ihbarBelirliBackend = createIhbarVariantBackendCase({
  recordType: IHBAR_BELIRLI_TYPE,
  normalizeForm: normalizeBelirli,
  normalizeResults: normalizeResultsBelirli,
  localStorageKey: IHBAR_BELIRLI_STORAGE_KEY,
});

export const ihbarBorclarBackend = createIhbarVariantBackendCase({
  recordType: IHBAR_BORCLAR_TYPE,
  normalizeForm: normalizeBorclar,
  normalizeResults: normalizeResultsBorclar,
  localStorageKey: IHBAR_BORCLAR_STORAGE_KEY,
});
