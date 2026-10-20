import { ApiError } from "@/api/client";
import type { DashboardData, FinancialSummary, SavedCase, UserInfo } from "./types";
import { apiClient } from "./client";
import { readCurrentUser } from "@/auth/session";
import { fetchAuthMe } from "./profile";

export function readIsAdmin(): boolean {
  const currentUser = readCurrentUser();
  return currentUser?.role === "admin";
}

/** Verified FrontendV3 dashboard endpoints — unchanged contracts. */
export async function fetchDashboardFromApi(isAdmin: boolean): Promise<DashboardData> {
  let savedCases: SavedCase[] = [];
  let connectionError: string | null = null;
  let userInfo: UserInfo | null = null;

  try {
    const me = await fetchAuthMe();
    if (typeof me.id === "number") {
      userInfo = me as UserInfo;
    }
  } catch (err) {
    userInfo = null;
    connectionError =
      err instanceof ApiError && err.status === 401
        ? "Oturum bulunamadı veya geçersiz. Lütfen tekrar giriş yapın."
        : "Kullanıcı bilgileri alınamadı.";
  }

  try {
    const data = await apiClient<SavedCase[]>("/api/saved-cases");
    savedCases = Array.isArray(data) ? data : [];
  } catch (err) {
    savedCases = [];
    if (!connectionError) {
      connectionError =
        err instanceof ApiError && err.status === 401
          ? "Oturum bulunamadı veya geçersiz. Lütfen tekrar giriş yapın."
          : "Kayıtlı hesaplamalar yüklenemedi. API bağlantısını kontrol edin.";
    }
  }

  let financial: FinancialSummary | null = null;
  let financialError: string | null = null;
  if (isAdmin) {
    try {
      financial = await apiClient<FinancialSummary>("/api/admin/financial-summary");
    } catch {
      financialError = "Finansal özet yüklenemedi. Yönetici oturumu ve API bağlantısını kontrol edin.";
    }
  }

  return {
    savedCases,
    userInfo,
    financial,
    financialError,
    connectionError,
  };
}
