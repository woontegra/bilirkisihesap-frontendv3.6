import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { moduleKeyFromPath } from "./moduleRegistry";
import { trackUsageEvent } from "./trackUsageEvent";

/** Tracks CALCULATION_PAGE_VIEWED once per session+module for known calc routes. */
export function CalculationPageViewTracker() {
  const location = useLocation();

  useEffect(() => {
    const moduleKey = moduleKeyFromPath(location.pathname);
    if (!moduleKey) return;
    trackUsageEvent({
      eventType: "CALCULATION_PAGE_VIEWED",
      moduleKey,
      route: location.pathname,
      dedupeKey: `page:${moduleKey}`,
    });
  }, [location.pathname]);

  return null;
}
