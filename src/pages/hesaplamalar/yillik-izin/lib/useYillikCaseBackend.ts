/**
 * Yıllık Ücretli İzin — backend kayıt yükleme/kaydetme/silme.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ApiError } from "@/api/client";
import { getSavedCase, type SavedCaseRecord } from "@/api/savedCases";
import { useToast } from "@/context/ToastContext";
import { useCalculationTools } from "@/context/CalculationToolsContext";
import { useCalculationCaseBinding } from "@/hooks/useCalculationCaseBinding";
import type { CalcSaveResult } from "../../shared/calcBackendCrud";
import type { YillikResultSnapshot } from "./types";

type LoadCasesSafe<T> = () =>
  | { ok: true; items: T[] }
  | { ok: false; reason: string; items?: never };

export type UseYillikCaseBackendConfig<TForm, TSaved extends { id: string; name: string; form: TForm }> = {
  createEmptyForm: () => TForm;
  snapshotKey: (form: TForm) => string;
  loadCasesSafe: LoadCasesSafe<TSaved>;
  deleteCaseLocal: (id: string) => void;
  clearCorruptCases: () => void;
  listCasesFromBackend: () => Promise<TSaved[]>;
  caseCrud: {
    saveCase: (
      name: string,
      form: TForm,
      result: CalcSaveResult,
      existingId?: string | null,
    ) => Promise<SavedCaseRecord>;
    removeCase: (id: string | number) => Promise<void>;
  };
  mapFormFromBackend: (
    data: unknown,
    record?: Pick<SavedCaseRecord, "ise_giris" | "isten_cikis">,
  ) => TForm | null;
  resolveDisplayName: (record: SavedCaseRecord) => string;
  buildSaveResult: (result: {
    brutIzin: number;
    netIzin: number;
    totalEntitlement: number;
    remainingDays: number;
    usedTotal: number;
    sgk: number;
    issizlik: number;
    gelirVergisi: number;
    damgaVergisi: number;
    breakdown?: Record<string, unknown>;
  }) => CalcSaveResult;
  getSavePayload: (result: {
    brutIzin: number;
    totalEntitlement: number;
    remainingDays: number;
    startDate: string;
    endDate: string;
  }) => { ok: true } | { ok: false; message: string };
};

export function useYillikCaseBackend<TForm, TSaved extends { id: string; name: string; form: TForm }>(
  config: UseYillikCaseBackendConfig<TForm, TSaved>,
  applyLoadedForm: (form: TForm) => void,
) {
  const { success, error: showError } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const caseIdParam = searchParams.get("caseId");
  const backendLoadedCaseIdRef = useRef<string | null>(null);
  const applyLoadedFormRef = useRef(applyLoadedForm);
  applyLoadedFormRef.current = applyLoadedForm;

  const [cases, setCases] = useState<TSaved[]>([]);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeName, setActiveName] = useState<string | null>(null);
  const { beginNewCalculation } = useCalculationTools();
  useCalculationCaseBinding(activeId);
  const [nameOpen, setNameOpen] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [caseSaving, setCaseSaving] = useState(false);
  const [caseLoading, setCaseLoading] = useState(false);

  const setCaseIdParam = useCallback(
    (id: string) => {
      const next = new URLSearchParams(searchParams);
      next.set("caseId", id);
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  const reloadCases = useCallback(async () => {
    try {
      const items = await config.listCasesFromBackend();
      setStorageError(null);
      setCases(items);
    } catch (error) {
      const message =
        error instanceof ApiError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Kayıtlar yüklenemedi";
      setStorageError(message);
      setCases([]);
    }
  }, [config]);

  useEffect(() => {
    void reloadCases();
  }, [reloadCases]);

  useEffect(() => {
    if (!caseIdParam) {
      backendLoadedCaseIdRef.current = null;
      return;
    }
    if (backendLoadedCaseIdRef.current === caseIdParam) return;
    const numericId = Number(caseIdParam);
    if (!Number.isFinite(numericId) || numericId <= 0) {
      showError("Geçersiz kayıt kimliği");
      return;
    }
    let cancelled = false;
    setCaseLoading(true);
    void getSavedCase(numericId)
      .then((record) => {
        if (cancelled) return;
        const mapped = config.mapFormFromBackend(record.data, record);
        if (!mapped) {
          showError("Kayıt formu okunamadı");
          return;
        }
        return { mapped, record };
      })
      .then((loaded) => {
        if (cancelled || !loaded) return;
        const { mapped, record } = loaded;
        applyLoadedFormRef.current(mapped);
        setActiveId(String(numericId));
        setActiveName(config.resolveDisplayName(record));
        backendLoadedCaseIdRef.current = caseIdParam;
        success(`Kayıt yüklendi: ${config.resolveDisplayName(record)}`);
        const next = new URLSearchParams(searchParams);
        next.delete("caseId");
        setSearchParams(next, { replace: true });
      })
      .catch(() => {
        if (!cancelled) {
          backendLoadedCaseIdRef.current = null;
          showError("Kayıt yüklenemedi");
        }
      })
      .finally(() => {
        if (!cancelled) setCaseLoading(false);
      });
    return () => {
      cancelled = true;
      setCaseLoading(false);
    };
  }, [caseIdParam, config, searchParams, setSearchParams, showError, success]);

  const resetActiveCase = useCallback(() => {
    beginNewCalculation();
    setActiveId(null);
    setActiveName(null);
    backendLoadedCaseIdRef.current = null;
  }, [beginNewCalculation]);

  const persist = useCallback(
    async (
      name: string,
      form: TForm,
      baselineKey: string,
      result: {
        brutIzin: number;
        netIzin: number;
        totalEntitlement: number;
        remainingDays: number;
        usedTotal: number;
        sgk: number;
        issizlik: number;
        gelirVergisi: number;
        damgaVergisi: number;
        breakdown?: Record<string, unknown>;
      },
      setBaseline: (key: string) => void,
      existingId?: string | null,
    ) => {
      const gate = config.getSavePayload({
        brutIzin: result.brutIzin,
        totalEntitlement: result.totalEntitlement,
        remainingDays: result.remainingDays,
        startDate: (form as { startDate?: string }).startDate ?? "",
        endDate: (form as { endDate?: string }).endDate ?? "",
      });
      if (!gate.ok) {
        showError(gate.message);
        return false;
      }
      const wasUpdate = !!(existingId && /^\d+$/.test(existingId));
      setCaseSaving(true);
      try {
        const record = await config.caseCrud.saveCase(
          name,
          form,
          config.buildSaveResult(result),
          existingId,
        );
        const recordId = String(record.id);
        setActiveId(recordId);
        setActiveName(config.resolveDisplayName(record));
        setBaseline(baselineKey);
        setCaseIdParam(recordId);
        backendLoadedCaseIdRef.current = recordId;
        await reloadCases();
        success(wasUpdate ? "Kayıt güncellendi" : "Kayıt kaydedildi");
        setNameOpen(false);
        return true;
      } catch (error) {
        showError(
          error instanceof ApiError
            ? error.message
            : error instanceof Error
              ? error.message
              : "Kayıt yapılamadı",
        );
        return false;
      } finally {
        setCaseSaving(false);
      }
    },
    [config, reloadCases, setCaseIdParam, showError, success],
  );

  const handleSaveClick = useCallback(
    (
      result: {
        brutIzin: number;
        netIzin: number;
        totalEntitlement: number;
        remainingDays: number;
        usedTotal: number;
        sgk: number;
        issizlik: number;
        gelirVergisi: number;
        damgaVergisi: number;
        breakdown?: Record<string, unknown>;
        startDate: string;
        endDate: string;
      },
      form: TForm,
      baselineKey: string,
      setBaseline: (key: string) => void,
    ) => {
      const gate = config.getSavePayload(result);
      if (!gate.ok) {
        showError(gate.message);
        return;
      }
      if (activeId && activeName && /^\d+$/.test(activeId)) {
        void persist(activeName, form, baselineKey, result, setBaseline, activeId);
        return;
      }
      setNameOpen(true);
    },
    [activeId, activeName, config, persist, showError],
  );

  const onOpenCase = useCallback(
    (id: string, setForm: (form: TForm) => void, setBaseline: (key: string) => void, onLoaded?: () => void) => {
      const c = cases.find((x) => x.id === id);
      if (!c) return;
      setForm(c.form);
      setActiveId(c.id);
      setActiveName(c.name);
      setBaseline(config.snapshotKey(c.form));
      setListOpen(false);
      onLoaded?.();
      success(`Kayıt açıldı: ${c.name}`);
    },
    [cases, config, success],
  );

  const onConfirmDelete = useCallback(async () => {
    if (!confirmDeleteId) return;
    try {
      if (/^\d+$/.test(confirmDeleteId)) {
        await config.caseCrud.removeCase(confirmDeleteId);
      } else {
        config.deleteCaseLocal(confirmDeleteId);
      }
      if (activeId === confirmDeleteId) {
        resetActiveCase();
      }
      setConfirmDeleteId(null);
      await reloadCases();
      success("Kayıt silindi");
    } catch (error) {
      showError(
        error instanceof ApiError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Kayıt silinemedi",
      );
    }
  }, [activeId, confirmDeleteId, config, reloadCases, resetActiveCase, showError, success]);

  const clearStorageError = useCallback(() => {
    config.clearCorruptCases();
    setStorageError(null);
    void reloadCases();
  }, [config, reloadCases]);

  return {
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
    reloadCases,
    resetActiveCase,
    persist,
    handleSaveClick,
    onOpenCase,
    onConfirmDelete,
    clearStorageError,
  };
}

export function defaultYillikSaveGate(result: {
  brutIzin: number;
  totalEntitlement: number;
  remainingDays: number;
  startDate: string;
  endDate: string;
}): { ok: true } | { ok: false; message: string } {
  if (!result.startDate || !result.endDate) {
    return { ok: false, message: "Lütfen işe giriş ve çıkış tarihlerini girin" };
  }
  if (result.remainingDays == null || result.remainingDays < 0) {
    return { ok: false, message: "Kalan izin günü hesaplanamadı" };
  }
  if (!(result.brutIzin > 0) && !(result.totalEntitlement > 0)) {
    return { ok: false, message: "Geçerli tarih ve brüt ücret giriniz" };
  }
  return { ok: true };
}

export type { YillikResultSnapshot };
