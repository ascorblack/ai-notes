import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useIsMobile } from "../../hooks/useIsMobile";
import { BottomSheet } from "../ui/BottomSheet";

interface SavedMessage {
  id: number;
  category_id: number | null;
  content: string;
  created_at: string;
}

interface Category {
  id: number;
  name: string;
}

interface MessageListProps {
  messages: SavedMessage[];
  categories: Category[];
  onDelete: (id: number) => void;
  onUpdateCategory: (id: number, categoryId: number | null) => void;
}

// Extract URLs from text
function extractUrls(text: string): string[] {
  const urlPattern = /(https?:\/\/[^\s<>"{}|\\^`\[\]]+)/gi;
  const matches = text.match(urlPattern);
  return matches || [];
}

// Get domain from URL for preview
function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace('www.', '');
  } catch {
    return url;
  }
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return "только что";
  if (diffMins < 60) return `${diffMins} мин.`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours} ч.`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays} дн.`;

  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

function getCategoryName(categoryId: number | null, categories: Category[]): string {
  if (!categoryId) return "Без категории";
  const cat = categories.find(c => c.id === categoryId);
  return cat ? cat.name : "Без категории";
}

// Link preview component
function LinkPreview({ url }: { url: string }) {
  const domain = getDomain(url);

  // Simplified preview - in production you'd want to fetch from an API
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="block mt-2 rounded-xl overflow-hidden border border-border/40 hover:border-accent/50 transition-colors"
      style={{
        backgroundColor: "var(--surface-elevated)",
      }}
    >
      <div className="flex items-center gap-3 p-3">
        <div className="flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center text-sm font-medium"
             style={{
               backgroundColor: "var(--accent-muted)",
               color: "var(--accent)",
             }}>
          {domain.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-text-primary truncate">{domain}</p>
          <p className="text-xs text-text-muted truncate">{url.slice(0, 50)}...</p>
        </div>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-text-muted">
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
          <polyline points="15 3 21 3 21 9" />
          <line x1="10" y1="14" x2="21" y2="3" />
        </svg>
      </div>
    </a>
  );
}

// Category selector component
function CategorySelector({
  currentCategoryId,
  categories,
  onSelect,
  onClose
}: {
  currentCategoryId: number | null;
  categories: Category[];
  onSelect: (categoryId: number | null) => void;
  onClose: () => void;
}) {
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  return (
    <div ref={dropdownRef} className="min-w-[150px] rounded-xl border border-border shadow-xl overflow-hidden"
         style={{
           backgroundColor: "var(--surface-elevated)",
         }}>
      {categories.map((category) => (
        <button
          key={category.id}
          type="button"
          onClick={() => {
            onSelect(category.id);
            onClose();
          }}
          className="w-full text-left px-3 py-2 text-sm hover:bg-accent/10 transition-colors flex items-center gap-2"
          style={{
            color: currentCategoryId === category.id ? "var(--accent)" : "var(--text-primary)",
          }}
        >
          {currentCategoryId === category.id && (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M20 6L9 17l-5-5" />
            </svg>
          )}
          <span className={currentCategoryId === category.id ? "font-medium" : ""}>{category.name}</span>
        </button>
      ))}
      <button
        type="button"
        onClick={() => {
          onSelect(null);
          onClose();
        }}
        className="w-full text-left px-3 py-2 text-sm hover:bg-accent/10 transition-colors border-t border-border/50"
        style={{
          color: currentCategoryId === null ? "var(--accent)" : "var(--text-secondary)",
        }}
      >
        Без категории
      </button>
    </div>
  );
}

const LONG_PRESS_MS = 400;

export function MessageList({ messages, categories, onDelete, onUpdateCategory }: MessageListProps) {
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const [categoryOpenId, setCategoryOpenId] = useState<number | null>(null);
  const [contextMenuMessageId, setContextMenuMessageId] = useState<number | null>(null);
  const isMobile = useIsMobile();
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const closeContextMenu = () => setContextMenuMessageId(null);

  return (
    <div className="flex flex-col gap-3 p-4">
      <AnimatePresence mode="popLayout">
        {messages.map((message, index) => {
          const urls = extractUrls(message.content);
          const isCategoryOpen = categoryOpenId === message.id;

          return (
            <motion.div
              key={message.id}
              data-message-id={message.id}
              layout
              initial={{ opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2, delay: Math.min(index * 0.03, 0.3) }}
              className="relative"
              onMouseEnter={() => !isMobile && setHoveredId(message.id)}
              onMouseLeave={() => {
                if (!isMobile) setHoveredId(null);
                if (longPressTimerRef.current) {
                  clearTimeout(longPressTimerRef.current);
                  longPressTimerRef.current = null;
                }
              }}
              onPointerDown={() => {
                if (!isMobile) return;
                longPressTimerRef.current = setTimeout(() => {
                  longPressTimerRef.current = null;
                  setContextMenuMessageId(message.id);
                }, LONG_PRESS_MS);
              }}
              onPointerUp={() => {
                if (!isMobile) return;
                if (longPressTimerRef.current) {
                  clearTimeout(longPressTimerRef.current);
                  longPressTimerRef.current = null;
                }
              }}
              onPointerLeave={() => {
                if (!isMobile) return;
                if (longPressTimerRef.current) {
                  clearTimeout(longPressTimerRef.current);
                  longPressTimerRef.current = null;
                }
              }}
              onPointerCancel={() => {
                if (longPressTimerRef.current) {
                  clearTimeout(longPressTimerRef.current);
                  longPressTimerRef.current = null;
                }
              }}
            >
              {/* Telegram-style message bubble */}
              <div className="relative max-w-[85%] sm:max-w-[75%] ml-auto p-4 rounded-2xl shadow-sm"
                   style={{
                     backgroundColor: "var(--accent-muted)",
                     border: "1px solid var(--accent)",
                   }}>
                {/* Message content */}
                <div className="prose prose-sm max-w-none text-text-primary"
                     style={{
                       "--tw-prose-body": "var(--text-primary)",
                       "--tw-prose-headings": "var(--text-primary)",
                       "--tw-prose-links": "var(--accent)",
                       "--tw-prose-bold": "var(--text-primary)",
                       "--tw-prose-code": "var(--text-primary)",
                     } as React.CSSProperties}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {message.content}
                  </ReactMarkdown>
                </div>

                {/* Link previews */}
                {urls.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {urls.map((url, idx) => (
                      <LinkPreview key={idx} url={url} />
                    ))}
                  </div>
                )}

                {/* Category badge — clickable to change category */}
                <div className="mt-2 flex items-center gap-2 flex-wrap">
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setCategoryOpenId(isCategoryOpen ? null : message.id)}
                      className="text-xs px-2 py-0.5 rounded-full font-medium cursor-pointer hover:opacity-80 active:opacity-70 transition-opacity inline-flex items-center gap-1"
                      style={{
                        backgroundColor: "var(--surface-elevated)",
                        color: "var(--text-secondary)",
                      }}
                      title="Изменить категорию"
                    >
                      {getCategoryName(message.category_id, categories)}
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="opacity-70">
                        <path d="M6 9l6 6 6-6" />
                      </svg>
                    </button>
                    {/* Category selector dropdown — upward for last message */}
                    <AnimatePresence>
                      {isCategoryOpen && (
                        <motion.div
                          initial={{ opacity: 0, y: index === messages.length - 1 ? 4 : -4, scale: 0.97 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: index === messages.length - 1 ? 4 : -4, scale: 0.97 }}
                          transition={{ duration: 0.15 }}
                          className={`absolute left-0 z-30 ${index === messages.length - 1 ? "bottom-full mb-1" : "top-full mt-1"}`}
                        >
                          <CategorySelector
                            currentCategoryId={message.category_id}
                            categories={categories}
                            onSelect={(categoryId) => onUpdateCategory(message.id, categoryId)}
                            onClose={() => setCategoryOpenId(null)}
                          />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                  <span className="text-xs text-text-muted/70">
                    {formatTime(message.created_at)}
                  </span>
                </div>

                {/* Delete button — desktop hover only; mobile uses BottomSheet menu */}
                {!isMobile && (
                  <div className="absolute -bottom-1 -right-1">
                    <AnimatePresence>
                      {hoveredId === message.id && (
                        <motion.button
                          type="button"
                          onClick={() => onDelete(message.id)}
                          className="p-2 rounded-lg text-text-muted hover:text-error hover:bg-error/20 transition-colors"
                          whileHover={{ scale: 1.1 }}
                          whileTap={{ scale: 0.9 }}
                          title="Удалить"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M18 6L6 18M6 6l12 12" />
                          </svg>
                        </motion.button>
                      )}
                    </AnimatePresence>
                  </div>
                )}

              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>

      {/* Mobile long-press menu */}
      {isMobile && contextMenuMessageId != null && (
        <BottomSheet
          open
          onClose={closeContextMenu}
          title="Действия с сообщением"
          maxHeight="50dvh"
        >
          <div className="p-4 space-y-1">
            <button
              type="button"
              className="touch-target-48 w-full text-left px-4 py-3 rounded-xl text-text-secondary hover:bg-accent-muted transition-all duration-200 active:scale-[0.99] flex items-center gap-3"
              onClick={() => {
                setCategoryOpenId(contextMenuMessageId);
                closeContextMenu();
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
              Изменить категорию
            </button>
            <button
              type="button"
              className="touch-target-48 w-full text-left px-4 py-3 rounded-xl text-error hover:bg-error/10 transition-all duration-200 active:scale-[0.99] flex items-center gap-3"
              onClick={() => {
                onDelete(contextMenuMessageId);
                closeContextMenu();
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                <line x1="10" y1="11" x2="10" y2="17" />
                <line x1="14" y1="11" x2="14" y2="17" />
              </svg>
              Удалить
            </button>
          </div>
        </BottomSheet>
      )}
    </div>
  );
}
