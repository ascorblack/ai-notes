import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "../api/client";
import { useTreeStore } from "../store/treeStore";

interface SearchBarProps {
  token: string;
  onNoteSelect?: () => void;
}

interface SearchResult {
  id: number;
  title: string;
  folder_id: number | null;
  snippet: string;
}

const DEBOUNCE_MS = 300;

type SearchTypeFilter = "all" | "note" | "task";

export function SearchBar({ token, onNoteSelect }: SearchBarProps) {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<SearchTypeFilter>("all");
  const [focused, setFocused] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const setSelectedNote = useTreeStore((s) => s.setSelectedNote);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query]);

  const filters =
    typeFilter !== "all"
      ? { type: typeFilter as "note" | "task" }
      : undefined;

  const { data: results = [], isLoading } = useQuery({
    queryKey: ["search", debouncedQuery, token, filters],
    queryFn: () => api.search.query(token, debouncedQuery, 10, filters),
    enabled: debouncedQuery.length >= 2 && !!token,
  });

  const showDropdown = focused && debouncedQuery.length >= 2;
  const list = results as SearchResult[];

  const handleSelect = useCallback(
    (r: SearchResult) => {
      setSelectedNote(r.id);
      setQuery("");
      setDebouncedQuery("");
      setFocused(false);
      onNoteSelect?.();
    },
    [setSelectedNote, onNoteSelect]
  );

  useEffect(() => {
    setSelectedIdx(0);
  }, [debouncedQuery, list.length]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!showDropdown || list.length === 0) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIdx((i) => (i + 1) % list.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIdx((i) => (i - 1 + list.length) % list.length);
      } else if (e.key === "Enter") {
        e.preventDefault();
        handleSelect(list[selectedIdx]);
      } else if (e.key === "Escape") {
        setFocused(false);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [showDropdown, list, selectedIdx, handleSelect]);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setFocused(false);
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  return (
    <div ref={containerRef} className="relative w-full max-w-md min-w-0">
      <div className="relative">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          placeholder="Поиск по заметкам…"
          aria-label="Поиск"
          className="w-full px-3 py-2 pl-9 rounded-lg bg-bg/80 border border-border/60 text-text-primary placeholder:text-text-muted text-sm focus:outline-none focus:ring-1 focus:ring-accent focus:border-accent/50"
        />
        <svg
          className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          viewBox="0 0 24 24"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.35-4.35" />
        </svg>
      </div>
      <AnimatePresence>
        {showDropdown && (
          <motion.div
            className="absolute top-full left-0 right-0 mt-1 rounded-lg border border-border bg-surface shadow-xl overflow-hidden z-[100] max-h-80 overflow-y-auto"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
          >
            <div className="flex gap-1 px-3 py-2 border-b border-border shrink-0">
              {(["all", "note", "task"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTypeFilter(t)}
                  className={`px-2 py-1 text-xs rounded transition-colors ${
                    typeFilter === t ? "bg-accent text-white" : "text-text-muted hover:bg-accent-muted"
                  }`}
                >
                  {t === "all" ? "Все" : t === "note" ? "Заметки" : "Задачи"}
                </button>
              ))}
            </div>
            {isLoading ? (
              <div className="px-4 py-6 text-center text-text-muted text-sm">
                <span className="inline-block w-2 h-2 rounded-full bg-accent animate-pulse mr-2" />
                Поиск…
              </div>
            ) : list.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <p className="text-text-muted text-sm">Ничего не найдено по запросу «{debouncedQuery}»</p>
                <p className="text-text-muted text-xs mt-1">Попробуйте другой запрос или создайте заметку</p>
              </div>
            ) : (
              <ul className="py-1">
                {list.map((r, i) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => handleSelect(r)}
                      className={`w-full text-left px-4 py-2.5 hover:bg-accent-muted/50 transition-colors ${
                        i === selectedIdx ? "bg-accent-muted/50" : ""
                      }`}
                    >
                      <div className="font-medium text-text-primary truncate">{r.title}</div>
                      {r.snippet && (
                        <div className="text-xs text-text-muted truncate mt-0.5">{r.snippet}</div>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
