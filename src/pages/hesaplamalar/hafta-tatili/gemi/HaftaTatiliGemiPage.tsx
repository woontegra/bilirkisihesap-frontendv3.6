import { useEffect } from "react";
import { HaftaTatiliCalcPage, type HaftaTatiliPageConfig } from "../lib/HaftaTatiliCalcPage";
import {
  applyGlobalCoefficient,
  buildAutoRows,
  calcKatsayi,
  computeGemiHaftaTatili,
} from "./engine";
import { createEmptyForm, NOTE_BLOCKS, snapshotKey, type GemiForm } from "./model";
import { loadCasesSafe, saveCase, deleteCase, clearCorruptCases } from "./storage";
import {
  buildHtGemiSaveResult,
  buildRowOverridesFromRows,
  htGemiCaseCrud,
  listHtGemiCasesFromBackend,
  mapHtGemiFormFromBackend,
} from "./backendCase";
import { resolveSavedCaseDisplayName } from "./legacyHaftaTatiliGemiCaseAdapter";
import { buildGemiHtPreviewSections } from "./buildGemiHtPreviewSections";
import styles from "../standard/HaftaTatiliStandardPage.module.css";

const DOCUMENT_TITLE = "Gemi Adamı Hafta Tatili Alacağı";

const config: HaftaTatiliPageConfig<GemiForm> = {
  pageTitle: "Gemi Adamı Hafta Tatili Alacağı",
  pageDescription: "854 Sayılı Deniz İş Kanunu'na göre hafta tatili ücreti hesabı",
  previewTitle: "Gemi Adamı Hafta Tatili Rapor",
  notes: NOTE_BLOCKS,
  showSeasonal: false,
  showGeceCalisan: false,
  guidedTourVariant: "gemi-adami",
  createEmptyForm,
  snapshotKey,
  compute: computeGemiHaftaTatili,
  buildAutoRows,
  applyCoefficient: (form, k) => ({
    ...form,
    globalCoefficient: k,
    rows: applyGlobalCoefficient(form.rows.length ? form.rows : buildAutoRows(form), k),
  }),
  calcKatsayi,
  storage: { loadCasesSafe, saveCase, deleteCase, clearCorruptCases },
  styles,
  backend: {
    documentTitle: DOCUMENT_TITLE,
    useExpiryBox: true,
    buildPreviewSections: ({ form, result, daily50Header }) =>
      buildGemiHtPreviewSections({ form, result, daily50Header }),
    listCasesFromBackend: listHtGemiCasesFromBackend,
    caseCrud: htGemiCaseCrud,
    mapFormFromBackend: mapHtGemiFormFromBackend,
    resolveDisplayName: resolveSavedCaseDisplayName,
    buildSaveResult: buildHtGemiSaveResult,
    buildRowOverrides: buildRowOverridesFromRows,
  },
};

export default function HaftaTatiliGemiPage() {
  useEffect(() => {
    document.title = DOCUMENT_TITLE;
  }, []);

  return <HaftaTatiliCalcPage config={config} />;
}
