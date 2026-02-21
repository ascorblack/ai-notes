import { useState, useRef, useEffect } from "react";

interface Category {
  id: number;
  name: string;
}

interface CategoryFilterProps {
  categories: Category[];
  selectedCategoryId: number | null;
  onSelect: (id: number | null) => void;
}

export function CategoryFilter({ categories, selectedCategoryId, onSelect }: CategoryFilterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedCategory = categories.find(c => c.id === selectedCategoryId);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={dropdownRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="touch-target-48 flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-all"
        style={{
          backgroundColor: isOpen ? "var(--accent-muted)" : "var(--bg)",
          color: selectedCategoryId ? "var(--accent)" : "var(--text-secondary)",
          border: isOpen ? `1px solid var(--accent)` : `1px solid var(--border)`,
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0">
          <path d="M4 6h16M4 12h16M4 18h7" />
        </svg>
        <span className="truncate max-w-[120px]">
          {selectedCategory ? selectedCategory.name : "Все"}
        </span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          className={`shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`}
        >
          <path d="M6 9l6 6 6-6"/>
        </svg>
      </button>

      {isOpen && (
        <div
          className="absolute top-full right-0 mt-2 min-w-[160px] max-h-[250px] overflow-y-auto rounded-xl border border-border shadow-xl z-50 backdrop-blur-sm"
          style={{
            backgroundColor: "var(--surface-elevated)",
          }}
        >
          <div className="p-1.5">
            <button
              type="button"
              onClick={() => {
                onSelect(null);
                setIsOpen(false);
              }}
              className="w-full text-left px-3 py-2 text-sm rounded-lg font-medium transition-colors"
              style={{
                color: selectedCategoryId === null ? "var(--accent)" : "var(--text-primary)",
                backgroundColor: selectedCategoryId === null ? "var(--accent-muted)" : "transparent",
              }}
            >
              Все сообщения
            </button>
            <div className="my-1" style={{ borderTop: "1px solid var(--border-subtle)" }} />
            {categories.map((category) => (
              <button
                key={category.id}
                type="button"
                onClick={() => {
                  onSelect(category.id);
                  setIsOpen(false);
                }}
                className="w-full text-left px-3 py-2 text-sm rounded-lg font-medium transition-colors"
                style={{
                  color: selectedCategoryId === category.id ? "var(--accent)" : "var(--text-primary)",
                  backgroundColor: selectedCategoryId === category.id ? "var(--accent-muted)" : "transparent",
                }}
              >
                {category.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
