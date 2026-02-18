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

const inputCls =
  "w-full px-3 py-2 rounded-lg border border-border/60 bg-bg text-text-primary focus:outline-none focus:ring-1 focus:ring-accent";

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
    }
  }, [data]);

  const mutation = useMutation({
    mutationFn: (payload: AgentSettingsPatch) => api.agent.patchSettings(token, agent, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agent-settings", agent] });
      onSaved?.();
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

  if (isLoading && !data) {
    return (
      <div className="py-4 text-text-muted text-sm">
        <span className="inline-block w-2 h-2 rounded-full bg-accent animate-pulse mr-2" />
        Загрузка…
      </div>
    );
  }

  return (
    <div className="space-y-4 py-3">
      <h3 className="text-sm font-medium text-text-primary">{title}</h3>
      <div className="grid gap-3 text-sm">
        <div>
          <label className="block text-text-secondary mb-1">Base URL</label>
          <input
            type="url"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://…/v1"
            className={inputCls}
          />
        </div>
        <div>
          <label className="block text-text-secondary mb-1">Модель</label>
          <input
            type="text"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="Qwen3-30B-…"
            className={inputCls}
          />
        </div>
        <div>
          <label className="block text-text-secondary mb-1">API ключ</label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => {
              setApiKey(e.target.value);
              setApiKeyDirty(true);
            }}
            placeholder={
              data?.api_key_set ? "Оставьте пустым чтобы не менять" : "Опционально"
            }
            autoComplete="off"
            className={inputCls}
          />
        </div>
        <div>
          <label className="block text-text-secondary mb-1">Temperature (0–2)</label>
          <input
            type="number"
            min={0}
            max={2}
            step={0.1}
            value={temp}
            onChange={(e) => setTemp(parseFloat(e.target.value) || 0)}
            className={inputCls}
          />
        </div>
        <div>
          <label className="block text-text-secondary mb-1">Frequency penalty (0–2)</label>
          <input
            type="number"
            min={0}
            max={2}
            step={0.1}
            value={freq}
            onChange={(e) => setFreq(parseFloat(e.target.value) || 0)}
            className={inputCls}
          />
        </div>
        <div>
          <label className="block text-text-secondary mb-1">Top P (0–1)</label>
          <input
            type="number"
            min={0}
            max={1}
            step={0.05}
            value={topP}
            onChange={(e) => setTopP(parseFloat(e.target.value) || 0)}
            className={inputCls}
          />
        </div>
        <div>
          <label className="block text-text-secondary mb-1">Max tokens</label>
          <input
            type="number"
            min={256}
            max={65536}
            step={512}
            value={maxTok}
            onChange={(e) => setMaxTok(parseInt(e.target.value, 10) || 16384)}
            className={inputCls}
          />
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={mutation.isPending}
          className="px-4 py-2 rounded-lg bg-accent text-bg font-medium hover:opacity-90 disabled:opacity-50"
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

  if (isMobile) {
    return (
      <BottomSheet open={open} onClose={onClose} title="Настройки агентов" maxHeight="90dvh">
        <div className="p-4 space-y-6">
          <div className="border-b border-border/40 pb-4">
            <SettingsSection title="Агент заметок" token={token} agent="notes" />
          </div>
          <div>
            <SettingsSection title="Агент обсуждений" token={token} agent="chat" />
          </div>
        </div>
      </BottomSheet>
    );
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            aria-hidden={!open}
          />
          <motion.div
            className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-4 pointer-events-none"
            aria-hidden={!open}
          >
            <motion.div
              className="pointer-events-auto w-full max-w-lg max-h-[85vh] flex flex-col rounded-xl border border-border/60 overflow-hidden"
            style={{
              backgroundColor: "var(--surface-elevated)",
              boxShadow: "0 25px 50px -12px rgba(0,0,0,0.5)",
            }}
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.2 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-border/60 flex-shrink-0">
              <h2 className="text-lg font-medium text-text-primary">Настройки агентов</h2>
              <button
                type="button"
                onClick={onClose}
                className="touch-target-48 p-2 rounded-lg text-text-secondary hover:text-accent hover:bg-accent-muted transition-colors"
                aria-label="Закрыть"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 min-h-0 p-4 overflow-auto space-y-6">
              <div className="border-b border-border/40 pb-4">
                <SettingsSection title="Агент заметок" token={token} agent="notes" />
              </div>
              <div>
                <SettingsSection title="Агент обсуждений" token={token} agent="chat" />
              </div>
            </div>
            </motion.div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
