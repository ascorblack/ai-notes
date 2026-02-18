import { useState, useEffect } from "react";
import { Capacitor } from "@capacitor/core";

const MOBILE_BREAKPOINT = 640;

/** True when viewport width < 640px (sm breakpoint) */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.innerWidth < MOBILE_BREAKPOINT;
  });

  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const handler = () => setIsMobile(mql.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  return isMobile;
}

/** True when running inside Capacitor native app (Android/iOS) */
export function useIsNative(): boolean {
  const [isNative, setIsNative] = useState(false);

  useEffect(() => {
    setIsNative(Capacitor.isNativePlatform());
  }, []);

  return isNative;
}

/** True when mobile viewport OR native app — use for mobile-optimized UI */
export function useIsMobileOrNative(): boolean {
  const isMobile = useIsMobile();
  const isNative = useIsNative();
  return isMobile || isNative;
}
