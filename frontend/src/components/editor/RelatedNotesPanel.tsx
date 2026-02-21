import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "../../store/authStore";
import { api } from "../../api/client";
import { useTreeStore } from "../../store/treeStore";

interface RelatedNotesPanelProps {
  noteId: number;
  onNoteClick?: (id: number) => void;
  /** When set, show "Добавить связь" to insert [[Title]] into note (edit mode) */
  onInsertWikilink?: (wikilink: string) => void;
}

export function RelatedNotesPanel({ noteId, onNoteClick, onInsertWikilink }: RelatedNotesPanelProps) {
  const token = useAuthStore((s) => s.token);
  const setSelectedNote = useTreeStore((s) => s.setSelectedNote);

  const { data: backlinks } = useQuery({
    queryKey: ["backlinks", noteId, token],
    queryFn: () => api.notes.backlinks(token!, noteId),
    enabled: !!token && !!noteId,
  });
  const { data: related } = useQuery({
    queryKey: ["related", noteId, token],
    queryFn: () => api.notes.related(token!, noteId, 5),
    enabled: !!token && !!noteId,
  });

  const handleClick = (id: number) => {
    setSelectedNote(id);
    onNoteClick?.(id);
  };

  const hasContent = (backlinks?.length ?? 0) > 0 || (related?.length ?? 0) > 0;
  if (!hasContent) return null;

  return (
    <div className="border-t border-border/60 pt-4 mt-4">
      <div className="text-xs font-medium uppercase tracking-wider text-text-muted mb-2">Связи</div>
      <div className="space-y-2">
        {backlinks && backlinks.length > 0 && (
          <div>
            <div className="text-xs text-text-muted mb-1">Ссылаются</div>
            <div className="flex flex-wrap gap-1">
              {backlinks.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => handleClick(b.id)}
                  className="px-2 py-1 rounded-lg bg-accent-muted/50 hover:bg-accent-muted text-accent text-sm transition-colors"
                >
                  {b.title}
                </button>
              ))}
            </div>
          </div>
        )}
        {related && related.length > 0 && (
          <div>
            <div className="text-xs text-text-muted mb-1">Похожие</div>
            <div className="flex flex-wrap gap-1">
              {related.map((r) => (
                <span key={r.id} className="inline-flex gap-0.5">
                  <button
                    type="button"
                    onClick={() => handleClick(r.id)}
                    className="px-2 py-1 rounded-lg bg-bg hover:bg-accent-muted/50 text-text-secondary text-sm transition-colors"
                  >
                    {r.title}
                  </button>
                  {onInsertWikilink && (
                    <button
                      type="button"
                      onClick={() => onInsertWikilink(`[[${r.title}]]`)}
                      className="px-2 py-1 rounded-lg bg-accent/20 hover:bg-accent/30 text-accent text-xs transition-colors"
                      title="Добавить связь"
                    >
                      +
                    </button>
                  )}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
