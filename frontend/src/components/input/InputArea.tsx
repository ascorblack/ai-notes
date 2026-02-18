import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "../../api/client";
import { useAuthStore } from "../../store/authStore";
import { useTreeStore } from "../../store/treeStore";
import { useToastStore } from "../../store/toastStore";
import { useAddInputStore } from "../../store/addInputStore";
import { useQueryClient } from "@tanstack/react-query";
import { VoiceButton } from "./VoiceButton";
import { AddNoteStatusModal, AddNoteStep } from "./AddNoteStatusModal";
import { NoteSelectionModal } from "./NoteSelectionModal";

interface InputAreaProps {
  variant?: "bar" | "island";
}

export function InputArea({ variant = "island" }: InputAreaProps) {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [modalStep, setModalStep] = useState<AddNoteStep>("received");
  const [modalMessage, setModalMessage] = useState<string>("");
  const [intentLabel, setIntentLabel] = useState<string | undefined>(undefined);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectionModalOpen, setSelectionModalOpen] = useState(false);
  const [selectionCandidates, setSelectionCandidates] = useState<{ note_id: number; title: string }[]>([]);
  const [pendingUserInput, setPendingUserInput] = useState<string | null>(null);
  const token = useAuthStore((s) => s.token);
  const queryClient = useQueryClient();
  const selectedNoteId = useTreeStore((s) => s.selectedNoteId);
  const setLastCreatedIds = useTreeStore((s) => s.setLastCreatedIds);
  const setSelectedNote = useTreeStore((s) => s.setSelectedNote);
  const showToast = useToastStore((s) => s.showToast);
  const setFocus = useAddInputStore((s) => s.setFocus);

  const runAgent = async (userInput: string, noteId: number | null | undefined) => {
    if (!token || !userInput.trim()) return;
    setError(null);
    setLoading(true);
    setStatus("Загрузка…");
    setModalOpen(true);
    setModalStep("received");
    setModalMessage("");
    setIntentLabel(undefined);

    let closeModalAsError = false;
    try {
      await api.agent.processStream(token, userInput.trim(), (event, data) => {
        if (event === "status") {
          const phase = data.phase as string | undefined;
          const message = (data.message as string) ?? "";
          setModalMessage(message);

          if (phase === "classifying_intent") {
            setModalStep("classifying");
            setStatus(message);
          } else if (phase === "intent_detected") {
            const label = (data.intent_label as string) ?? (data.intent as string);
            setIntentLabel(label);
            setModalStep("classifying");
            setStatus(`Запрос: ${label}`);
          } else if (phase === "building_context") {
            setModalStep("loading_context");
            setStatus(message);
          } else if (phase === "calling_llm") {
            setModalStep("analyzing");
            setStatus(message);
          } else if (phase === "executing_tool") {
            setModalStep("creating");
            setStatus(message);
          } else if (phase === "saving") {
            setModalStep("saving");
            setStatus(message);
          }
        } else if (event === "done") {
          const requiresSelection = data.requires_note_selection === true;
          const candidates = (data.candidates as { note_id: number; title: string }[]) ?? [];
          if (requiresSelection && candidates.length > 0) {
            setSelectionCandidates(candidates);
            setPendingUserInput(userInput.trim());
            setModalOpen(false);
            setStatus(null);
            setSelectionModalOpen(true);
            setLoading(false);
            return;
          }

          const affectedIds = (data.affected_ids as number[]) ?? [];
          const createdIds = (data.created_ids as number[]) ?? [];
          const createdNoteIds = (data.created_note_ids as number[]) ?? [];
          const hasResult = affectedIds.length > 0 || createdIds.length > 0;
          const unknownIntent = data.unknown_intent === true;

          if (unknownIntent || !hasResult) {
            closeModalAsError = true;
            const reason = unknownIntent
              ? (data.reason as string) ?? "Не понял запрос. Попробуйте переформулировать."
              : data.skipped && data.reason ? String(data.reason) : null;
            setModalStep("error");
            setModalMessage(reason ?? "Ошибка при добавлении");
            showToast(reason ?? "Не удалось сохранить заметку");
          } else {
            setModalStep("done");
            setStatus("Готово");
            setText("");
            setLastCreatedIds(createdIds);
            if (createdNoteIds.length > 0) {
              setSelectedNote(createdNoteIds[0]);
            }
            queryClient.invalidateQueries({ queryKey: ["tree"] });
            queryClient.invalidateQueries({ queryKey: ["tasks"] });
            queryClient.invalidateQueries({ queryKey: ["tasksCategories"] });
            if (createdNoteIds.length === 0) {
              queryClient.invalidateQueries({ queryKey: ["note"] });
            }
            queryClient.invalidateQueries({ queryKey: ["events"] });
            queryClient.invalidateQueries({ queryKey: ["profile-facts"] });
            setTimeout(() => {
              setModalOpen(false);
              setStatus(null);
            }, 600);
          }
        } else if (event === "error") {
          closeModalAsError = true;
          const msg = (data.message as string) ?? "Unknown error";
          setModalStep("error");
          setModalMessage(msg);
          setError(msg);
          showToast(`Ошибка при добавлении: ${msg}`);
        }
      }, noteId);
    } catch (err) {
      closeModalAsError = true;
      const msg = err instanceof Error ? err.message : "Unknown error";
      setModalStep("error");
      setModalMessage(msg);
      setError(msg);
      showToast(`Ошибка при добавлении: ${msg}`);
    } finally {
      setLoading(false);
      if (closeModalAsError) {
        setTimeout(() => {
          setModalOpen(false);
          setStatus(null);
          setError(null);
        }, 3000);
      }
    }
  };

  const submit = () => runAgent(text.trim(), selectedNoteId);

  const handleNoteSelect = (noteId: number) => {
    const input = pendingUserInput;
    setSelectionModalOpen(false);
    setPendingUserInput(null);
    setSelectionCandidates([]);
    setSelectedNote(noteId); // сразу открыть заметку
    if (input && token) runAgent(input, noteId);
  };

  const handleSelectionCancel = () => {
    setSelectionModalOpen(false);
    setPendingUserInput(null);
    setSelectionCandidates([]);
  };

  if (!token) return null;

  const islandClasses = variant === "island"
    ? "w-full max-w-2xl mx-auto p-3 sm:p-4 rounded-2xl border border-border shadow-lg"
    : "p-3 sm:p-5 border-t border-border flex-shrink-0";

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const MIN_ROWS = 2;
  const MIN_ROWS_SM = 3;
  const MAX_HEIGHT = 240; // ~12 lines

  const adjustTextareaHeight = () => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    const lineHeight = 24;
    const minRows = typeof window !== "undefined" && window.innerWidth >= 475 ? MIN_ROWS_SM : MIN_ROWS;
    const minH = lineHeight * minRows;
    const h = Math.max(minH, Math.min(ta.scrollHeight, MAX_HEIGHT));
    ta.style.height = `${h}px`;
    ta.style.overflowY = ta.scrollHeight > MAX_HEIGHT ? "auto" : "hidden";
  };

  useEffect(() => {
    adjustTextareaHeight();
  }, [text]);

  useEffect(() => {
    const onResize = () => adjustTextareaHeight();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const focusTextarea = useCallback(() => {
    textareaRef.current?.focus();
  }, []);
  useEffect(() => {
    setFocus(focusTextarea);
    return () => setFocus(null);
  }, [setFocus, focusTextarea]);

  return (
    <>
    <div
      className={`${islandClasses}`}
      style={{ backgroundColor: "var(--surface)" }}
    >
      <div className="flex flex-col xs:flex-row gap-3 xs:items-stretch">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={selectedNoteId
            ? "Запрос отправится с ID заметки — агент внесёт изменения в эту заметку"
            : "Введите или вставьте заметку — агент организует её…"}
          rows={MIN_ROWS}
          disabled={loading || selectionModalOpen}
          className="flex-1 min-w-0 w-full min-h-[4.5rem] xs:min-h-[5rem] px-3 sm:px-4 py-2.5 sm:py-3 rounded-xl border border-border text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent/60 resize-none text-sm transition-[height] duration-100"
          style={{ backgroundColor: "var(--bg)" }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
        />
        <div className="flex gap-2 items-stretch justify-end xs:justify-start">
          <VoiceButton
            onTranscription={(t) => {
              setError(null);
              setText((prev) => (prev ? `${prev} ${t}` : t));
            }}
            onError={(msg) => setError(msg)}
            disabled={loading || selectionModalOpen}
          />
          <motion.button
            type="button"
            onClick={submit}
            disabled={loading || selectionModalOpen || !text.trim()}
            className="touch-target-48 px-4 sm:px-5 py-2.5 sm:py-3 rounded-xl bg-accent text-accent-fg font-medium hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed text-sm flex-shrink-0 transition-opacity self-stretch min-h-[48px] sm:min-h-[2.5rem]"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            {loading ? (status ?? "…") : "Add"}
          </motion.button>
        </div>
      </div>
      {status && loading && (
        <motion.p
          className="mt-2 text-text-muted text-sm flex items-center gap-2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
          {status}
        </motion.p>
      )}
      {error && (
        <motion.p
          className="mt-2 text-error text-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          {error}
        </motion.p>
      )}
    </div>
    <AnimatePresence>
      {modalOpen && (
        <AddNoteStatusModal
          key="add-note-status"
          step={modalStep}
          currentMessage={modalMessage}
          intentLabel={intentLabel}
          errorMessage={modalStep === "error" ? (modalMessage || error || undefined) : undefined}
        />
      )}
      <NoteSelectionModal
        key="note-selection"
        open={selectionModalOpen}
        candidates={selectionCandidates}
        onSelect={handleNoteSelect}
        onCancel={handleSelectionCancel}
      />
    </AnimatePresence>
    </>
  );
}
