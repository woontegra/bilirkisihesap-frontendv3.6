/**
 * Ücret Alacağı — V3 kayıt payload uyumu.
 */
import type { CalcSaveResult } from "../shared/calcBackendCrud";
import { calcCetvelGrandTotal } from "./engine";
import type { UcretAlacagiForm } from "./model";

export function buildUcretAlacagiSaveData(
  form: UcretAlacagiForm,
  result: CalcSaveResult,
): Record<string, unknown> {
  const totalBrut = Number(result.totalBrut ?? result.brut ?? calcCetvelGrandTotal(form.cetvelRows));
  const totalNet = Number(result.totalNet ?? result.net ?? calcCetvelGrandTotal(form.netCetvelRows));
  const isNetTab = form.activeTab === "net";
  const rowsToSave = isNetTab ? form.netCetvelRows : form.cetvelRows;
  const finalTotal = isNetTab ? totalNet : totalBrut;

  const formPayload: Record<string, unknown> = {
    startDate: form.startDate,
    endDate: form.endDate,
    activeTab: form.activeTab,
    cetvelRows: form.cetvelRows,
    netCetvelRows: form.netCetvelRows,
    globalKatsayi: form.globalKatsayi,
    netGlobalKatsayi: form.netGlobalKatsayi,
  };

  const innerData = {
    form: formPayload,
    results: { total: finalTotal, rows: rowsToSave },
  };

  return {
    data: innerData,
    form: formPayload,
    formValues: formPayload,
    start_date: form.startDate || null,
    end_date: form.endDate || null,
    brut_total: totalBrut,
    net_total: totalNet,
    ise_giris: form.startDate || null,
    isten_cikis: form.endDate || null,
    results: {
      brut: totalBrut,
      net: totalNet,
      total: finalTotal,
      rows: rowsToSave,
      totals: { brut: totalBrut, net: totalNet, totalBrut },
    },
  };
}
