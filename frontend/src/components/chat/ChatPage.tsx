import { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "../../api/client";
import { ChatMessageBubble } from "./ChatMessageBubble";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { BottomSheet } from "../ui/BottomSheet";
import { useRegisterOverlay } from "../../hooks/useRegisterOverlay";
import { useAuthStore } from "../../store/authStore";
import { useTreeStore } from "../../store/treeStore";
import { useToastStore } from "../../store/toastStore";
import { useAppModalsStore } from "../../store/appModalsStore";
import { ConfirmModal } from "../ui/ConfirmModal";

interface Message {
  id: number;
  role: string;
  content: string;
  tool_calls?: { name: string; arguments: string; results?: unknown[] }[];
  created_at: string;
}

export function ChatPage() {
  const token = useAuthStore((s) => s.token);
  const navigate = useNavigate();
  const setSelectedNote = useTreeStore((s) => s.setSelectedNote);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [streamingContent, setStreamingContent] = useState("");
  const [streamingToolCall, setStreamingToolCall] = useState<{ name: string; args?: unknown } | null>(null);
  const [streamingToolResults, setStreamingToolResults] = useState<{ id: string; results: unknown[] }[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [confirmDeleteSession, setConfirmDeleteSession] = useState<number | null>(null);
  const [confirmDeleteMessage, setConfirmDeleteMessage] = useState<{ sessionId: number; messageId: number } | null>(null);
  const [renameSessionId, setRenameSessionId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; sessionId: number } | null>(null);
  const chatSessionsOpen = useAppModalsStore((s) => s.chatSessionsOpen);
  const setChatSessionsOpen = useAppModalsStore((s) => s.setChatSessionsOpen);
  const [showTypingIndicator, setShowTypingIndicator] = useState(false);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useToastStore((s) => s.showToast);
  const queryClient = useQueryClient();
  const isSm = useMediaQuery("(min-width: 640px)");
  useRegisterOverlay(chatSessionsOpen && !isSm, () => setChatSessionsOpen(false));

  useEffect(() => {
    if (sending && !streamingContent) {
      typingTimeoutRef.current = setTimeout(() => setShowTypingIndicator(true), 800);
    } else {
      setShowTypingIndicator(false);
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }
    }
    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    };
  }, [sending, streamingContent]);

  const deleteSessionMutation = useMutation({
    mutationFn: (sid: number) => api.chat.deleteSession(token!, sid),
    onSuccess: () => {
      if (sessionId === confirmDeleteSession) {
        setSessionId(null);
      }
      setConfirmDeleteSession(null);
      queryClient.invalidateQueries({ queryKey: ["chat-sessions"] });
      queryClient.invalidateQueries({ queryKey: ["chat-session"] });
      showToast("Диалог удалён", "success");
    },
    onError: (e: Error) => {
      showToast(e.message);
      setConfirmDeleteSession(null);
    },
  });

  const deleteMessageMutation = useMutation({
    mutationFn: ({ sessionId: sid, messageId: mid }: { sessionId: number; messageId: number }) =>
      api.chat.deleteMessage(token!, sid, mid),
    onSuccess: () => {
      setConfirmDeleteMessage(null);
      queryClient.invalidateQueries({ queryKey: ["chat-session"] });
      showToast("Сообщение удалено", "success");
    },
    onError: (e: Error) => {
      showToast(e.message);
      setConfirmDeleteMessage(null);
    },
  });

  const patchSessionMutation = useMutation({
    mutationFn: ({ sessionId: sid, title }: { sessionId: number; title: string }) =>
      api.chat.patchSession(token!, sid, { title }),
    onSuccess: () => {
      setRenameSessionId(null);
      setRenameValue("");
      queryClient.invalidateQueries({ queryKey: ["chat-sessions"] });
      queryClient.invalidateQueries({ queryKey: ["chat-session"] });
      showToast("Диалог переименован", "success");
    },
    onError: (e: Error) => {
      showToast(e.message);
    },
  });

  const { data: sessions = [], refetch: refetchSessions } = useQuery({
    queryKey: ["chat-sessions", token],
    queryFn: () => api.chat.listSessions(token!),
    enabled: !!token,
  });

  const { data: sessionData } = useQuery({
    queryKey: ["chat-session", sessionId, token],
    queryFn: () => api.chat.getSession(token!, sessionId!),
    enabled: !!token && sessionId != null,
  });

  useEffect(() => {
    if (sessionData?.messages) {
      setMessages(
        sessionData.messages.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          tool_calls: m.tool_calls as Message["tool_calls"],
          created_at: m.created_at,
        }))
      );
    } else {
      setMessages([]);
    }
    setStreamingContent("");
    setStreamingToolCall(null);
    setStreamingToolResults([]);
  }, [sessionData]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent, streamingToolResults]);

  const handleNewChat = async () => {
    if (!token) return;
    const s = await api.chat.createSession(token);
    setSessionId(s.id);
    setMessages([]);
    setChatSessionsOpen(false);
    refetchSessions();
  };

  const handleSend = async () => {
    const content = input.trim();
    if (!content || !token || sending) return;

    let sid = sessionId;
    if (sid == null) {
      if (sessions.length > 0) {
        sid = sessions[0].id;
        setSessionId(sid);
      } else {
        const s = await api.chat.createSession(token);
        sid = s.id;
        setSessionId(sid);
        refetchSessions();
      }
    }
    await sendToSession(sid, content);
    setInput("");
  };

  const sendToSession = async (sid: number, content: string) => {
    setSending(true);
    setStreamingContent("");
    setStreamingToolCall(null);
    setStreamingToolResults([]);
    setMessages((prev) => [...prev, { id: 0, role: "user", content, created_at: new Date().toISOString() }]);

    try {
      await api.chat.sendMessageStream(token!, sid, content, (event, data) => {
        if (event === "content_delta") {
          setStreamingContent((c) => c + (data.delta as string));
        } else if (event === "tool_call") {
          setStreamingToolCall({ name: data.name as string, args: data.arguments });
        } else if (event === "tool_result") {
          setStreamingToolResults((prev) => [...prev, { id: data.id as string, results: (data.results as unknown[]) || [] }]);
        } else if (event === "done") {
          setMessages((prev) => [
            ...prev,
            {
              id: data.message_id as number,
              role: "assistant",
              content: (data.content as string) || "",
              created_at: new Date().toISOString(),
            },
          ]);
          setStreamingContent("");
          setStreamingToolCall(null);
          setStreamingToolResults([]);
          queryClient.invalidateQueries({ queryKey: ["chat-session"] });
          queryClient.invalidateQueries({ queryKey: ["chat-sessions"] });
        } else if (event === "error") {
          setStreamingContent((c) => c + `\n\n[Ошибка: ${data.message}]`);
        }
      });
    } finally {
      setSending(false);
    }
  };

  useEffect(() => {
    if (sessionId == null && sessions.length > 0) {
      setSessionId(sessions[0].id);
    } else if (sessionId == null && sessions.length === 0) {
      setSessionId(null);
    }
  }, [sessionId, sessions]);

  useEffect(() => {
    if (!contextMenu) return;
    const onGlobalClick = () => setContextMenu(null);
    window.addEventListener("click", onGlobalClick);
    return () => window.removeEventListener("click", onGlobalClick);
  }, [contextMenu]);

  const handleRegenerate = async (messageId: number) => {
    if (!token || sessionId == null || sending) return;
    setSending(true);
    setStreamingContent("");
    setStreamingToolCall(null);
    setStreamingToolResults([]);
    setMessages((prev) => {
      const idx = prev.findIndex((m) => m.id === messageId);
      return idx >= 0 ? prev.slice(0, idx) : prev;
    });
    try {
      await api.chat.regenerateStream(token, sessionId, messageId, (event, data) => {
        if (event === "content_delta") {
          setStreamingContent((c) => c + (data.delta as string));
        } else if (event === "tool_call") {
          setStreamingToolCall({ name: data.name as string, args: data.arguments });
        } else if (event === "tool_result") {
          setStreamingToolResults((prev) => [...prev, { id: data.id as string, results: (data.results as unknown[]) || [] }]);
        } else if (event === "done") {
          setMessages((prev) => [
            ...prev,
            {
              id: data.message_id as number,
              role: "assistant",
              content: (data.content as string) || "",
              created_at: new Date().toISOString(),
            },
          ]);
          setStreamingContent("");
          setStreamingToolCall(null);
          setStreamingToolResults([]);
          queryClient.invalidateQueries({ queryKey: ["chat-session"] });
          queryClient.invalidateQueries({ queryKey: ["chat-sessions"] });
        } else if (event === "error") {
          setStreamingContent((c) => c + `\n\n[Ошибка: ${data.message}]`);
        }
      });
    } finally {
      setSending(false);
    }
  };

  const handleCopy = (content: string) => {
    navigator.clipboard.writeText(content).then(
      () => showToast("Скопировано", "success"),
      () => showToast("Не удалось скопировать")
    );
  };

  const startRename = (s: { id: number; title: string }) => {
    setRenameSessionId(s.id);
    setRenameValue(s.title || `Диалог ${s.id}`);
    setContextMenu(null);
  };

  const handleNoteClick = (noteId: number) => {
    setSelectedNote(noteId);
    navigate("/");
  };

  return (
    <div
      className="h-full flex flex-col bg-[var(--page-bg)] w-full max-w-[100vw] overflow-x-hidden overflow-y-hidden"
      style={{
        paddingTop: "env(safe-area-inset-top)",
        paddingLeft: "env(safe-area-inset-left)",
        paddingRight: "env(safe-area-inset-right)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      <header className="flex-shrink-0 flex items-center justify-between px-3 sm:px-4 py-2.5 sm:py-3 border-b border-[var(--border)] gap-2 min-w-0 overflow-hidden">
        <Link
          to="/"
          className="text-sm text-[var(--text-secondary)] hover:text-[var(--accent)] flex items-center gap-2 shrink-0"
          aria-label="Назад к заметкам"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          <span className="hidden sm:inline">Заметки</span>
        </Link>
        <h1 className="text-base sm:text-lg font-medium text-[var(--text-primary)] truncate min-w-0 flex-1 text-center px-1">Обсуждение</h1>
      </header>

      <div className="flex-1 flex min-h-0">
        {!isSm && (
          <BottomSheet
            open={chatSessionsOpen}
            onClose={() => setChatSessionsOpen(false)}
            title="Диалоги"
            maxHeight="70dvh"
          >
            <div className="p-2 space-y-1">
              <button
                type="button"
                onClick={async () => {
                  await handleNewChat();
                  setChatSessionsOpen(false);
                }}
                className="touch-target-48 w-full text-left px-3 py-2 rounded-lg text-sm text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] border border-white/25"
              >
                Создать новый диалог
              </button>
              {sessions.map((s) => (
                <div key={s.id} className="group flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      setSessionId(s.id);
                      setChatSessionsOpen(false);
                    }}
                    className={`touch-target-48 flex-1 min-w-0 text-left px-3 py-2 rounded-lg text-sm truncate ${
                      sessionId === s.id
                        ? "bg-[var(--accent-muted)] text-[var(--accent)]"
                        : "text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]"
                    }`}
                  >
                    {s.title || `Диалог ${s.id}`}
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setChatSessionsOpen(false);
                      setConfirmDeleteSession(s.id);
                    }}
                    className="touch-target-48 shrink-0 p-2 rounded-md text-[var(--text-muted)] hover:text-[var(--error)] hover:bg-[var(--error)]/10"
                    aria-label="Удалить диалог"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                      <line x1="10" y1="11" x2="10" y2="17" />
                      <line x1="14" y1="11" x2="14" y2="17" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          </BottomSheet>
        )}
        <motion.aside
          initial={false}
          animate={{
            x: isSm ? 0 : "-100%",
          }}
          transition={{ type: "tween", duration: 0.2 }}
          className="fixed sm:relative left-0 top-0 z-[91] sm:z-auto h-full w-56 flex-shrink-0 border-r border-[var(--border)] overflow-y-auto bg-[var(--page-bg)] sm:block"
          style={{ boxShadow: !isSm && chatSessionsOpen ? "4px 0 20px rgba(0,0,0,0.3)" : undefined }}
        >
          <div className="p-2 space-y-1">
            <button
              type="button"
              onClick={handleNewChat}
              className="hidden sm:block w-full text-left px-3 py-2 rounded-lg text-sm bg-[var(--accent-muted)] text-[var(--accent)] hover:opacity-90 font-medium"
            >
              Новый диалог
            </button>
          <ul className="space-y-1">
            <AnimatePresence mode="popLayout">
              {sessions.map((s) => (
                <motion.li
                  key={s.id}
                  layout
                  initial={{ opacity: 1 }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                  className="group flex items-center gap-1"
                >
                  <button
                    type="button"
                    onClick={() => {
                      setSessionId(s.id);
                      setChatSessionsOpen(false);
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setContextMenu({ x: e.clientX, y: e.clientY, sessionId: s.id });
                    }}
                    className={`flex-1 min-w-0 text-left px-3 py-2 rounded-lg text-sm truncate ${
                      sessionId === s.id
                        ? "bg-[var(--accent-muted)] text-[var(--accent)]"
                        : "text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]"
                    }`}
                  >
                    {s.title || `Диалог ${s.id}`}
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmDeleteSession(s.id);
                    }}
                    disabled={deleteSessionMutation.isPending}
                    className="shrink-0 p-1 rounded-md opacity-0 group-hover:opacity-100 hover:bg-[var(--error)]/20 text-[var(--text-muted)] hover:text-[var(--error)] transition-opacity disabled:opacity-50"
                    aria-label="Удалить диалог"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                      <line x1="10" y1="11" x2="10" y2="17" />
                      <line x1="14" y1="11" x2="14" y2="17" />
                    </svg>
                  </button>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
          </div>
          <div className="sm:hidden p-2 border-t border-[var(--border)]">
            <button
              type="button"
              onClick={() => {
                setChatSessionsOpen(false);
              }}
              className="w-full text-left px-3 py-2 rounded-lg text-sm text-[var(--text-muted)]"
            >
              Закрыть
            </button>
          </div>
        </motion.aside>

        <ConfirmModal
          open={confirmDeleteMessage != null}
          title="Удалить сообщение?"
          message="Это действие нельзя отменить."
          confirmLabel="Удалить"
          danger
          onConfirm={() => {
            if (confirmDeleteMessage != null) {
              deleteMessageMutation.mutate(confirmDeleteMessage);
            }
          }}
          onCancel={() => setConfirmDeleteMessage(null)}
        />

        <ConfirmModal
          open={confirmDeleteSession != null}
          title="Удалить диалог?"
          message="Все сообщения в этом диалоге будут удалены. Это действие нельзя отменить."
          confirmLabel="Удалить"
          danger
          onConfirm={() => {
            if (confirmDeleteSession != null) {
              deleteSessionMutation.mutate(confirmDeleteSession);
            }
          }}
          onCancel={() => setConfirmDeleteSession(null)}
        />

        {contextMenu != null && (
          <div
            className="fixed z-[102] min-w-[120px] py-1 rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] shadow-lg"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="w-full text-left px-4 py-2 text-sm text-[var(--text-primary)] hover:bg-[var(--surface-hover)]"
              onClick={() => {
                const s = sessions.find((x) => x.id === contextMenu.sessionId);
                if (s) startRename(s);
              }}
            >
              Переименовать
            </button>
            <button
              type="button"
              className="w-full text-left px-4 py-2 text-sm text-[var(--error)] hover:bg-[var(--error)]/10"
              onClick={() => {
                setConfirmDeleteSession(contextMenu.sessionId);
                setContextMenu(null);
              }}
            >
              Удалить
            </button>
          </div>
        )}

        {renameSessionId != null && (
          <div className="fixed inset-0 z-[103] flex items-center justify-center bg-black/60">
            <div
              className="w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] p-4"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-medium text-[var(--text-primary)]">Переименовать диалог</h3>
              <input
                type="text"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    patchSessionMutation.mutate({ sessionId: renameSessionId, title: renameValue.trim() });
                  } else if (e.key === "Escape") {
                    setRenameSessionId(null);
                    setRenameValue("");
                  }
                }}
                className="mt-2 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
                placeholder="Название диалога"
                autoFocus
              />
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setRenameSessionId(null);
                    setRenameValue("");
                  }}
                  className="rounded-lg px-3 py-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]"
                >
                  Отмена
                </button>
                <button
                  type="button"
                  onClick={() =>
                    patchSessionMutation.mutate({ sessionId: renameSessionId, title: renameValue.trim() })
                  }
                  disabled={!renameValue.trim()}
                  className="rounded-lg px-3 py-2 text-sm font-medium bg-[var(--accent)] text-[var(--accent-fg)] hover:opacity-90 disabled:opacity-50"
                >
                  Сохранить
                </button>
              </div>
            </div>
          </div>
        )}

        <main className="flex-1 flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 && !streamingContent && !sending && (
              <p className="text-center text-[var(--text-muted)] py-12">
                Начните диалог — задайте вопрос, агент найдёт нужные заметки.
              </p>
            )}
            {showTypingIndicator && (
              <div className="w-full px-4 py-1">
                <div className="flex items-start gap-3 max-w-[80%]">
                  <div className="w-7 h-7 rounded-full bg-[var(--accent)] flex-shrink-0 flex items-center justify-center mt-0.5 text-white">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z"/></svg>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
                    <span className="inline-block w-2 h-2 rounded-full bg-[var(--accent)] animate-pulse" />
                    <span className="inline-block w-2 h-2 rounded-full bg-[var(--accent)] animate-pulse" style={{ animationDelay: "0.15s" }} />
                    <span className="inline-block w-2 h-2 rounded-full bg-[var(--accent)] animate-pulse" style={{ animationDelay: "0.3s" }} />
                  </div>
                </div>
              </div>
            )}
            {messages.map((m) => (
              <ChatMessageBubble
                key={m.id}
                id={m.id}
                role={m.role}
                content={m.content}
                onCopy={handleCopy}
                onDelete={(messageId) =>
                  sessionId != null && setConfirmDeleteMessage({ sessionId, messageId })
                }
                onRegenerate={handleRegenerate}
              />
            ))}
            {streamingContent && (
              <div className="w-full px-4 py-1">
                <div className="flex items-start gap-3 max-w-[80%]">
                  <div className="w-7 h-7 rounded-full bg-[var(--accent)] flex-shrink-0 flex items-center justify-center mt-0.5 text-white">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z"/></svg>
                  </div>
                  <div className="prose dark:prose-invert prose-sm max-w-none text-[var(--text-primary)] [&_p:last-child]:mb-0">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{streamingContent}</ReactMarkdown>
                    <span className="animate-pulse">▍</span>
                  </div>
                </div>
              </div>
            )}
            {streamingToolCall && (
              <div className="w-full px-4 py-2">
                <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
                  <span className="inline-block w-2 h-2 rounded-full bg-[var(--accent)] animate-pulse" />
                  <span className="text-xs text-[var(--accent)] font-medium">
                  {streamingToolCall.name}
                  </span>
                  <span>Ищу по заметкам…</span>
                </div>
              </div>
            )}
            {streamingToolResults.map((tr) => (
              <div
                key={tr.id}
                className="max-w-[85%] px-4 py-3 rounded-xl bg-[var(--surface)] border border-[var(--border)]"
              >
                <div className="text-xs text-[var(--text-muted)] mb-2 uppercase tracking-wide">
                  Найдено заметок: {tr.results.length}
                </div>
                <div className="space-y-2">
                  {(tr.results as { id: number; title: string; snippet: string }[]).map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => handleNoteClick(r.id)}
                      className="block w-full text-left px-3 py-2 rounded-lg hover:bg-[var(--surface-hover)] border border-[var(--border)] transition-colors"
                    >
                      <div className="font-medium text-[var(--accent)]">{r.title}</div>
                      {r.snippet && (
                        <div className="text-xs text-[var(--text-muted)] truncate mt-1">{r.snippet}</div>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          <div className="flex-shrink-0 px-4 pb-4 pt-2 border-t border-[var(--border)]">
            <div className="relative max-w-3xl mx-auto">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="Задайте вопрос по заметкам…"
                rows={1}
                className="w-full pl-4 pr-14 py-3 rounded-xl bg-[var(--surface)] border border-[var(--border)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)] resize-none min-h-[48px] max-h-40 overflow-y-auto"
                disabled={sending}
                style={{ lineHeight: "1.5" }}
              />
              <button
                type="button"
                onClick={handleSend}
                disabled={sending || !input.trim()}
                className="absolute right-2 bottom-2 touch-target-48 p-2 rounded-lg bg-[var(--accent)] text-[var(--accent-fg)] hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
                aria-label="Отправить"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
                </svg>
              </button>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
