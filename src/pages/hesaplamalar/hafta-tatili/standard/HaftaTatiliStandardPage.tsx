import { useEffect } from "react";
import { HaftaTatiliCalcPage, type HaftaTatiliPageConfig } from "../lib/HaftaTatiliCalcPage";
import {
  applyGlobalCoefficient,
  buildAutoRows,
  calcKatsayi,
  computeStandardHaftaTatili,
} from "./engine";
import { createEmptyForm, NOTE_BLOCKS, snapshotKey, type StandardForm } from "./model";
import { loadCasesSafe, saveCase, deleteCase, clearCorruptCases } from "./storage";
import {
  buildHtStandartSaveResult,
  buildRowOverridesFromRows,
  htStandartCaseCrud,
  listHtStandartCasesFromBackend,
  mapHtStandartFormFromBackend,
} from "./backendCase";
import { resolveSavedCaseDisplayName } from "./legacyHaftaTatiliCaseAdapter";
import { buildStandartHtPreviewSections } from "./buildStandartHtPreviewSections";
import styles from "./HaftaTatiliStandardPage.module.css";

const DOCUMENT_TITLE = "Standart Hafta Tatili Alacağı";

const config: HaftaTatiliPageConfig<StandardForm> = {
  pageTitle: "Standart Hafta Tatili Alacağı",
  pageDescription: "İş Kanunu'na göre hafta tatili ücreti hesabı",
  previewTitle: "Standart Hafta Tatili Rapor",
  notes: NOTE_BLOCKS,
  showSeasonal: true,
  showGeceCalisan: false,
  guidedTourVariant: "standart",
  createEmptyForm,
  snapshotKey,
  compute: computeStandardHaftaTatili,
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
      buildStandartHtPreviewSections({ form, result, daily50Header }),
    listCasesFromBackend: listHtStandartCasesFromBackend,
    caseCrud: htStandartCaseCrud,
    mapFormFromBackend: mapHtStandartFormFromBackend,
    resolveDisplayName: resolveSavedCaseDisplayName,
    buildSaveResult: buildHtStandartSaveResult,
    buildRowOverrides: buildRowOverridesFromRows,
  },
};

export default function HaftaTatiliStandardPage() {
  useEffect(() => {
    document.title = DOCUMENT_TITLE;
  }, []);

  return <HaftaTatiliCalcPage config={config} />;
}
