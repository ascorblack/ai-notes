import { useRef, useCallback } from "react";

const DEFAULT_DELAY = 500;

interface UseLongPressOptions {
  delay?: number;
  onLongPress: () => void;
  onClick?: () => void;
}

/** Returns touch handlers for long-press. On long press, calls onLongPress and suppresses click. */
export function useLongPress({
  delay = DEFAULT_DELAY,
  onLongPress,
  onClick,
}: UseLongPressOptions) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggeredRef = useRef(false);

  const start = useCallback(
    (_e: React.TouchEvent) => {
      longPressTriggeredRef.current = false;
      timerRef.current = setTimeout(() => {
        longPressTriggeredRef.current = true;
        onLongPress();
      }, delay);
    },
    [delay, onLongPress]
  );

  const clear = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      clear();
      if (longPressTriggeredRef.current) {
        e.preventDefault();
      }
    },
    [clear]
  );

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (longPressTriggeredRef.current) {
        e.preventDefault();
        e.stopPropagation();
      } else if (onClick) {
        onClick();
      }
    },
    [onClick]
  );

  return {
    onTouchStart: start,
    onTouchEnd: handleTouchEnd,
    onTouchCancel: clear,
    onClick: onClick ? handleClick : undefined,
  };
}
