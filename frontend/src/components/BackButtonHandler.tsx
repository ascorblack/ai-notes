import { useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { useOverlayStore } from "../store/overlayStore";

/** Handles Android hardware back button.
 * Order: close top overlay -> close sidebar -> /chat -> home -> history.back -> exit */
export function BackButtonHandler() {
  const navigate = useNavigate();
  const location = useLocation();
  const locationRef = useRef(location.pathname);
  locationRef.current = location.pathname;
  const closeTop = useOverlayStore((s) => s.closeTop);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const handler = ({ canGoBack }: { canGoBack: boolean }) => {
      if (closeTop()) return;
      if (locationRef.current === "/chat") {
        navigate("/", { replace: true });
      } else if (canGoBack) {
        window.history.back();
      } else {
        App.exitApp();
      }
    };

    const p = App.addListener("backButton", handler);
    return () => {
      p.then((h) => h.remove());
    };
  }, [navigate, closeTop]);

  return null;
}
