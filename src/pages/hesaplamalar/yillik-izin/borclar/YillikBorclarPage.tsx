import { Scale } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useToast } from "@/context/ToastContext";
import { YillikPageView } from "../lib/YillikPageView";
import { buildBorclarYillikPreviewSections } from "../lib/buildBorclarYillikPreviewSections";
import { createEmptyUsedRow } from "../lib/core";
import { isDateOrderInvalid } from "../lib/dates";
import { makeYillikBackendConfig } from "../lib/makeYillikBackendConfig";
import { formatMoney } from "../lib/money";
import type { CaseListEntry, UsedLeaveRow } from "../lib/types";
import { useYillikCaseBackend } from "../lib/useYillikCaseBackend";
import { clampYear } from "../standart/engine";
import { yillikBorclarBackend } from "./backendCase";
import { computeYillikBorclarResult } from "./engine";
import { createEmptyForm, snapshotKey } from "./model";
import { NOTE_BLOCKS } from "./notes";
import { clearCorruptCases, deleteCase, loadCasesSafe } from "./storage";

const PAGE_TITLE = "Yıllık Ücretli İzin — Borçlar Kanunu";
const PREVIEW_TITLE = "Borçlar Kanunu Yıllık Ücretli İzin";

const backendConfig = makeYillikBackendConfig({
  backend: yillikBorclarBackend,
  createEmptyForm,
  snapshotKey,
  loadCasesSafe,
  deleteCase,
  clearCorruptCases,
});

export default function YillikBorclarPage() {
  const { error: showError } = useToast();
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

  const result = useMemo(() => computeYillikBorclarResult(form), [form]);
  const dirty = snapshotKey(form) !== baseline;

  const patch = useCallback(<K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  const validateDates = useCallback(
    (start: string, end: string) => {
      if (isDateOrderInvalid(start, end)) {
        setDateError("İşten çıkış tarihi, işe giriş tarihinden önce olamaz.");
        showError("İşten çıkış tarihi, işe giriş tarihinden önce olamaz.");
        return false;
      }
      setDateError(null);
      return true;
    },
    [showError],
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

  const onPersist = useCallback(
    (name: string) => {
      void persist(
        name,
        form,
        snapshotKey(form),
        {
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
        },
        setBaseline,
        activeId,
      );
    },
    [activeId, form, persist, result],
  );

  const handleSaveClick = useCallback(() => {
    saveFromBackend(
      {
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
        startDate: form.startDate,
        endDate: form.endDate,
      },
      form,
      snapshotKey(form),
      setBaseline,
    );
  }, [form, result, saveFromBackend]);

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
    () => buildBorclarYillikPreviewSections({ form, result }),
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
      guidedTourVariant="borclar"
      icon={Scale}
      pageTitle={PAGE_TITLE}
      pageDescription="Borçlar Kanunu kapsamında yıllık ücretli izin alacağı — yılda 2 hafta (18-/50+: 3 hafta)."
      previewTitle={PREVIEW_TITLE}
      previewContentId="yillik-borclar-preview-content"
      notes={NOTE_BLOCKS}
      startDate={form.startDate}
      endDate={form.endDate}
      workPeriodLabel={result.workPeriodLabel}
      onStartDateChange={(v) => {
        patch("startDate", clampYear(v));
        validateDates(clampYear(v), form.endDate);
      }}
      onEndDateChange={(v) => {
        patch("endDate", clampYear(v));
        validateDates(form.startDate, clampYear(v));
      }}
      onDateBlur={() => validateDates(form.startDate, form.endDate)}
      dateError={dateError}
      brut={form.brut}
      onBrutChange={(v) => patch("brut", v)}
      asgariUcretHatasi={result.asgariUcretHatasi}
      show18Or50
      label18Or50="18 yaş altı / 50 yaş üstü (3 hafta)"
      is18Or50={form.is18Or50}
      on18Or50Change={(v) => patch("is18Or50", v)}
      usedRows={form.usedRows}
      {...usedRowHandlers}
      usedLeaveSetsModuleId="yillik-izin-borclar-used-leave"
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
