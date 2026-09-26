export type ThemeMode = "light" | "dark" | "system";

const THEME_STORAGE_KEY = "pet-theme-mode";
const DARK_QUERY = "(prefers-color-scheme: dark)";

export function normalizeThemeMode(value: unknown): ThemeMode {
  return value === "light" || value === "dark" || value === "system" ? value : "system";
}

export function applyThemeMode(value: unknown) {
  const mode = normalizeThemeMode(value);
  const resolved = mode === "system"
    ? window.matchMedia(DARK_QUERY).matches ? "dark" : "light"
    : mode;
  const root = document.documentElement;
  root.dataset.theme = resolved;
  root.dataset.themeMode = mode;
  window.localStorage.setItem(THEME_STORAGE_KEY, mode);
  document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    ?.setAttribute("content", resolved === "dark" ? "#111210" : "#f4f4f1");
}

export function watchThemeMode(value: unknown) {
  const mode = normalizeThemeMode(value);
  applyThemeMode(mode);
  if (mode !== "system") return () => undefined;
  const media = window.matchMedia(DARK_QUERY);
  const update = () => applyThemeMode(mode);
  media.addEventListener("change", update);
  return () => media.removeEventListener("change", update);
}
