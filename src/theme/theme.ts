export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "theme";

export function getStoredTheme(): Theme {
  if (typeof window === "undefined") {
    return "light";
  }
  try {
    return localStorage.getItem(THEME_STORAGE_KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event("theme-changed"));
}

export function initTheme(): Theme {
  const theme = getStoredTheme();
  document.documentElement.classList.toggle("dark", theme === "dark");
  return theme;
}
