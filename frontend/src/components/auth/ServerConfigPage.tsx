import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { setApiBase } from "../../lib/apiBase";

export function ServerConfigPage() {
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const trimmed = url.trim();
    if (!trimmed) {
      setError("Введите URL сервера");
      return;
    }
    let base: string;
    try {
      const parsed = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
      base = `${parsed.protocol}//${parsed.host}`;
    } catch {
      setError("Некорректный URL");
      return;
    }
    setApiBase(base);
    navigate("/login", { replace: true });
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center bg-bg px-4 py-6"
      style={{
        paddingTop: "max(1.5rem, env(safe-area-inset-top))",
        paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))",
        paddingLeft: "max(1rem, env(safe-area-inset-left))",
        paddingRight: "max(1rem, env(safe-area-inset-right))",
      }}
    >
      <motion.div
        className="w-full max-w-sm p-6 rounded-2xl bg-surface border border-border shadow-2xl"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <h1 className="text-xl font-semibold text-accent mb-2">AI Notes</h1>
        <p className="text-sm text-text-muted mb-4">
          Укажите адрес сервера для синхронизации. Работа офлайн будет доступна после первой загрузки данных.
        </p>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">URL сервера</label>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://notes.example.com"
              className="w-full px-4 py-3 rounded-xl bg-bg border border-border text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent/60"
              autoComplete="url"
              autoFocus
            />
          </div>
          {error && <p className="text-error text-sm">{error}</p>}
          <button
            type="submit"
            className="w-full py-3 rounded-xl bg-accent text-accent-fg font-semibold hover:opacity-90 active:scale-[0.99] transition"
          >
            Продолжить
          </button>
        </form>
      </motion.div>
    </div>
  );
}
