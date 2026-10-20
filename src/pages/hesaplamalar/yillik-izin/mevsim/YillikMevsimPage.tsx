import { Sun } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { YillikPageView } from "../lib/YillikPageView";
import { buildMevsimYillikPreviewSections } from "../lib/buildMevsimYillikPreviewSections";
import { createEmptyUsedRow } from "../lib/core";
import { isDateOrderInvalid } from "../lib/dates";
import { makeYillikBackendConfig } from "../lib/makeYillikBackendConfig";
import { withSyncedSpan, type SimpleWorkPeriod } from "../lib/multiPeriodModel";
import { formatMoney } from "../lib/money";
import type { CaseListEntry, UsedLeaveRow } from "../lib/types";
import { useYillikCaseBackend } from "../lib/useYillikCaseBackend";
import { WorkPeriodsEditor } from "../lib/WorkPeriodsEditor";
import { mevsimYillikSaveGate, yillikMevsimBackend } from "./backendCase";
import { clampYear, computeYillikMevsimResult } from "./engine";
import { createEmptyForm, snapshotKey } from "./model";
import { NOTE_BLOCKS } from "./notes";
import { clearCorruptCases, deleteCase, loadCasesSafe } from "./storage";

const PAGE_TITLE = "Yıllık Ücretli İzin — Mevsimlik İşçi";
const PREVIEW_TITLE = "Yıllık İzin — Mevsimlik Raporu";

const backendConfig = makeYillikBackendConfig({
  backend: yillikMevsimBackend,
  createEmptyForm,
  snapshotKey,
  loadCasesSafe,
  deleteCase,
  clearCorruptCases,
  getSavePayload: mevsimYillikSaveGate,
});

export default function YillikMevsimPage() {
  const [form, setForm] = useState(createEmptyForm);
  const [dateError, setDateError] = useState<string | null>(null);
  const [baseline, setBaseline] = useState(() => snapshotKey(createEmptyForm()));
  const [previewOpen, setPreviewOpen] = useState(false);
  const [confirmNew, setConfirmNew] = useState(false);

  const applyLoadedForm = useCallback((loaded: ReturnType<typeof createEmptyForm>) => {
    setForm(loaded);
    setBaseline(snapshotKey(loaded));
    setDateError(null);
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

  const syncedForm = useMemo(() => withSyncedSpan(form), [form]);
  const result = useMemo(() => computeYillikMevsimResult(syncedForm), [syncedForm]);
  const dirty = snapshotKey(form) !== baseline;

  const patch = useCallback(<K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  const validateDates = useCallback((start: string, end: string) => {
    if (isDateOrderInvalid(start, end)) {
      setDateError("İşten çıkış tarihi, işe giriş tarihinden önce olamaz.");
      return false;
    }
    setDateError(null);
    return true;
  }, []);

  const setPeriods = useCallback(
    (periods: SimpleWorkPeriod[]) => {
      setForm((prev) => {
        const next = withSyncedSpan({ ...prev, workPeriods: periods });
        validateDates(next.startDate, next.endDate);
        return next;
      });
    },
    [validateDates],
  );

  const doNew = useCallback(() => {
    setConfirmNew(false);
    const empty = createEmptyForm();
    setForm(empty);
    resetActiveCase();
    setBaseline(snapshotKey(empty));
    setDateError(null);
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
      startDate: syncedForm.startDate,
      endDate: syncedForm.endDate,
    }),
    [result, syncedForm.endDate, syncedForm.startDate],
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
    () => buildMevsimYillikPreviewSections({ form: syncedForm, result }),
    [syncedForm, result],
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
      guidedTourVariant="mevsim"
      icon={Sun}
      pageTitle={PAGE_TITLE}
      pageDescription="Mevsimlik iş ilişkisinde fiili kıdeme göre yıllık izin alacağı."
      previewTitle={PREVIEW_TITLE}
      previewContentId="yillik-mevsim-preview-content"
      notes={NOTE_BLOCKS}
      startDate={syncedForm.startDate}
      endDate={syncedForm.endDate}
      workPeriodLabel={result.workPeriodLabel}
      onStartDateChange={() => {}}
      onEndDateChange={() => {}}
      onDateBlur={() => validateDates(syncedForm.startDate, syncedForm.endDate)}
      dateError={dateError}
      workPeriodsSlot={
        <WorkPeriodsEditor
          title="Çalışma dönemleri (sezonlar)"
          periods={form.workPeriods}
          onChange={(next) => setPeriods(next as SimpleWorkPeriod[])}
          clampYear={clampYear}
          onDateBlur={() => validateDates(syncedForm.startDate, syncedForm.endDate)}
        />
      }
      brut={form.brut}
      onBrutChange={(v) => patch("brut", v)}
      asgariUcretHatasi={result.asgariUcretHatasi}
      show18Or50
      is18Or50={form.is18Or50}
      on18Or50Change={(v) => patch("is18Or50", v)}
      showUnderground
      isUnderground={form.isUnderground}
      onUndergroundChange={(v) => patch("isUnderground", v)}
      usedRows={form.usedRows}
      {...usedRowHandlers}
      usedLeaveSetsModuleId="yillik-izin-mevsim-used-leave"
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
      employerPayment={form.employerPayment ?? ""}
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
      onOpenCase={(id) => onOpenCase(id, setForm, setBaseline, () => setDateError(null))}
      onConfirmDelete={onConfirmDelete}
      previewSections={previewSections}
    />
  );
}
