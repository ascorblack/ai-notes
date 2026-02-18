import { create } from "zustand";

export type Theme = "dark" | "light";
const THEME_KEY = "ai-notes-theme";

export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.classList.remove("dark", "light");
  root.classList.add(theme);
  root.style.colorScheme = theme;
}

interface ThemeState {
  theme: Theme;
  isDark: boolean;
  toggle: () => void;
}

export const useThemeStore = create<ThemeState>()((set, get) => ({
  theme: (localStorage.getItem(THEME_KEY) as Theme) || "dark",
  isDark: (localStorage.getItem(THEME_KEY) || "dark") === "dark",
  toggle: () => {
    const next: Theme = get().theme === "dark" ? "light" : "dark";
    localStorage.setItem(THEME_KEY, next);
    applyTheme(next);
    set({ theme: next, isDark: next === "dark" });
  },
}));
