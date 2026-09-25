import type { LoadResult } from "./caseStorage";
import {
  buildYillikStandartSaveResult,
  resolveYillikSavedCaseDisplayName,
  type YillikSavedCase,
} from "./yillikBackendCase";
import {
  defaultYillikSaveGate,
  type UseYillikCaseBackendConfig,
} from "./useYillikCaseBackend";

type YillikBackendBundle<TForm> = {
  listCasesFromBackend: () => Promise<YillikSavedCase<TForm>[]>;
  caseCrud: UseYillikCaseBackendConfig<TForm, YillikSavedCase<TForm>>["caseCrud"];
  mapFormFromBackend: UseYillikCaseBackendConfig<TForm, YillikSavedCase<TForm>>["mapFormFromBackend"];
};

export function makeYillikBackendConfig<TForm>(
  opts: {
    backend: YillikBackendBundle<TForm>;
    createEmptyForm: () => TForm;
    snapshotKey: (form: TForm) => string;
    loadCasesSafe: () => LoadResult<{ id: string; name: string; form: TForm }>;
    deleteCase: (id: string) => void;
    clearCorruptCases: () => void;
    getSavePayload?: UseYillikCaseBackendConfig<TForm, YillikSavedCase<TForm>>["getSavePayload"];
  },
): UseYillikCaseBackendConfig<TForm, YillikSavedCase<TForm>> {
  return {
    createEmptyForm: opts.createEmptyForm,
    snapshotKey: opts.snapshotKey,
    loadCasesSafe: () => {
      const loaded = opts.loadCasesSafe();
      if (!loaded.ok) return { ok: false, reason: loaded.reason };
      return { ok: true, items: loaded.items as YillikSavedCase<TForm>[] };
    },
    deleteCaseLocal: opts.deleteCase,
    clearCorruptCases: opts.clearCorruptCases,
    listCasesFromBackend: opts.backend.listCasesFromBackend,
    caseCrud: opts.backend.caseCrud,
    mapFormFromBackend: opts.backend.mapFormFromBackend,
    resolveDisplayName: resolveYillikSavedCaseDisplayName,
    buildSaveResult: buildYillikStandartSaveResult,
    getSavePayload: opts.getSavePayload ?? defaultYillikSaveGate,
  };
}
