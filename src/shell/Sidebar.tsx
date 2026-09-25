import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { NavLink } from "react-router-dom";
import { useCalculationTools } from "@/context/CalculationToolsContext";
import { usePanelBranding } from "@/context/PanelBrandingContext";
import { PANEL_FALLBACK_FAVICON_URL, PANEL_FALLBACK_LOGO_URL } from "@/types/panelBranding";
import { NAV_GROUPS } from "./navConfig";
import styles from "./Sidebar.module.css";

type Props = {
  collapsed: boolean;
  mobileOpen: boolean;
  isDesktop: boolean;
  isAdmin: boolean;
  onToggleCollapse: () => void;
  onCloseMobile: () => void;
};

export function Sidebar({
  collapsed,
  mobileOpen,
  isDesktop,
  isAdmin,
  onToggleCollapse,
  onCloseMobile,
}: Props) {
  const narrow = isDesktop && collapsed;
  const tools = useCalculationTools();
  const { branding, panelLogoSrc, faviconSrc, ready } = usePanelBranding();
  const collapsedLogoSrc = faviconSrc || panelLogoSrc;
  const useFaviconMark = narrow && Boolean(faviconSrc);
  const primaryLogoSrc =
    (narrow ? collapsedLogoSrc : panelLogoSrc) || PANEL_FALLBACK_LOGO_URL;
  const [logoAttempt, setLogoAttempt] = useState(0);

  useEffect(() => {
    setLogoAttempt(0);
  }, [primaryLogoSrc]);

  const sidebarLogoSrc = useMemo(() => {
    if (logoAttempt === 0) return primaryLogoSrc;
    if (logoAttempt === 1) {
      return narrow && useFaviconMark ? PANEL_FALLBACK_FAVICON_URL : PANEL_FALLBACK_LOGO_URL;
    }
    return PANEL_FALLBACK_LOGO_URL;
  }, [logoAttempt, narrow, primaryLogoSrc, useFaviconMark]);

  const handleSidebarLogoError = () => {
    setLogoAttempt((attempt) => Math.min(attempt + 1, 2));
  };
  const panelLogoStyle = narrow
    ? undefined
    : {
        maxHeight: branding.panelLogoMaxHeight,
        maxWidth: branding.panelLogoMaxWidth,
        height: branding.panelLogoMaxHeight,
      };

  const runToolAction = (action: NonNullable<(typeof NAV_GROUPS)[number]["items"][number]["action"]>) => {
    if (action === "add-note") tools.addNote();
    if (action === "add-tag") tools.openTagModal();
    if (action === "open-interest") tools.openInterestCalculator();
    if (!isDesktop) onCloseMobile();
  };

  return (
    <>
      {!isDesktop && mobileOpen ? (
        <button
          type="button"
          className={styles.backdrop}
          aria-label="Menüyü kapat"
          onClick={onCloseMobile}
        />
      ) : null}

      <aside
        className={clsx(
          styles.sidebar,
          narrow && styles.collapsed,
          !isDesktop && styles.drawer,
          !isDesktop && mobileOpen && styles.drawerOpen,
        )}
        aria-label="Ana menü"
      >
        <div className={styles.brandRow}>
          {ready ? (
            <img
              src={sidebarLogoSrc}
              alt="Bilirkişi Hesaplama Araçları Hizmetleri"
              className={clsx(
                styles.brandLogo,
                narrow && styles.brandLogoCollapsed,
                narrow && !useFaviconMark && styles.brandLogoCrop,
              )}
              style={panelLogoStyle}
              onError={handleSidebarLogoError}
            />
          ) : (
            <div
              className={clsx(styles.brandLogo, styles.brandLogoPending, narrow && styles.brandLogoCollapsed)}
              aria-hidden
            />
          )}
          {!isDesktop ? (
            <button type="button" className={styles.iconBtn} onClick={onCloseMobile} aria-label="Kapat">
              <X size={18} />
            </button>
          ) : (
            <button
              type="button"
              className={clsx(styles.iconBtn, styles.collapseBtn)}
              onClick={onToggleCollapse}
              aria-label={collapsed ? "Kenar çubuğunu genişlet" : "Kenar çubuğunu daralt"}
            >
              {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
            </button>
          )}
        </div>

        <nav className={styles.nav}>
          {NAV_GROUPS.map((group) => {
            if (group.adminOnly && !isAdmin) {
              return null;
            }
            return (
              <div key={group.id} className={styles.group}>
                {group.label && !narrow ? <p className={styles.groupLabel}>{group.label}</p> : null}
                <ul className={styles.list}>
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    if (item.disabled) {
                      return (
                        <li key={item.id}>
                          <span
                            className={clsx(styles.link, styles.disabled)}
                            title={narrow ? item.label : "Yakında"}
                          >
                            <span className={styles.linkIconWrap} aria-hidden>
                              <Icon size={16} strokeWidth={1.65} className={styles.linkIcon} />
                            </span>
                            {!narrow ? (
                              <>
                                <span className={styles.linkLabel}>{item.label}</span>
                                {item.badge ? <span className={styles.badge}>{item.badge}</span> : null}
                              </>
                            ) : null}
                          </span>
                        </li>
                      );
                    }
                    if (item.action) {
                      return (
                        <li key={item.id}>
                          <button
                            type="button"
                            className={styles.link}
                            title={narrow ? item.label : undefined}
                            onClick={() => runToolAction(item.action!)}
                          >
                            <span className={styles.linkIconWrap} aria-hidden>
                              <Icon size={16} strokeWidth={1.65} className={styles.linkIcon} />
                            </span>
                            {!narrow ? <span className={styles.linkLabel}>{item.label}</span> : null}
                          </button>
                        </li>
                      );
                    }
                    return (
                      <li key={item.id}>
                        <NavLink
                          to={item.path!}
                          className={({ isActive }) =>
                            clsx(styles.link, isActive && styles.active)
                          }
                          title={narrow ? item.label : undefined}
                          onClick={() => {
                            if (!isDesktop) {
                              onCloseMobile();
                            }
                          }}
                        >
                          <span className={styles.linkIconWrap} aria-hidden>
                            <Icon size={16} strokeWidth={1.65} className={styles.linkIcon} />
                          </span>
                          {!narrow ? (
                            <>
                              <span className={styles.linkLabel}>{item.label}</span>
                              {item.badge ? <span className={styles.badge}>{item.badge}</span> : null}
                            </>
                          ) : null}
                        </NavLink>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </nav>

        <div className={styles.footer}>
          {!narrow ? (
            <>
              <p className={styles.footerTitle}>Bilirkişi Hesap</p>
              <p className={styles.footerSub}>Sürüm 3.5</p>
            </>
          ) : (
            <p className={styles.footerCollapsed} title="Bilirkişi Hesap – Sürüm 3.5">
              3.5
            </p>
          )}
        </div>
      </aside>
    </>
  );
}
