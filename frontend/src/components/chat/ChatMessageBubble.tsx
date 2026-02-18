import { useState } from "react";
import { motion } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface ChatMessageBubbleProps {
  id: number;
  role: string;
  content: string;
  onCopy: (content: string) => void;
  onDelete: (messageId: number) => void;
  onRegenerate?: (messageId: number) => void;
}

export function ChatMessageBubble({
  id,
  role,
  content,
  onCopy,
  onDelete,
  onRegenerate,
}: ChatMessageBubbleProps) {
  const [hover, setHover] = useState(false);
  const isUser = role === "user";

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="group w-full px-4 py-1"
    >
      {isUser ? (
        /* User message — right-aligned bubble */
        <div className="flex flex-col items-end gap-1">
          <div className="max-w-[80%] px-4 py-2.5 rounded-2xl bg-[var(--surface)] border border-[var(--border)] text-[var(--text-primary)] text-sm leading-relaxed whitespace-pre-wrap">
            {content}
          </div>
          <div className={`flex gap-0.5 transition-opacity ${hover ? "opacity-100" : "opacity-0"}`}>
            <button type="button" onClick={() => onCopy(content)} className="touch-target-48 p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--accent)] hover:bg-[var(--accent-muted)] transition-colors" aria-label="Копировать" title="Копировать">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            </button>
            <button type="button" onClick={() => onDelete(id)} className="touch-target-48 p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--error)] hover:bg-[var(--error)]/10 transition-colors" aria-label="Удалить" title="Удалить">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
            </button>
          </div>
        </div>
      ) : (
        /* Assistant message — left-aligned, bordered block, full width to the right */
        <div className="flex flex-col items-start gap-1 w-full">
          <div className="flex items-start gap-3 w-full">
            <div className="w-7 h-7 rounded-full bg-[var(--accent)] flex-shrink-0 flex items-center justify-center mt-0.5 text-white">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z"/></svg>
            </div>
            <div className="flex-1 min-w-0 border border-[var(--border)] rounded-xl px-4 py-3 bg-[var(--surface)]">
              <div className="prose dark:prose-invert prose-sm max-w-none text-[var(--text-primary)] [&_p:last-child]:mb-0 [&_p]:leading-relaxed">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{content || "(пусто)"}</ReactMarkdown>
              </div>
            </div>
          </div>
          <div className={`flex gap-0.5 pl-10 transition-opacity ${hover ? "opacity-100" : "opacity-0"}`}>
            <button type="button" onClick={() => onCopy(content)} className="touch-target-48 p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--accent)] hover:bg-[var(--accent-muted)] transition-colors" aria-label="Копировать" title="Копировать">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            </button>
            <button type="button" onClick={() => onDelete(id)} className="touch-target-48 p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--error)] hover:bg-[var(--error)]/10 transition-colors" aria-label="Удалить" title="Удалить">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
            </button>
            {onRegenerate && (
              <button type="button" onClick={() => onRegenerate(id)} className="touch-target-48 p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--accent)] hover:bg-[var(--accent-muted)] transition-colors" aria-label="Регенерировать" title="Регенерировать">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 4v6h-6"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg>
              </button>
            )}
          </div>
        </div>
      )}
    </motion.div>
  );
}
