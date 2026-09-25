/**
 * Yıllık Ücretli İzin — standart varyant sayfaları için ortak hook.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import type { PreviewSection } from "@/components/calculation-preview";
import { useToast } from "@/context/ToastContext";
import { buildStandardYillikPreviewSections } from "./buildStandardYillikPreviewSections";
import { newLocalId } from "./caseStorage";
import { createEmptyUsedRow } from "./core";
import { isDateOrderInvalid } from "./dates";
import { formatMoney } from "./money";
import type { CaseListEntry, StandardComputeResult, StandardYillikFormBase, UsedLeaveRow, YillikResultSnapshot } from "./types";

export type { StandardYillikForm, StandardYillikFormBase, StandardComputeResult } from "./types";

type StorageApi<Form> = {
  loadCasesSafe: () => { ok: boolean; items: { id: string; name: string; updatedAt: string; form: Form; results: YillikResultSnapshot }[]; reason?: string };
  saveCase: (name: string, form: Form, results: YillikResultSnapshot, existingId?: string | null) => { id: string; name: string } | null;
  deleteCase: (id: string) => void;
  clearCorruptCases: () => void;
};

export function useStandardYillikPage<Form extends StandardYillikFormBase>(opts: {
  createEmptyForm: () => Form;
  snapshotKey: (form: Form) => string;
  compute: (form: Form) => StandardComputeResult;
  storage: StorageApi<Form>;
  previewTitle: string;
  pageTitle: string;
}) {
  const { success, error: showError } = useToast();
  const [form, setForm] = useState<Form>(opts.createEmptyForm);
  const [dateError, setDateError] = useState<string | null>(null);
  const [cases, setCases] = useState<{ id: string; name: string; updatedAt: string; form: Form; results: YillikResultSnapshot }[]>([]);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeName, setActiveName] = useState<string | null>(null);
  const [baseline, setBaseline] = useState(() => opts.snapshotKey(opts.createEmptyForm()));
  const [nameOpen, setNameOpen] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [confirmNew, setConfirmNew] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const result = useMemo(() => opts.compute(form), [form, opts]);
  const dirty = opts.snapshotKey(form) !== baseline;

  const reloadCases = useCallback(() => {
    const loaded = opts.storage.loadCasesSafe();
    if (!loaded.ok) {
      setStorageError(loaded.reason || "Depo hatası");
      setCases([]);
      return;
    }
    setStorageError(null);
    setCases(loaded.items);
  }, [opts.storage]);

  useEffect(() => {
    reloadCases();
  }, [reloadCases]);

  const patch = useCallback(<K extends keyof Form>(key: K, value: Form[K]) => {
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
    const empty = opts.createEmptyForm();
    setForm(empty);
    setActiveId(null);
    setActiveName(null);
    setBaseline(opts.snapshotKey(empty));
    setDateError(null);
  }, [opts]);

  const handleNewClick = useCallback(() => {
    if (dirty) setConfirmNew(true);
    else doNew();
  }, [dirty, doNew]);

  const toSnapshot = useCallback(
    (): YillikResultSnapshot => ({
      totalEntitlement: result.totalEntitlement,
      remainingDays: result.remainingDays,
      brutIzin: result.brutIzin,
      sgk: result.sgk,
      issizlik: result.issizlik,
      gelirVergisi: result.gelirVergisi,
      damgaVergisi: result.damgaVergisi,
      netIzin: result.netIzin,
    }),
    [result],
  );

  const persist = useCallback(
    (name: string) => {
      if (!(parseFloat(String(form.brut).replace(/\./g, "").replace(",", ".")) > 0) && result.totalEntitlement <= 0) {
        showError("Geçerli tarih ve brüt ücret giriniz");
        return;
      }
      const existingId = activeId && !activeId.startsWith("cloud:") ? activeId : null;
      const saved = opts.storage.saveCase(name, form, toSnapshot(), existingId);
      if (!saved) {
        showError("Kayıt yapılamadı");
        return;
      }
      setActiveId(saved.id);
      setActiveName(saved.name);
      setBaseline(opts.snapshotKey(form));
      reloadCases();
      success(existingId ? "Kayıt güncellendi" : "Kayıt kaydedildi");
      setNameOpen(false);
    },
    [activeId, form, opts, reloadCases, result.totalEntitlement, showError, success, toSnapshot],
  );

  const handleSaveClick = useCallback(() => {
    if (activeId && activeName) persist(activeName);
    else setNameOpen(true);
  }, [activeId, activeName, persist]);

  const onOpenCase = useCallback(
    (id: string) => {
      const c = cases.find((x) => x.id === id);
      if (!c) return;
      setForm(c.form);
      setActiveId(c.id);
      setActiveName(c.name);
      setBaseline(opts.snapshotKey(c.form));
      setDateError(null);
      setListOpen(false);
      success(`Kayıt açıldı: ${c.name}`);
    },
    [cases, opts, success],
  );

  const onConfirmDelete = useCallback(() => {
    if (!confirmDeleteId) return;
    opts.storage.deleteCase(confirmDeleteId);
    if (activeId === confirmDeleteId) {
      setActiveId(null);
      setActiveName(null);
    }
    setConfirmDeleteId(null);
    reloadCases();
    success("Kayıt silindi");
  }, [activeId, confirmDeleteId, opts.storage, reloadCases, success]);

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

  const previewSections: PreviewSection[] = useMemo(
    () =>
      buildStandardYillikPreviewSections({ form, result }),
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

  return {
    form,
    setForm,
    patch,
    result,
    dirty,
    dateError,
    validateDates,
    storageError,
    setStorageError: () => {
      opts.storage.clearCorruptCases();
      setStorageError(null);
      reloadCases();
    },
    activeId,
    activeName,
    nameOpen,
    setNameOpen,
    listOpen,
    setListOpen,
    previewOpen,
    setPreviewOpen,
    confirmNew,
    setConfirmNew,
    confirmDeleteId,
    setConfirmDeleteId,
    handleNewClick,
    doNew,
    handleSaveClick,
    persist,
    onOpenCase,
    onConfirmDelete,
    caseList,
    previewSections,
    usedRowHandlers,
    isUpdate: !!(activeId && activeName),
  };
}

export { newLocalId };
