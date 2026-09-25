import { createContext } from "react";
import type { DashboardData } from "@/api/types";

export type DashboardContextValue = DashboardData & {
  isAdmin: boolean;
  loading: boolean;
  reload: () => void;
};

export const DashboardContext = createContext<DashboardContextValue | null>(null);
