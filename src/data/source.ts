import { fetchDashboardFromApi, readIsAdmin } from "@/api/dashboard";
import type { DashboardData, DataSourceMode } from "@/api/types";
import {
  fetchDashboardMock,
  fetchDashboardMockEmpty,
  fetchDashboardMockError,
} from "@/data/mock/dashboardMock";

/**
 * Veri kaynağı anahtarı.
 * - api: doğrulanmış V3 endpointleri (varsayılan)
 * - mock: yalnızca tasarım / offline senaryolar
 *
 * Geçici UI senaryoları (yalnızca mock): ?scenario=empty|error
 */
export function getDataSourceMode(): DataSourceMode {
  const env = (import.meta.env.VITE_DATA_SOURCE as string | undefined)?.toLowerCase();
  if (env === "mock") {
    return "mock";
  }
  return "api";
}

function readScenario(): string | null {
  try {
    return new URLSearchParams(window.location.search).get("scenario");
  } catch {
    return null;
  }
}

export async function loadDashboardData(): Promise<DashboardData & { isAdmin: boolean }> {
  const isAdmin = readIsAdmin();
  const mode = getDataSourceMode();
  const scenario = readScenario();

  if (mode === "api") {
    const data = await fetchDashboardFromApi(isAdmin);
    return { ...data, isAdmin };
  }

  if (scenario === "empty") {
    const data = await fetchDashboardMockEmpty(isAdmin);
    return { ...data, isAdmin };
  }

  if (scenario === "error") {
    const data = await fetchDashboardMockError();
    return { ...data, isAdmin: true };
  }

  const data = await fetchDashboardMock(isAdmin);
  return { ...data, isAdmin };
}

export { readIsAdmin };
