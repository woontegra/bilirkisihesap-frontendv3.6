import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { isPlatformAdmin } from "@/auth/session";
import {
  captureYandexDomAction,
  isYandexMetricaActive,
  isTrackedPath,
  shouldStartYandexTracker,
  trackYandexGoal,
  trackYandexPageView,
} from "./yandexMetrica";

type Props = {
  pageTitle: string;
};

/**
 * Giriş yapmış normal kullanıcının hesaplama kabuğunda Yandex Metrica.
 * Login AppShell dışındadır; yalnızca JWT role === admin platform yöneticisi
 * ve /login /profile /admin gibi kapalı rotalar izlenmez.
 */
export function YandexMetricaTracker({ pageTitle }: Props) {
  const { pathname } = useLocation();
  const [authTick, setAuthTick] = useState(0);

  useEffect(() => {
    const onAuth = () => setAuthTick((n) => n + 1);
    window.addEventListener("auth-changed", onAuth);
    return () => window.removeEventListener("auth-changed", onAuth);
  }, []);

  useEffect(() => {
    const enabled = isYandexMetricaActive();
    const admin = isPlatformAdmin();
    if (
      !shouldStartYandexTracker({
        enabled,
        isPlatformAdmin: admin,
        pathname,
      })
    ) {
      return;
    }
    const title =
      pageTitle.trim() ||
      (typeof document !== "undefined" ? document.title : "");
    trackYandexPageView(pathname, title);
  }, [pathname, pageTitle, authTick]);

  useEffect(() => {
    if (!isYandexMetricaActive() || isPlatformAdmin()) return;

    const currentPath = () => window.location.pathname;
    let lastErrorAt = 0;

    const reportFrontendError = (filename?: string) => {
      if (filename && /mc\.yandex|metrika\/tag\.js/i.test(filename)) return;
      const now = Date.now();
      if (now - lastErrorAt < 4000) return;
      lastErrorAt = now;
      const path = currentPath();
      if (!isTrackedPath(path)) return;
      trackYandexGoal("frontend_error", path);
    };

    const onClick = (event: MouseEvent) => {
      captureYandexDomAction(event.target, currentPath());
    };

    const onSubmit = (event: Event) => {
      const submitter = "submitter" in event ? (event as SubmitEvent).submitter : null;
      captureYandexDomAction(submitter ?? event.target, currentPath());
    };

    const onError = (event: ErrorEvent) => {
      reportFrontendError(event.filename);
    };

    const onRejection = () => {
      reportFrontendError();
    };

    document.addEventListener("click", onClick, true);
    document.addEventListener("submit", onSubmit, true);
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);

    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("submit", onSubmit, true);
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, [authTick]);

  return null;
}
