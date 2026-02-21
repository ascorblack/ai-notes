import { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client";
import { useAuthStore } from "../../store/authStore";
import { useToastStore } from "../../store/toastStore";
import { VoiceButton } from "../input/VoiceButton";

// Post-process message content: limit consecutive newlines to 2
function postProcessContent(content: string): string {
  // Replace 3+ consecutive newlines with exactly 2 newlines
  return content.replace(/\n{3,}/g, '\n\n').trim();
}

export function SavedInputArea() {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const token = useAuthStore((s) => s.token);
  const queryClient = useQueryClient();
  const showToast = useToastStore((s) => s.showToast);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const MAX_HEIGHT = 160;

  const createMutation = useMutation({
    mutationFn: (content: string) =>
      api.savedMessages.create(token!, { content, category_id: null }),
    onSuccess: () => {
      setText("");
      queryClient.invalidateQueries({ queryKey: ["saved-messages"] });
      showToast("Сообщение сохранено");
    },
    onError: (err) => {
      showToast(`Ошибка: ${err.message}`);
    },
    onSettled: () => {
      setLoading(false);
    },
  });

  const submit = () => {
    if (!text.trim() || loading) return;
    setLoading(true);
    const processedContent = postProcessContent(text.trim());
    createMutation.mutate(processedContent);
  };

  const adjustTextareaHeight = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    const h = Math.min(MAX_HEIGHT, Math.max(40, ta.scrollHeight));
    ta.style.height = `${h}px`;
  }, []);

  useEffect(() => {
    adjustTextareaHeight();
  }, [text, adjustTextareaHeight]);

  const hasText = text.trim().length > 0;
  const [voiceOverlay, setVoiceOverlay] = useState(false);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wasLongPressRef = useRef(false);

  const handleSendPointerDown = () => {
    wasLongPressRef.current = false;
    longPressTimerRef.current = setTimeout(() => {
      longPressTimerRef.current = null;
      wasLongPressRef.current = true;
      setVoiceOverlay(true);
    }, 400);
  };

  const handleSendPointerUp = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handleSendPointerLeave = () => {
    handleSendPointerUp();
  };

  const handleSendClick = () => {
    if (wasLongPressRef.current) {
      wasLongPressRef.current = false;
      return;
    }
    submit();
  };

  useEffect(() => {
    if (!voiceOverlay) return;
    const onClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setVoiceOverlay(false);
      }
    };
    document.addEventListener("pointerdown", onClickOutside, true);
    return () => document.removeEventListener("pointerdown", onClickOutside, true);
  }, [voiceOverlay]);

  return (
    <div ref={containerRef} className="w-full max-w-3xl mx-auto">
      <div
        className="flex items-end gap-2 min-h-[44px] px-4 py-3 rounded-2xl"
        style={{
          backgroundColor: "var(--surface-elevated)",
          border: "1px solid var(--border)",
        }}
      >
        <div className="flex-1 min-w-0">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Введите сообщение..."
            disabled={loading}
            rows={1}
            className="w-full min-h-[28px] bg-transparent text-sm resize-none border-none outline-none placeholder:text-text-muted"
            style={{ color: "var(--text-primary)", lineHeight: "1.4" }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
          />
        </div>
        {hasText ? (
          <div className="relative shrink-0 flex items-center">
            <AnimatePresence>
              {voiceOverlay && (
                <motion.div
                  initial={{ opacity: 0, y: 8, scale: 0.9 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.9 }}
                  transition={{ duration: 0.15 }}
                  className="absolute bottom-full right-0 mb-2 z-10"
                >
                  <VoiceButton
                    onTranscription={(t) => {
                      setText((prev) => (prev ? `${prev} ${t}` : t));
                      setVoiceOverlay(false);
                    }}
                    disabled={loading}
                    className="rounded-full w-10 h-10 min-w-10 min-h-10 !p-2.5 shadow-lg"
                  />
                </motion.div>
              )}
            </AnimatePresence>
            <motion.button
              type="button"
              onClick={handleSendClick}
              onPointerDown={handleSendPointerDown}
              onPointerUp={handleSendPointerUp}
              onPointerLeave={handleSendPointerLeave}
              disabled={loading}
              className="w-9 h-9 min-w-9 min-h-9 flex items-center justify-center rounded-full shrink-0"
              style={{
                backgroundColor: "var(--accent)",
                color: "var(--accent-fg)",
              }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M22 2L11 13M22 2l-7 20-4-9-9 4 20-7z" />
              </svg>
            </motion.button>
          </div>
        ) : (
          <VoiceButton
            onTranscription={(t) => {
              setText((prev) => (prev ? `${prev} ${t}` : t));
            }}
            disabled={loading}
            className="rounded-full w-9 h-9 min-w-9 min-h-9 !p-2 shrink-0"
          />
        )}
      </div>
    </div>
  );
}
