import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { useDashboard } from "@/hooks/useDashboard";
import { readIsAdmin } from "@/data/source";
import { DESKTOP_MQ, useMediaQuery } from "@/hooks/useMediaQuery";
import { PAGE_TITLES } from "./navConfig";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import ChatWidget from "@/components/chat/ChatWidget";
import { YandexMetricaTracker } from "@/analytics/YandexMetricaTracker";
import { CalculationPageViewTracker } from "@/telemetry/CalculationPageViewTracker";
import { useLicenseAccessOptional } from "@/context/LicenseAccessContext";
import styles from "./AppShell.module.css";

const COLLAPSE_KEY = "v35_sidebarCollapsed";

export function AppShell() {
  const location = useLocation();
  const isDesktop = useMediaQuery(DESKTOP_MQ);
  const isAdmin = readIsAdmin();
  const { userInfo } = useDashboard();
  const license = useLicenseAccessOptional();
  const paidAccessAllowed = license?.isAdmin || license?.allowed !== false;

  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSE_KEY, collapsed ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [collapsed]);

  useEffect(() => {
    if (isDesktop) {
      setMobileOpen(false);
    }
  }, [isDesktop]);

  useEffect(() => {
    if (!mobileOpen) {
      return;
    }
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileOpen]);

  const title =
    PAGE_TITLES[location.pathname] ??
    (location.pathname.startsWith("/admin/users/") && location.pathname.endsWith("/detail")
      ? "Kullanıcı Detayı"
      : location.pathname.startsWith("/admin/users/") && location.pathname.endsWith("/edit")
        ? "Kullanıcı Düzenle"
        : location.pathname.startsWith("/admin")
          ? "Admin Paneli"
          : "Bilirkişi Hesap");

  return (
    <div className={styles.shell} data-collapsed={collapsed && isDesktop ? "true" : "false"} data-restricted={paidAccessAllowed ? "false" : "true"}>
      {paidAccessAllowed ? <CalculationPageViewTracker /> : null}
      <YandexMetricaTracker pageTitle={title} />
      {paidAccessAllowed ? (
      <Sidebar
        collapsed={collapsed}
        mobileOpen={mobileOpen}
        isDesktop={isDesktop}
        isAdmin={isAdmin}
        onToggleCollapse={() => setCollapsed((v) => !v)}
        onCloseMobile={() => setMobileOpen(false)}
      />
      ) : null}

      <div className={styles.mainCol}>
        <Topbar
          title={title}
          isDesktop={isDesktop}
          onOpenMobile={() => setMobileOpen(true)}
          onToggleCollapse={() => setCollapsed((v) => !v)}
          userName={userInfo?.name}
          userEmail={userInfo?.email}
          userRole={userInfo?.role}
          isAdmin={isAdmin}
          paidAccessAllowed={paidAccessAllowed}
        />
        <main className={styles.content}>
          <div className={styles.contentInner}>
            <Outlet />
          </div>
        </main>
      </div>
      <ChatWidget />
    </div>
  );
}
