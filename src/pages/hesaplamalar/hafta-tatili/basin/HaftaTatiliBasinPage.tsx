import { useEffect } from "react";
import { HaftaTatiliCalcPage, type HaftaTatiliPageConfig } from "../lib/HaftaTatiliCalcPage";
import {
  applyGlobalCoefficient,
  buildAutoRows,
  calcKatsayi,
  computeBasinHaftaTatili,
} from "./engine";
import { createEmptyForm, NOTE_BLOCKS, snapshotKey, type BasinForm, weekDayMultiplier } from "./model";
import { loadCasesSafe, saveCase, deleteCase, clearCorruptCases } from "./storage";
import {
  buildHtBasinSaveResult,
  buildRowOverridesFromRows,
  htBasinCaseCrud,
  listHtBasinCasesFromBackend,
  mapHtBasinFormFromBackend,
} from "./backendCase";
import { resolveSavedCaseDisplayName } from "./legacyHaftaTatiliBasinCaseAdapter";
import { buildBasinHtPreviewSections } from "./buildBasinHtPreviewSections";
import styles from "../standard/HaftaTatiliStandardPage.module.css";

const DOCUMENT_TITLE = "Basın İş Hafta Tatili Alacağı";

const config: HaftaTatiliPageConfig<BasinForm> = {
  pageTitle: "Basın İş Hafta Tatili Alacağı",
  pageDescription: "5953 Sayılı Basın İş Kanunu'na göre hafta tatili ücreti hesabı",
  previewTitle: "Basın İş Hafta Tatili Rapor",
  notes: NOTE_BLOCKS,
  showSeasonal: false,
  showGeceCalisan: true,
  guidedTourVariant: "basin-is",
  createEmptyForm,
  snapshotKey,
  compute: computeBasinHaftaTatili,
  buildAutoRows,
  applyCoefficient: (form, k) => ({
    ...form,
    globalCoefficient: k,
    rows: applyGlobalCoefficient(
      form.rows.length ? form.rows : buildAutoRows(form),
      k,
      weekDayMultiplier(form),
    ),
  }),
  calcKatsayi,
  storage: { loadCasesSafe, saveCase, deleteCase, clearCorruptCases },
  styles,
  backend: {
    documentTitle: DOCUMENT_TITLE,
    useExpiryBox: true,
    buildPreviewSections: ({ form, result, daily50Header }) =>
      buildBasinHtPreviewSections({ form, result, daily50Header }),
    listCasesFromBackend: listHtBasinCasesFromBackend,
    caseCrud: htBasinCaseCrud,
    mapFormFromBackend: mapHtBasinFormFromBackend,
    resolveDisplayName: resolveSavedCaseDisplayName,
    buildSaveResult: buildHtBasinSaveResult,
    buildRowOverrides: buildRowOverridesFromRows,
  },
};

export default function HaftaTatiliBasinPage() {
  useEffect(() => {
    document.title = DOCUMENT_TITLE;
  }, []);

  return <HaftaTatiliCalcPage config={config} />;
}
