import { create } from "zustand";

export type ToastVariant = "success" | "error";

interface ToastState {
  message: string | null;
  variant: ToastVariant;
  showToast: (message: string, variant?: ToastVariant) => void;
  dismiss: () => void;
}

export const useToastStore = create<ToastState>()((set) => ({
  message: null,
  variant: "error",
  showToast: (message, variant = "error") => set({ message, variant }),
  dismiss: () => set({ message: null }),
}));
