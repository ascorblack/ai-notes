import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, TagBrief, TagResponse } from "../../api/client";
import { useAuthStore } from "../../store/authStore";

interface TagInputProps {
  noteId: number;
  tags: TagBrief[];
}

const TAG_COLORS = [
  "#EF4444", // red
  "#F97316", // orange
  "#EAB308", // yellow
  "#22C55E", // green
  "#14B8A6", // teal
  "#3B82F6", // blue
  "#8B5CF6", // violet
  "#EC4899", // pink
  "#6B7280", // gray
];

function getRandomColor() {
  return TAG_COLORS[Math.floor(Math.random() * TAG_COLORS.length)];
}

export function TagInput({ noteId, tags }: TagInputProps) {
  const token = useAuthStore((s) => s.token);
  const [inputValue, setInputValue] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const qc = useQueryClient();

  const { data: allTags = [] } = useQuery({
    queryKey: ["tags"],
    queryFn: () => api.tags.list(token!),
    enabled: !!token,
  });

  const setNoteTagsMutation = useMutation({
    mutationFn: (tagIds: number[]) => api.tags.setNoteTags(token!, noteId, tagIds),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["note", noteId] });
    },
  });

  const createTagMutation = useMutation({
    mutationFn: (name: string) => api.tags.create(token!, { name, color: getRandomColor() }),
    onSuccess: (newTag) => {
      const currentIds = tags.map((t) => t.id);
      setNoteTagsMutation.mutate([...currentIds, newTag.id]);
      setInputValue("");
      setShowDropdown(false);
      qc.invalidateQueries({ queryKey: ["tags"] });
    },
  });

  const filteredTags = useMemo(() => {
    if (!inputValue) return allTags;
    const lower = inputValue.toLowerCase();
    return allTags.filter((t) => t.name.toLowerCase().includes(lower));
  }, [allTags, inputValue]);

  const existingTagNames = useMemo(() => {
    return new Set(allTags.map((t) => t.name.toLowerCase()));
  }, [allTags]);

  const currentTagIds = useMemo(() => tags.map((t) => t.id), [tags]);

  const handleAddTag = (tag: TagResponse) => {
    if (!currentTagIds.includes(tag.id)) {
      setNoteTagsMutation.mutate([...currentTagIds, tag.id]);
    }
    setInputValue("");
    setShowDropdown(false);
  };

  const handleCreateTag = () => {
    const name = inputValue.trim();
    if (name && !existingTagNames.has(name.toLowerCase())) {
      createTagMutation.mutate(name);
    }
  };

  const handleRemoveTag = (tagId: number) => {
    const newIds = currentTagIds.filter((id) => id !== tagId);
    setNoteTagsMutation.mutate(newIds);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const exactMatch = filteredTags.find(
        (t) => t.name.toLowerCase() === inputValue.toLowerCase()
      );
      if (exactMatch) {
        handleAddTag(exactMatch);
      } else if (inputValue.trim()) {
        handleCreateTag();
      }
    } else if (e.key === "Escape") {
      setShowDropdown(false);
      setInputValue("");
    }
  };

  return (
    <div className="relative">
      <div className="flex flex-wrap gap-1.5 items-center">
        {tags.map((tag) => (
          <span
            key={tag.id}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
            style={{
              backgroundColor: tag.color ? `${tag.color}20` : "#6B728020",
              color: tag.color || "#6B7280",
            }}
          >
            {tag.name}
            <button
              onClick={() => handleRemoveTag(tag.id)}
              className="hover:opacity-70 ml-0.5"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </span>
        ))}
        <input
          type="text"
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value);
            setShowDropdown(true);
          }}
          onFocus={() => setShowDropdown(true)}
          onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
          onKeyDown={handleKeyDown}
          placeholder={tags.length === 0 ? "Add tags..." : ""}
          className="text-xs bg-transparent border-none outline-none min-w-[60px] text-[var(--text-secondary)] placeholder:text-[var(--text-muted)]"
        />
      </div>

      {showDropdown && inputValue && (
        <div className="absolute top-full left-0 mt-1 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg shadow-lg z-50 min-w-[150px] max-h-48 overflow-y-auto">
          {filteredTags.length > 0 ? (
            filteredTags.map((tag) => (
              <button
                key={tag.id}
                onClick={() => handleAddTag(tag)}
                disabled={currentTagIds.includes(tag.id)}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-[var(--bg-hover)] flex items-center gap-2 ${
                  currentTagIds.includes(tag.id) ? "opacity-50 cursor-not-allowed" : ""
                }`}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: tag.color || "#6B7280" }}
                />
                {tag.name}
              </button>
            ))
          ) : (
            <button
              onClick={handleCreateTag}
              className="w-full text-left px-3 py-2 text-sm hover:bg-[var(--bg-hover)]"
            >
              Create "{inputValue}"
            </button>
          )}
        </div>
      )}
    </div>
  );
}
