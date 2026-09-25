import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useLicenseAccess } from "@/context/LicenseAccessContext";
import { isLicenseFreePath, SUBSCRIPTION_EXPIRED_PATH } from "@/license/access";

export function SubscriptionGate() {
  const location = useLocation();
  const { hydrated, allowed, isAdmin } = useLicenseAccess();

  if (!hydrated) return null;
  if (isAdmin || allowed) return <Outlet />;
  if (isLicenseFreePath(location.pathname)) return <Outlet />;
  return <Navigate to={SUBSCRIPTION_EXPIRED_PATH} replace />;
}
