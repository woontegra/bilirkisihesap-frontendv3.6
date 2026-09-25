import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { DashboardData } from "@/api/types";
import { loadDashboardData } from "@/data/source";
import { DashboardContext } from "./dashboardContextValue";

export function DashboardProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<DashboardData & { isAdmin: boolean }>({
    savedCases: [],
    userInfo: null,
    financial: null,
    financialError: null,
    connectionError: null,
    isAdmin: false,
  });
  const [tick, setTick] = useState(0);

  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    void (async () => {
      try {
        const result = await loadDashboardData();
        if (!cancelled) {
          setData(result);
        }
      } catch {
        if (!cancelled) {
          setData({
            savedCases: [],
            userInfo: null,
            financial: null,
            financialError: null,
            connectionError: "Beklenmeyen bir hata oluştu.",
            isAdmin: false,
          });
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [tick]);

  const value = useMemo(
    () => ({ ...data, loading, reload }),
    [data, loading, reload],
  );

  return <DashboardContext.Provider value={value}>{children}</DashboardContext.Provider>;
}
