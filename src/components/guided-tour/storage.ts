import type { GuidedTourPrefs } from "./types";

const PREFIX = "bh.guidedTour";

/** Program genelinde otomatik karşılama yalnızca bir kez. */
export const AUTO_WELCOME_SEEN_KEY = "bh.guidedTour.autoWelcomeSeen.v1";

function storageKey(tourId: string): string {
  return `${PREFIX}.${tourId}`;
}

export function hasSeenAutoWelcome(): boolean {
  try {
    return localStorage.getItem(AUTO_WELCOME_SEEN_KEY) === "true";
  } catch {
    return false;
  }
}

export function markAutoWelcomeSeen(): void {
  try {
    localStorage.setItem(AUTO_WELCOME_SEEN_KEY, "true");
  } catch {
    // private mode / quota — ignore
  }
}

export function loadTourPrefs(tourId: string, version: number): GuidedTourPrefs {
  try {
    const raw = localStorage.getItem(storageKey(tourId));
    if (!raw) return { version, neverShowWelcome: false };
    const parsed = JSON.parse(raw) as Partial<GuidedTourPrefs>;
    const storedVersion = typeof parsed.version === "number" ? parsed.version : 0;
    // Version bump previously re-enabled per-tour welcome; kept for legacy prefs shape.
    if (storedVersion < version) {
      return { version, neverShowWelcome: false };
    }
    return {
      version: storedVersion,
      neverShowWelcome: Boolean(parsed.neverShowWelcome),
    };
  } catch {
    return { version, neverShowWelcome: false };
  }
}

export function saveTourPrefs(tourId: string, prefs: GuidedTourPrefs): void {
  try {
    localStorage.setItem(storageKey(tourId), JSON.stringify(prefs));
  } catch {
    // private mode / quota — ignore
  }
}

/**
 * Otomatik karşılama kararı — yalnızca global `autoWelcomeSeen`.
 * Sayfa bazlı `neverShowWelcome` / tourId artık otomatik popup’ı etkilemez.
 * İmza (tourId, version) geriye dönük uyumluluk için korunur; yok sayılır.
 */
export function shouldOfferWelcome(_tourId?: string, _version?: number): boolean {
  return !hasSeenAutoWelcome();
}
