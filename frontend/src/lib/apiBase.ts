import { Capacitor } from "@capacitor/core";

/** API base URL for requests. Empty = use relative /api (same-origin). */
const STORAGE_KEY = "ai-notes-api-base";

export function getApiBase(): string {
  if (typeof window === "undefined") return "";
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored != null && stored.trim() !== "") return stored.trim().replace(/\/+$/, "");
  const env = import.meta.env.VITE_API_BASE;
  if (typeof env === "string" && env.trim() !== "") return env.trim().replace(/\/+$/, "");
  return "";
}

export function setApiBase(url: string): void {
  const cleaned = url.trim().replace(/\/+$/, "");
  localStorage.setItem(STORAGE_KEY, cleaned);
}

/** True when bundled in native app (Capacitor) and api_base not set */
export function needsServerConfig(): boolean {
  if (typeof window === "undefined") return false;
  if (getApiBase() !== "") return false;
  if (Capacitor.isNativePlatform()) return true;
  const proto = window.location?.protocol ?? "";
  return proto === "capacitor:" || proto === "file:";
}
