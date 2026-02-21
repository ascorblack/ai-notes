import { useState } from "react";
import { useAuthStore } from "../store/authStore";
import { api } from "../api/client";
import { useAppModalsStore } from "../store/appModalsStore";

export function ExportObsidianButton() {
  const token = useAuthStore((s) => s.token);
  const setMoreSheetOpen = useAppModalsStore((s) => s.setMoreSheetOpen);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleExport = async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      await api.export.obsidianVault(token);
      setMoreSheetOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      className="touch-target-48 w-full text-left px-4 py-3 rounded-xl text-text-primary hover:bg-accent-muted flex items-center gap-3 disabled:opacity-50"
      onClick={handleExport}
      disabled={loading}
    >
      {loading ? (
        <span>Экспорт…</span>
      ) : (
        <span>Экспорт в Obsidian (zip)</span>
      )}
      {error && <span className="text-error text-sm">{error}</span>}
    </button>
  );
}
