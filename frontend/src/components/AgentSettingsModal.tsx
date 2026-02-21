import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { useIsMobile } from "../hooks/useIsMobile";
import { useRegisterOverlay } from "../hooks/useRegisterOverlay";
import { BottomSheet } from "./ui/BottomSheet";

interface AgentSettingsModalProps {
  open: boolean;
  onClose: () => void;
  token: string;
}

interface AgentSettingsPatch {
  base_url?: string;
  model?: string;
  api_key?: string;
  temperature?: number;
  frequency_penalty?: number;
  top_p?: number;
  max_tokens?: number;
}

type TestStatus = "idle" | "loading" | "ok" | "error";

const inputBase =
  "w-full px-4 py-2.5 rounded-xl border border-border/60 bg-surface text-text-primary placeholder:text-text-muted/70 focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent transition-colors";

function SettingsSection({
  title,
  token,
  agent,
  onSaved,
}: {
  title: string;
  token: string;
  agent: "notes" | "chat";
  onSaved?: () => void;
}) {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["agent-settings", agent, token],
    queryFn: () => api.agent.getSettings(token, agent),
    enabled: !!token,
  });

  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [apiKeyDirty, setApiKeyDirty] = useState(false);
  const [temp, setTemp] = useState(0.7);
  const [freq, setFreq] = useState(0);
  const [topP, setTopP] = useState(1);
  const [maxTok, setMaxTok] = useState(16384);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [testStatus, setTestStatus] = useState<TestStatus>("idle");
  const [testMessage, setTestMessage] = useState<string | null>(null);

  useEffect(() => {
    if (data) {
      setBaseUrl(data.base_url);
      setModel(data.model);
      setApiKey("");
      setApiKeyDirty(false);
      setTemp(data.temperature);
      setFreq(data.frequency_penalty);
      setTopP(data.top_p);
      setMaxTok(data.max_tokens);
      setTestStatus("idle");
      setTestMessage(null);
    }
  }, [data]);

  const mutation = useMutation({
    mutationFn: (payload: AgentSettingsPatch) => api.agent.patchSettings(token, agent, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agent-settings", agent] });
      onSaved?.();
    },
  });

  const testMutation = useMutation({
    mutationFn: () =>
      api.agent.testConnection(token, agent, {
        base_url: baseUrl.trim() || undefined,
        model: model.trim() || undefined,
        api_key: apiKeyDirty ? (apiKey || undefined) : undefined,
      }),
    onMutate: () => {
      setTestStatus("loading");
      setTestMessage(null);
    },
    onSuccess: (res) => {
      if (res.ok) {
        setTestStatus("ok");
        setTestMessage("Подключение успешно");
      } else {
        setTestStatus("error");
        setTestMessage(res.message ?? "Неизвестная ошибка");
      }
    },
    onError: (err) => {
      setTestStatus("error");
      setTestMessage(err instanceof Error ? err.message : "Ошибка проверки");
    },
  });

  const handleSave = () => {
    const payload: AgentSettingsPatch = {
      base_url: baseUrl.trim(),
      model: model.trim(),
      temperature: temp,
      frequency_penalty: freq,
      top_p: topP,
      max_tokens: maxTok,
    };
    if (apiKeyDirty) {
      payload.api_key = apiKey;
    }
    mutation.mutate(payload);
  };

  const handleTest = () => {
    if (!baseUrl.trim() || !model.trim()) {
      setTestStatus("error");
      setTestMessage("Заполните Base URL и модель");
      return;
    }
    testMutation.mutate();
  };

  if (isLoading && !data) {
    return (
      <div className="py-6 flex items-center gap-2 text-text-muted">
        <span className="inline-block w-3 h-3 rounded-full bg-accent animate-pulse" />
        <span className="text-sm">Загрузка…</span>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <h3 className="text-base font-semibold text-text-primary">{title}</h3>

      <div className="space-y-4">
        <div className="rounded-xl pl-4 border-l-2 border-accent/60 bg-accent-muted/20 p-4 space-y-4">
          <p className="text-sm text-text-secondary">Подключение к модели</p>
          <div>
            <label htmlFor={`base-url-${agent}`} className="block text-sm font-medium text-text-secondary mb-1.5">
              Base URL
            </label>
            <input
              id={`base-url-${agent}`}
              type="url"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://api.example.com/v1"
              className={inputBase}
              autoComplete="off"
            />
          </div>
          <div>
            <label htmlFor={`model-${agent}`} className="block text-sm font-medium text-text-secondary mb-1.5">
              Модель
            </label>
            <input
              id={`model-${agent}`}
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="Qwen3-30B-Instruct"
              className={inputBase}
              autoComplete="off"
            />
          </div>
          <div>
            <label htmlFor={`api-key-${agent}`} className="block text-sm font-medium text-text-secondary mb-1.5">
              API ключ
            </label>
            <input
              id={`api-key-${agent}`}
              type="password"
              value={apiKey}
              onChange={(e) => {
                setApiKey(e.target.value);
                setApiKeyDirty(true);
              }}
              placeholder={data?.api_key_set ? "•••••••• — оставьте пустым, чтобы не менять" : "Опционально для локальных серверов"}
              className={inputBase}
              autoComplete="new-password"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button
              type="button"
              onClick={handleTest}
              disabled={testMutation.isPending}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-bg border border-border hover:bg-accent-muted/50 hover:border-accent/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {testMutation.isPending ? (
                <>
                  <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  Проверка…
                </>
              ) : (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                    <polyline points="22 4 12 14.01 9 11.01" />
                  </svg>
                  Проверить подключение
                </>
              )}
            </button>
            <AnimatePresence mode="wait">
              {testStatus === "ok" && (
                <motion.span
                  initial={{ opacity: 0, x: -4 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0 }}
                  className="inline-flex items-center gap-1.5 text-sm text-green-600 dark:text-green-400"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                    <polyline points="22 4 12 14.01 9 11.01" />
                  </svg>
                  {testMessage}
                </motion.span>
              )}
              {testStatus === "error" && testMessage && (
                <motion.div
                  initial={{ opacity: 0, x: -4 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0 }}
                  className="flex-1 min-w-0"
                >
                  <div className="inline-flex items-start gap-1.5 text-sm text-error">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 mt-0.5">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="8" x2="12" y2="12" />
                      <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                    <span>{testMessage}</span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        <div>
          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary transition-colors"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className={`transition-transform ${showAdvanced ? "rotate-90" : ""}`}
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
            Дополнительные параметры
          </button>
          <AnimatePresence>
            {showAdvanced && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="mt-3 pl-4 border-l-2 border-accent/60 bg-accent-muted/20 rounded-xl py-3 px-3 grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs text-text-muted mb-1">Temperature (0–2)</label>
                    <input
                      type="number"
                      min={0}
                      max={2}
                      step={0.1}
                      value={temp}
                      onChange={(e) => setTemp(parseFloat(e.target.value) || 0)}
                      className={inputBase}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-text-muted mb-1">Frequency penalty</label>
                    <input
                      type="number"
                      min={0}
                      max={2}
                      step={0.1}
                      value={freq}
                      onChange={(e) => setFreq(parseFloat(e.target.value) || 0)}
                      className={inputBase}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-text-muted mb-1">Top P (0–1)</label>
                    <input
                      type="number"
                      min={0}
                      max={1}
                      step={0.05}
                      value={topP}
                      onChange={(e) => setTopP(parseFloat(e.target.value) || 0)}
                      className={inputBase}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-text-muted mb-1">Max tokens</label>
                    <input
                      type="number"
                      min={256}
                      max={65536}
                      step={512}
                      value={maxTok}
                      onChange={(e) => setMaxTok(parseInt(e.target.value, 10) || 16384)}
                      className={inputBase}
                    />
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <button
          type="button"
          onClick={handleSave}
          disabled={mutation.isPending}
          className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-accent text-bg font-medium hover:bg-accent/90 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {mutation.isPending ? "Сохранение…" : "Сохранить"}
        </button>
      </div>
    </div>
  );
}

export function AgentSettingsModal({ open, onClose, token }: AgentSettingsModalProps) {
  const isMobile = useIsMobile();
  useRegisterOverlay(open, onClose);

  const content = (
    <div className="space-y-8">
      <div>
        <SettingsSection title="Агент заметок" token={token} agent="notes" />
      </div>
      <div className="pt-4 border-t border-border/50">
        <SettingsSection title="Агент обсуждений" token={token} agent="chat" />
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <BottomSheet open={open} onClose={onClose} title="Настройки агентов" maxHeight="90dvh">
        <div className="p-4">{content}</div>
      </BottomSheet>
    );
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-[60] bg-modal-overlay backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            aria-hidden={!open}
          />
          <motion.div
            className="fixed inset-0 z-[60] flex items-center justify-center p-4 pointer-events-none"
            aria-hidden={!open}
          >
            <motion.div
              className="pointer-events-auto w-full max-w-xl max-h-[88vh] flex flex-col rounded-2xl overflow-hidden shadow-2xl border border-l-4 border-accent/50 border-border bg-modal-panel backdrop-blur-md"
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              transition={{ type: "spring", damping: 25, stiffness: 400 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-border/60 flex-shrink-0">
                <h2 className="text-lg font-semibold text-text-primary">Подключение к моделям</h2>
                <button
                  type="button"
                  onClick={onClose}
                  className="touch-target-48 p-2 rounded-xl text-text-muted hover:text-text-primary hover:bg-accent-muted/50 transition-colors -mr-2"
                  aria-label="Закрыть"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="flex-1 min-h-0 p-5 overflow-auto">{content}</div>
            </motion.div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
