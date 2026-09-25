import { apiClient } from "@/api/client";
import { isAuthenticated } from "@/auth/session";
import type { UsageEventType } from "./moduleRegistry";

const SESSION_KEY = "bh.usage.sessionId";
const DEDUP_PREFIX = "bh.usage.dedup.";

function uuid(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx`.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }
}

export function getUsageSessionId(): string {
  try {
    let id = sessionStorage.getItem(SESSION_KEY);
    if (!id || id.length < 32) {
      id = uuid();
      sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return uuid();
  }
}

function dedupKey(parts: string[]): string {
  return DEDUP_PREFIX + parts.join(":");
}

function alreadySent(key: string): boolean {
  try {
    return sessionStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function markSent(key: string): void {
  try {
    sessionStorage.setItem(key, "1");
  } catch {
    /* ignore */
  }
}

export type TrackUsageEventInput = {
  eventType: UsageEventType;
  moduleKey?: string | null;
  route?: string | null;
  guideVersion?: number | null;
  /** Optional session-local dedup token (e.g. module for page view) */
  dedupeKey?: string | null;
};

/**
 * Fire-and-forget product usage event. Never throws to callers.
 * Does not send form values, results, IP, or tokens in the body.
 */
export function trackUsageEvent(input: TrackUsageEventInput): void {
  try {
    if (!isAuthenticated()) return;

    if (input.dedupeKey) {
      const key = dedupKey([input.eventType, input.dedupeKey]);
      if (alreadySent(key)) return;
      markSent(key);
    }

    const body: Record<string, string | number> = {
      eventType: input.eventType,
      sessionId: getUsageSessionId(),
      clientEventId: uuid(),
    };
    if (input.moduleKey) body.moduleKey = input.moduleKey;
    if (input.route) {
      const route = String(input.route).split("?")[0].split("#")[0].slice(0, 200);
      if (route) body.route = route;
    }
    if (input.guideVersion != null && Number.isFinite(input.guideVersion)) {
      body.guideVersion = Number(input.guideVersion);
    }

    void apiClient("/api/usage-events", {
      method: "POST",
      body,
    }).catch(() => {
      /* never block product flows */
    });
  } catch {
    /* ignore */
  }
}

export function trackAppEnteredOnce(): void {
  trackUsageEvent({
    eventType: "APP_ENTERED",
    route: "/dashboard",
    dedupeKey: "app-entered",
  });
}
