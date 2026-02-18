import { useEffect } from "react";
import { useOverlayStore } from "../store/overlayStore";

/** Register onClose when open is true, so hardware Back closes the overlay first */
export function useRegisterOverlay(open: boolean, onClose: () => void) {
  const register = useOverlayStore((s) => s.register);

  useEffect(() => {
    if (!open) return;
    const unregister = register(onClose);
    return unregister;
  }, [open, onClose, register]);
}
