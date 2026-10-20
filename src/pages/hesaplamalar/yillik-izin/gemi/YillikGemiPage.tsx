import { Ship } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { YillikPageView } from "../lib/YillikPageView";
import { buildGemiYillikPreviewSections } from "../lib/buildGemiYillikPreviewSections";
import { createEmptyUsedRow } from "../lib/core";
import { makeYillikBackendConfig } from "../lib/makeYillikBackendConfig";
import { formatMoney } from "../lib/money";
import type { CaseListEntry, GemiWorkPeriod, UsedLeaveRow } from "../lib/types";
import { useYillikCaseBackend } from "../lib/useYillikCaseBackend";
import { WorkPeriodsEditor } from "../lib/WorkPeriodsEditor";
import { gemiYillikSaveGate, yillikGemiBackend } from "./backendCase";
import { clampYear, computeYillikGemiResult } from "./engine";
import { createEmptyForm, snapshotKey } from "./model";
import { NOTE_BLOCKS } from "./notes";
import { clearCorruptCases, deleteCase, loadCasesSafe } from "./storage";

const PAGE_TITLE = "Yıllık Ücretli İzin — Gemi Adamları";
const PREVIEW_TITLE = "Yıllık İzin — Gemi Adamları Raporu";

const backendConfig = makeYillikBackendConfig({
  backend: yillikGemiBackend,
  createEmptyForm,
  snapshotKey,
  loadCasesSafe,
  deleteCase,
  clearCorruptCases,
  getSavePayload: gemiYillikSaveGate,
});

function resolveGemiDates(form: ReturnType<typeof createEmptyForm>) {
  const first = form.workPeriods[0];
  const last = form.workPeriods[form.workPeriods.length - 1];
  return {
    startDate: first?.iseGiris ?? "",
    endDate: last?.istenCikis ?? "",
  };
}

export default function YillikGemiPage() {
  const [form, setForm] = useState(createEmptyForm);
  const [baseline, setBaseline] = useState(() => snapshotKey(createEmptyForm()));
  const [previewOpen, setPreviewOpen] = useState(false);
  const [confirmNew, setConfirmNew] = useState(false);

  const applyLoadedForm = useCallback((loaded: ReturnType<typeof createEmptyForm>) => {
    setForm(loaded);
    setBaseline(snapshotKey(loaded));
  }, []);

  const {
    cases,
    storageError,
    activeId,
    activeName,
    nameOpen,
    setNameOpen,
    listOpen,
    setListOpen,
    confirmDeleteId,
    setConfirmDeleteId,
    caseSaving,
    caseLoading,
    resetActiveCase,
    persist,
    handleSaveClick: saveFromBackend,
    onOpenCase,
    onConfirmDelete,
    clearStorageError,
  } = useYillikCaseBackend(backendConfig, applyLoadedForm);

  const result = useMemo(() => computeYillikGemiResult(form), [form]);
  const dirty = snapshotKey(form) !== baseline;
  const { startDate, endDate } = resolveGemiDates(form);

  const patch = useCallback(<K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  const doNew = useCallback(() => {
    setConfirmNew(false);
    const empty = createEmptyForm();
    setForm(empty);
    resetActiveCase();
    setBaseline(snapshotKey(empty));
  }, [resetActiveCase]);

  const handleNewClick = useCallback(() => {
    if (dirty) setConfirmNew(true);
    else doNew();
  }, [dirty, doNew]);

  const savePayload = useMemo(
    () => ({
      brutIzin: result.brutIzin,
      netIzin: result.netIzin,
      totalEntitlement: result.totalEntitlement,
      remainingDays: result.remainingDays,
      usedTotal: result.usedTotal,
      sgk: result.sgk,
      issizlik: result.issizlik,
      gelirVergisi: result.gelirVergisi,
      damgaVergisi: result.damgaVergisi,
      breakdown: result.breakdown,
      startDate,
      endDate,
    }),
    [endDate, result, startDate],
  );

  const onPersist = useCallback(
    (name: string) => {
      void persist(name, form, snapshotKey(form), savePayload, setBaseline, activeId);
    },
    [activeId, form, persist, savePayload],
  );

  const handleSaveClick = useCallback(() => {
    saveFromBackend(savePayload, form, snapshotKey(form), setBaseline);
  }, [form, saveFromBackend, savePayload]);

  const caseList: CaseListEntry[] = useMemo(
    () =>
      cases.map((c) => ({
        id: c.id,
        name: c.name,
        updatedAt: c.updatedAt,
        subtitle: `${formatMoney(c.results.netIzin)} ₺ net`,
      })),
    [cases],
  );

  const previewSections = useMemo(
    () => buildGemiYillikPreviewSections({ form, result }),
    [form, result],
  );

  const usedRowHandlers = {
    onAddUsedRow: () => setForm((prev) => ({ ...prev, usedRows: [...prev.usedRows, createEmptyUsedRow()] })),
    onUpdateUsedRow: (id: string, patchRow: Partial<UsedLeaveRow>) =>
      setForm((prev) => ({
        ...prev,
        usedRows: prev.usedRows.map((r) => (r.id === id ? { ...r, ...patchRow } : r)),
      })),
    onRemoveUsedRow: (id: string) =>
      setForm((prev) => ({ ...prev, usedRows: prev.usedRows.filter((r) => r.id !== id) })),
    onReplaceUsedRows: (rows: UsedLeaveRow[]) => setForm((prev) => ({ ...prev, usedRows: rows })),
  };

  return (
    <YillikPageView
      guidedTourVariant="gemi"
      icon={Ship}
      pageTitle={PAGE_TITLE}
      pageDescription="Deniz İş Kanunu — 30/360 gün kuralı ile gemi adamı yıllık izin alacağı."
      previewTitle={PREVIEW_TITLE}
      previewContentId="yillik-gemi-preview-content"
      notes={NOTE_BLOCKS}
      startDate={startDate}
      endDate={endDate}
      workPeriodLabel={result.workDaysLabel}
      onStartDateChange={() => {}}
      onEndDateChange={() => {}}
      onDateBlur={() => {}}
      dateError={result.error || null}
      brut={form.brut}
      onBrutChange={(v) => patch("brut", v)}
      asgariUcretHatasi={result.asgariUcretHatasi}
      usedRows={form.usedRows}
      {...usedRowHandlers}
      usedLeaveSetsModuleId="yillik-izin-gemi-used-leave"
      workPeriodsSlot={
        <WorkPeriodsEditor
          title="Çalışma dönemleri (30/360)"
          periods={form.workPeriods}
          onChange={(next) => patch("workPeriods", next as GemiWorkPeriod[])}
          clampYear={clampYear}
          showDayOverride
        />
      }
      entitlementLines={result.entitlementLines}
      totalEntitlementLabel="Toplam hak"
      usedTotal={result.usedTotal}
      remainingDays={result.remainingDays}
      formulaText={result.formulaText}
      brutIzin={result.brutIzin}
      sgk={result.sgk}
      issizlik={result.issizlik}
      gelirVergisi={result.gelirVergisi}
      gelirVergisiDilimleri={result.gelirVergisiDilimleri}
      damgaVergisi={result.damgaVergisi}
      netIzin={result.netIzin}
      employerPayment={form.employerPayment}
      onEmployerPaymentChange={(v) => patch("employerPayment", v)}
      dirty={dirty}
      activeName={activeName}
      isUpdate={!!(activeId && activeName)}
      caseSaving={caseSaving}
      caseLoading={caseLoading}
      storageError={storageError}
      onClearStorageError={clearStorageError}
      cases={caseList}
      nameOpen={nameOpen}
      setNameOpen={setNameOpen}
      listOpen={listOpen}
      setListOpen={setListOpen}
      previewOpen={previewOpen}
      setPreviewOpen={setPreviewOpen}
      confirmNew={confirmNew}
      setConfirmNew={setConfirmNew}
      confirmDeleteId={confirmDeleteId}
      setConfirmDeleteId={setConfirmDeleteId}
      onNewClick={handleNewClick}
      onConfirmNew={doNew}
      onSaveClick={handleSaveClick}
      onPersist={onPersist}
      onOpenCase={(id) => onOpenCase(id, setForm, setBaseline)}
      onConfirmDelete={onConfirmDelete}
      previewSections={previewSections}
    />
  );
}
