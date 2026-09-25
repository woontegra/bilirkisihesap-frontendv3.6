import {

  Bell,

  Bookmark,

  CreditCard,

  LogOut,

  Menu,

  MessageSquare,

  Moon,

  PanelLeft,

  Settings,

  Sun,

  Ticket,

  UserRound,

  Users,

  Video,

} from "lucide-react";

import { useCallback, useEffect, useRef, useState } from "react";

import { Link, useNavigate } from "react-router-dom";

import { fetchNotifications, markNotificationsRead } from "@/api/notifications";

import type { NotificationItem } from "@/api/types";

import { logout, getSessionTenantId, readCurrentUser } from "@/auth/session";

import { Button } from "@/components/ui/Button";

import { getDataSourceMode } from "@/data/source";

import { useUserAvatar } from "@/hooks/useUserAvatar";

import { formatUserRoleLabel } from "@/utils/userRole";

import { resolveUserDisplayName } from "@/utils/userDisplay";

import { applyTheme, getStoredTheme, type Theme } from "@/theme/theme";

import AdminHeaderChatActions from "@/components/admin/AdminHeaderChatActions";

import styles from "./Topbar.module.css";



type Props = {

  title: string;

  isDesktop: boolean;

  onOpenMobile: () => void;

  onToggleCollapse: () => void;

  userName?: string;

  userEmail?: string;

  userRole?: string;

  isAdmin?: boolean;

  paidAccessAllowed?: boolean;

};



function isTicketNotification(item: NotificationItem): boolean {

  if (item.type === "ticket") return true;

  const title = (item.title || "").toLocaleLowerCase("tr-TR");

  return (

    title.includes("destek talebi") ||

    title.includes("yanıt verildi") ||

    title.includes("yanit verildi")

  );

}



export function Topbar({

  title,

  isDesktop,

  onOpenMobile,

  onToggleCollapse,

  userName,

  userEmail,

  userRole,

  isAdmin = false,

  paidAccessAllowed = true,

}: Props) {

  const navigate = useNavigate();

  const sessionUser = readCurrentUser();

  const displayName = resolveUserDisplayName(userName?.trim() || sessionUser?.name);

  const displayEmail = (userEmail?.trim() || sessionUser?.email || "").trim();

  const roleLabel = formatUserRoleLabel(userRole?.trim() || sessionUser?.role);

  const tenantId = getSessionTenantId() ?? undefined;

  const showSubUsers = tenantId === 1;



  const [menuOpen, setMenuOpen] = useState(false);

  const [notifOpen, setNotifOpen] = useState(false);

  const [theme, setTheme] = useState<Theme>(() => getStoredTheme());

  const [, setAuthRevision] = useState(0);

  const [notifications, setNotifications] = useState<NotificationItem[]>([]);

  const [notifLoading, setNotifLoading] = useState(false);

  const menuRef = useRef<HTMLDivElement>(null);

  const notifRef = useRef<HTMLDivElement>(null);

  const source = getDataSourceMode();

  const { avatarUrl, handleAvatarError, handleAvatarLoad } = useUserAvatar();

  const avatarInitials = displayName
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const unreadCount = notifications.filter((item) => !item.read).length;



  const loadNotifications = useCallback(async () => {

    if (source !== "api") {

      setNotifications([]);

      return;

    }

    try {

      setNotifLoading(true);

      const data = await fetchNotifications();

      setNotifications(data);

    } catch {

      setNotifications([]);

    } finally {

      setNotifLoading(false);

    }

  }, [source]);



  useEffect(() => {

    void loadNotifications();

    if (source !== "api") return;

    const timer = window.setInterval(() => {

      void loadNotifications();

    }, 30_000);

    return () => window.clearInterval(timer);

  }, [loadNotifications, source]);



  useEffect(() => {

    const onThemeChanged = () => setTheme(getStoredTheme());

    window.addEventListener("theme-changed", onThemeChanged);

    return () => window.removeEventListener("theme-changed", onThemeChanged);

  }, []);



  useEffect(() => {

    const onAuthChanged = () => setAuthRevision((value) => value + 1);

    window.addEventListener("auth-changed", onAuthChanged);

    return () => window.removeEventListener("auth-changed", onAuthChanged);

  }, []);



  useEffect(() => {

    const onDoc = (event: MouseEvent) => {

      const target = event.target as Node;

      if (!menuRef.current?.contains(target)) setMenuOpen(false);

      if (!notifRef.current?.contains(target)) setNotifOpen(false);

    };

    document.addEventListener("mousedown", onDoc);

    return () => document.removeEventListener("mousedown", onDoc);

  }, []);



  useEffect(() => {

    if (!menuOpen && !notifOpen) return;

    const onKey = (event: KeyboardEvent) => {

      if (event.key === "Escape") {

        setMenuOpen(false);

        setNotifOpen(false);

      }

    };

    document.addEventListener("keydown", onKey);

    return () => document.removeEventListener("keydown", onKey);

  }, [menuOpen, notifOpen]);



  async function handleNotificationToggle() {

    const next = !notifOpen;

    setNotifOpen(next);

    setMenuOpen(false);

    if (!next) return;

    await loadNotifications();

    try {

      await markNotificationsRead();

      setNotifications((items) => items.map((item) => ({ ...item, read: true })));

    } catch {

      /* sessiz */

    }

  }



  const closeMenu = () => setMenuOpen(false);



  const toggleTheme = () => {

    applyTheme(theme === "dark" ? "light" : "dark");

  };



  return (

    <header className={styles.topbar}>

      <div className={styles.left}>

        <Button

          variant="ghost"

          size="icon"

          aria-label={isDesktop ? "Kenar çubuğunu daralt/genişlet" : "Menüyü aç"}

          onClick={isDesktop ? onToggleCollapse : onOpenMobile}

        >

          {isDesktop ? <PanelLeft size={18} /> : <Menu size={18} />}

        </Button>



        <a

          href="https://www.youtube.com/@bilirkisihesap"

          target="_blank"

          rel="noopener noreferrer"

          className={styles.trainingLink}

          title="Eğitim Videoları"

        >

          <Video size={15} aria-hidden />

          <span className={styles.hideMd}>Eğitim Videoları</span>

        </a>



        <div className={styles.titleBlock}>

          <h1 className={styles.title}>{title}</h1>

        </div>

      </div>



      <div className={styles.right}>

        <Link to="/profile?tab=tickets" className={styles.ticketLink} title="Destek Talebi Aç">

          <span className={styles.hideSm}>Destek Talebi Aç</span>

          <Ticket size={15} aria-hidden />

          {unreadCount > 0 ? (

            <span className={styles.ticketBadge}>{unreadCount > 9 ? "9+" : unreadCount}</span>

          ) : (

            <span className={styles.ticketBadgeMuted}>0</span>

          )}

        </Link>



        <button

          type="button"

          className={styles.iconBtn}

          aria-label={theme === "dark" ? "Açık moda geç" : "Koyu moda geç"}

          onClick={toggleTheme}

        >

          {theme === "dark" ? (

            <Sun size={18} className={styles.sunIcon} aria-hidden />

          ) : (

            <Moon size={18} className={styles.moonIcon} aria-hidden />

          )}

        </button>



        {isAdmin ? <AdminHeaderChatActions /> : null}



        <div className={styles.notifWrap} ref={notifRef}>

          <button

            type="button"

            className={styles.iconBtn}

            aria-label="Bildirimler"

            aria-expanded={notifOpen}

            onClick={() => void handleNotificationToggle()}

          >

            <Bell size={18} className={styles.bell} />

            {unreadCount > 0 ? (

              <span className={styles.badge}>{unreadCount > 9 ? "9+" : unreadCount}</span>

            ) : null}

          </button>



          {notifOpen ? (

            <div className={styles.notifPanel} role="dialog" aria-label="Bildirimler">

              <div className={styles.notifHead}>Bildirimler</div>

              <div className={styles.notifList}>

                {notifLoading ? (

                  <p className={styles.notifEmpty}>Yükleniyor...</p>

                ) : notifications.length === 0 ? (

                  <p className={styles.notifEmpty}>Henüz bildiriminiz yok</p>

                ) : (

                  notifications.map((item) => {

                    const createdAt = item.createdAt || item.created_at;

                    const ticket = isTicketNotification(item);

                    if (ticket) {

                      return (

                        <Link

                          key={item.id}

                          to="/profile?tab=tickets"

                          className={styles.notifItem}

                          onClick={() => setNotifOpen(false)}

                        >

                          <strong>{item.title}</strong>

                          {createdAt ? (

                            <span>{new Date(createdAt).toLocaleString("tr-TR")}</span>

                          ) : null}

                        </Link>

                      );

                    }

                    return (

                      <div key={item.id} className={styles.notifItemStatic}>

                        <strong>{item.title}</strong>

                        {createdAt ? (

                          <span>{new Date(createdAt).toLocaleString("tr-TR")}</span>

                        ) : null}

                      </div>

                    );

                  })

                )}

              </div>

            </div>

          ) : null}

        </div>



        <div className={styles.userWrap} ref={menuRef}>

          <button

            type="button"

            className={styles.userBtn}

            aria-expanded={menuOpen}

            aria-haspopup="menu"

            onClick={() => {

              setMenuOpen((v) => !v);

              setNotifOpen(false);

            }}

          >

            <span className={styles.avatar}>

              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt=""
                  className={styles.avatarImg}
                  onError={handleAvatarError}
                  onLoad={handleAvatarLoad}
                />
              ) : (
                <span className={styles.avatarInitials}>{avatarInitials}</span>
              )}

            </span>

            <span className={styles.userMeta}>

              <span className={styles.userName}>{displayName}</span>

              {roleLabel ? <span className={styles.userRole}>{roleLabel}</span> : null}

            </span>

          </button>



          {menuOpen ? (

            <div className={styles.menu} role="menu">

              <div className={styles.menuHead}>

                <p className={styles.userName}>{displayName}</p>

                {displayEmail ? <p className={styles.userEmail}>{displayEmail}</p> : null}

              </div>

              <div className={styles.menuList}>

                <Link to="/profile" className={styles.menuItem} role="menuitem" onClick={closeMenu}>

                  <UserRound size={15} aria-hidden />

                  <span>Profilim</span>

                </Link>

                {paidAccessAllowed ? (
                <Link

                  to="/profile?tab=saved"

                  className={styles.menuItem}

                  role="menuitem"

                  onClick={closeMenu}

                >

                  <Bookmark size={15} aria-hidden />

                  <span>Kayıtlı Hesaplamalarım</span>

                </Link>
                ) : null}

                <Link

                  to="/profile?tab=subscription"

                  className={styles.menuItem}

                  role="menuitem"

                  onClick={closeMenu}

                >

                  <CreditCard size={15} aria-hidden />

                  <span>Abonelik Bilgilerim</span>

                </Link>

                <Link

                  to="/profile?tab=tickets"

                  className={styles.menuItem}

                  role="menuitem"

                  onClick={closeMenu}

                >

                  <MessageSquare size={15} aria-hidden />

                  <span>Destek Talepleri</span>

                </Link>

                {showSubUsers ? (

                  <Link

                    to="/profile?tab=subusers"

                    className={styles.menuItem}

                    role="menuitem"

                    onClick={closeMenu}

                  >

                    <Users size={15} aria-hidden />

                    <span>Alt Kullanıcılar</span>

                  </Link>

                ) : null}

                <Link

                  to="/profile?tab=settings"

                  className={styles.menuItem}

                  role="menuitem"

                  onClick={closeMenu}

                >

                  <Settings size={15} aria-hidden />

                  <span>Ayarlar</span>

                </Link>

              </div>

              <div className={styles.menuDivider} />

              <button

                type="button"

                className={`${styles.menuItem} ${styles.menuLogout}`}

                role="menuitem"

                onClick={() => {

                  closeMenu();

                  logout();

                  navigate("/login", { replace: true });

                }}

              >

                <LogOut size={15} aria-hidden />

                <span>Çıkış Yap</span>

              </button>

            </div>

          ) : null}

        </div>

      </div>

    </header>

  );

}

