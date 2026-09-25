import { useEffect, useMemo, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import ProfileHeader from "./ProfileHeader";
import {
  getVisibleProfileTabs,
  isValidProfileTab,
  type ProfileTabKey,
} from "./profileTabs";
import ProfileInfoTab from "./tabs/ProfileInfoTab";
import SavedCalculationsTab from "./tabs/SavedCalculationsTab";
import SettingsTab from "./tabs/SettingsTab";
import SubscriptionTab from "./tabs/SubscriptionTab";
import SubUsersTab from "./tabs/SubUsersTab";
import TicketsTab from "./tabs/TicketsTab";
import styles from "./ProfilePage.module.css";

export default function ProfilePage() {
  const location = useLocation();
  const navigate = useNavigate();
  const params = new URLSearchParams(location.search);
  const tenantId = Number(localStorage.getItem("tenant_id") || "1");

  const menuItems = useMemo(() => getVisibleProfileTabs(tenantId), [tenantId]);

  const urlTab = params.get("tab");
  const [activeTab, setActiveTab] = useState<ProfileTabKey>(() =>
    isValidProfileTab(urlTab, tenantId) ? urlTab : "info",
  );

  useEffect(() => {
    if (location.pathname === "/profile/saved-calculations") {
      setActiveTab("saved");
      navigate("/profile?tab=saved", { replace: true });
      return;
    }
    const tab = params.get("tab");
    if (tab && !isValidProfileTab(tab, tenantId)) {
      navigate("/profile?tab=info", { replace: true });
      setActiveTab("info");
    } else if (tab && isValidProfileTab(tab, tenantId)) {
      setActiveTab(tab);
    } else if (!tab) {
      setActiveTab("info");
    }
  }, [location.pathname, location.search, navigate, tenantId]);

  if (location.pathname === "/profile/saved-calculations") {
    return <Navigate to="/profile?tab=saved" replace />;
  }

  const handleTabChange = (tab: ProfileTabKey) => {
    setActiveTab(tab);
    navigate(`/profile?tab=${tab}`, { replace: true });
  };

  const renderContent = () => {
    switch (activeTab) {
      case "info":
        return <ProfileInfoTab />;
      case "saved":
        return <SavedCalculationsTab />;
      case "subscription":
        return <SubscriptionTab />;
      case "tickets":
        return <TicketsTab />;
      case "subusers":
        return <SubUsersTab />;
      case "settings":
        return <SettingsTab />;
      default:
        return <ProfileInfoTab />;
    }
  };

  return (
    <div className={styles.page}>
      <ProfileHeader />
      <div className={styles.tabsWrap}>
        <div className={styles.tabs} role="tablist" aria-label="Profil sekmeleri">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.key;
            return (
              <button
                key={item.key}
                type="button"
                role="tab"
                aria-selected={isActive}
                className={isActive ? styles.tabActive : styles.tab}
                onClick={() => handleTabChange(item.key)}
              >
                <Icon size={15} aria-hidden />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div className={styles.content} key={activeTab} role="tabpanel">
        {renderContent()}
      </div>
    </div>
  );
}
