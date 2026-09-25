import type { LoadResult } from "./caseStorage";
import {
  buildIhbarSaveResult,
  resolveIhbarSavedCaseDisplayName,
  type IhbarSavedCase,
} from "./ihbarBackendCase";
import { defaultIhbarSaveGate, type UseIhbarCaseBackendConfig } from "./useIhbarCaseBackend";

type IhbarBackendBundle<TForm> = {
  listCasesFromBackend: () => Promise<IhbarSavedCase<TForm>[]>;
  caseCrud: UseIhbarCaseBackendConfig<TForm, IhbarSavedCase<TForm>>["caseCrud"];
  mapFormFromBackend: UseIhbarCaseBackendConfig<TForm, IhbarSavedCase<TForm>>["mapFormFromBackend"];
};

export function makeIhbarBackendConfig<TForm>(
  opts: {
    backend: IhbarBackendBundle<TForm>;
    createEmptyForm: () => TForm;
    snapshotKey: (form: TForm) => string;
    loadCasesSafe: () => LoadResult<{ id: string; name: string; form: TForm }>;
    deleteCase: (id: string) => void;
    clearCorruptCases: () => void;
  },
): UseIhbarCaseBackendConfig<TForm, IhbarSavedCase<TForm>> {
  return {
    createEmptyForm: opts.createEmptyForm,
    snapshotKey: opts.snapshotKey,
    loadCasesSafe: () => {
      const loaded = opts.loadCasesSafe();
      if (!loaded.ok) return { ok: false, reason: loaded.reason };
      return { ok: true, items: loaded.items as IhbarSavedCase<TForm>[] };
    },
    deleteCaseLocal: opts.deleteCase,
    clearCorruptCases: opts.clearCorruptCases,
    listCasesFromBackend: opts.backend.listCasesFromBackend,
    caseCrud: opts.backend.caseCrud,
    mapFormFromBackend: opts.backend.mapFormFromBackend,
    resolveDisplayName: resolveIhbarSavedCaseDisplayName,
    buildSaveResult: buildIhbarSaveResult,
    getSavePayload: defaultIhbarSaveGate,
  };
}
