import { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { api } from "../../api/client";
import { useAuthStore } from "../../store/authStore";
import { MessageList } from "./MessageList";
import { SavedInputArea } from "./SavedInputArea";
import { CategoryFilter } from "./CategoryFilter";
import { SavedTrashModal } from "./SavedTrashModal";
import { useAppModalsStore } from "../../store/appModalsStore";

export function SavedMessagesPage() {
  const token = useAuthStore((s) => s.token);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { setSavedTrashOpen } = useAppModalsStore();

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  // Escape -> go home
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") navigate("/");
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [navigate]);

  // Use search API when search query is present, otherwise use list API
  const searchQueryKey = searchQuery.trim()
    ? ["saved-messages-search", token, searchQuery.trim(), selectedCategoryId]
    : ["saved-messages", token, selectedCategoryId];

  const { data: messages = [] } = useQuery({
    queryKey: searchQueryKey,
    queryFn: () => {
      if (searchQuery.trim()) {
        return api.savedMessages.search(token!, searchQuery.trim(), selectedCategoryId ?? undefined, 100);
      }
      return api.savedMessages.list(token!, selectedCategoryId ?? undefined);
    },
    enabled: !!token,
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["saved-message-categories", token],
    queryFn: () => api.savedMessages.listCategories(token!),
    enabled: !!token,
  });

  const deleteMutation = useMutation({
    mutationFn: (messageId: number) => api.savedMessages.delete(token!, messageId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["saved-messages"] });
      queryClient.invalidateQueries({ queryKey: ["saved-messages-trash"] });
    },
  });

  const updateCategoryMutation = useMutation({
    mutationFn: ({ messageId, categoryId }: { messageId: number; categoryId: number | null }) =>
      api.savedMessages.update(token!, messageId, { category_id: categoryId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["saved-messages"] });
    },
  });

  const handleUpdateCategory = (messageId: number, categoryId: number | null) => {
    updateCategoryMutation.mutate({ messageId, categoryId });
  };

  return (
    <div className="h-full flex flex-col"
         style={{
           backgroundColor: "var(--bg)",
         }}>
      {/* Header with category filter and trash */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/60"
           style={{
             backgroundColor: "var(--surface)",
           }}>
        <div className="flex items-center gap-3 min-w-0">
          <Link
            to="/"
            className="touch-target-48 flex items-center justify-center shrink-0 text-text-secondary hover:text-accent transition-colors"
            aria-label="На главную"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </Link>
          <div className="flex items-center justify-center w-10 h-10 rounded-full shrink-0"
               style={{
                 backgroundColor: "var(--accent-muted)",
               }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                 style={{ color: "var(--accent)" }}>
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
            </svg>
          </div>
          <h1 className="text-lg font-semibold text-text-primary">Сохраненные</h1>
        </div>
        <div className="flex items-center gap-2">
          {/* Search input */}
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Поиск..."
              className="pl-9 pr-3 py-2 text-sm rounded-xl border border-border bg-transparent focus:border-accent focus:outline-none transition-colors"
              style={{
                width: searchQuery.trim() ? "180px" : "140px",
                color: "var(--text-primary)",
              }}
            />
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted">
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
            {searchQuery.trim() && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded-full text-text-muted hover:text-text-primary hover:bg-accent/10 transition-colors"
                aria-label="Очистить поиск"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
          <CategoryFilter
            categories={categories}
            selectedCategoryId={selectedCategoryId}
            onSelect={(id) => setSelectedCategoryId(id)}
          />
          <button
            type="button"
            onClick={() => setSavedTrashOpen(true)}
            className="touch-target-48 p-2 rounded-lg text-text-secondary hover:text-error hover:bg-error/10 transition-colors"
            aria-label="Корзина"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Search results indicator */}
      {searchQuery.trim() && (
        <div className="px-4 py-2 text-xs text-text-muted border-b border-border/30 flex items-center justify-between"
             style={{ backgroundColor: "var(--bg)" }}>
          <span>
            Результаты поиска: <strong className="text-text-primary">{searchQuery.trim()}</strong>
          </span>
          <button
            type="button"
            onClick={() => setSearchQuery("")}
            className="text-accent hover:underline transition-colors"
          >
            Сбросить
          </button>
        </div>
      )}

      {/* Messages list */}
      <div className="flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <div className="h-full flex items-center justify-center p-8">
            <div className="text-center max-w-xs">
              <div className="flex justify-center mb-4">
                <div className="flex items-center justify-center w-24 h-24 rounded-full"
                     style={{
                       backgroundColor: "var(--accent-muted)",
                     }}>
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
                       style={{ color: "var(--accent)" }}>
                    <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                  </svg>
                </div>
              </div>
              <h2 className="text-lg font-medium text-text-primary mb-2">
                {searchQuery.trim()
                  ? "Ничего не найдено"
                  : selectedCategoryId
                  ? "Пустая категория"
                  : "Сохраняйте важное"}
              </h2>
              <p className="text-text-muted text-sm mb-4">
                {searchQuery.trim()
                  ? "Попробуйте изменить поисковый запрос"
                  : selectedCategoryId
                  ? "В этой категории пока нет сообщений. Добавьте что-нибудь!"
                  : "Напишите сообщение или используйте голосовой ввод, чтобы сохранить его здесь."}
              </p>
              <div className="flex items-center justify-center gap-2 text-text-muted/60 text-xs">
                <span className="flex items-center gap-1">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                  Текст
                </span>
                <span>·</span>
                <span className="flex items-center gap-1">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                    <line x1="12" y1="19" x2="12" y2="23" />
                    <line x1="8" y1="23" x2="16" y2="23" />
                  </svg>
                  Голос
                </span>
                <span>·</span>
                <span className="flex items-center gap-1">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                    <path d="M22 6l-10 7L2 6" />
                  </svg>
                  Ссылки
                </span>
              </div>
            </div>
          </div>
        ) : (
          <MessageList
            messages={messages}
            categories={categories}
            onDelete={(id) => deleteMutation.mutate(id)}
            onUpdateCategory={handleUpdateCategory}
          />
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area - Telegram style */}
      <div className="border-t border-border/60 px-4 py-3"
           style={{
             backgroundColor: "var(--surface)",
           }}>
        <SavedInputArea />
      </div>

      <SavedTrashModal />
    </div>
  );
}
