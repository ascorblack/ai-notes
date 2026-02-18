import { create } from "zustand";

type CloseFn = () => void;

interface OverlayStore {
  /** Stack of close functions; Back button closes the topmost */
  stack: CloseFn[];
  register: (close: CloseFn) => () => void;
  closeTop: () => boolean;
}

export const useOverlayStore = create<OverlayStore>((set, get) => ({
  stack: [],
  register: (close) => {
    set((s) => ({ stack: [...s.stack, close] }));
    return () => {
      set((s) => ({ stack: s.stack.filter((f) => f !== close) }));
    };
  },
  closeTop: () => {
    const { stack } = get();
    if (stack.length === 0) return false;
    const close = stack[stack.length - 1];
    set((s) => ({ stack: s.stack.slice(0, -1) }));
    close();
    return true;
  },
}));
