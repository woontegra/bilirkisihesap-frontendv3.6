import { Navigate, Outlet } from "react-router-dom";
import { readIsAdmin } from "@/data/source";
import { isAuthenticated } from "@/auth/session";

/**
 * Yalnızca role === admin kullanıcılar admin rotalarına erişebilir.
 */
export function AdminOnly() {
  if (!isAuthenticated()) {
    return <Navigate to="/login" replace />;
  }

  if (!readIsAdmin()) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}
