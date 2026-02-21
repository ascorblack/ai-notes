import { useRef, useState } from "react";
import { motion } from "framer-motion";
import { api } from "../../api/client";
import { useAuthStore } from "../../store/authStore";

interface VoiceButtonProps {
  onTranscription: (text: string) => void;
  onError?: (message: string) => void;
  disabled?: boolean;
  className?: string;
}

export function VoiceButton({ onTranscription, onError, disabled, className }: VoiceButtonProps) {
  const [recording, setRecording] = useState(false);
  const [loading, setLoading] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const token = useAuthStore((s) => s.token);

  const startRecording = async () => {
    if (!token) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((t) =>
        MediaRecorder.isTypeSupported(t)
      );
      const options = mimeType ? { mimeType } : {};
      const recorder = new MediaRecorder(stream, options);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        if (chunksRef.current.length === 0) return;
        setLoading(true);
        const blobType = recorder.mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type: blobType });
        const res = await api.transcribe(token, blob).catch((err: Error) => {
          onError?.(err.message);
          return null;
        });
        setLoading(false);
        if (res?.text) onTranscription(res.text);
      };
      recorder.onerror = () => {
        onError?.("Recording error");
      };
      recorder.start(1000);
      mediaRecorderRef.current = recorder;
      setRecording(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      onError?.(msg || "Microphone access failed");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && recording) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    }
    setRecording(false);
  };

  const handleClick = () => {
    if (recording) stopRecording();
    else startRecording();
  };

  if (!token) return null;

  return (
    <motion.button
      type="button"
      onClick={handleClick}
      disabled={disabled || loading}
      className={`relative touch-target-48 rounded-xl border border-border hover:bg-accent-muted disabled:opacity-50 transition-colors shrink-0 flex items-center justify-center ${className ?? ""}`.trim()}
      style={{ backgroundColor: "var(--surface-elevated)" }}
      title={recording ? "Остановить" : "Голосовой ввод"}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
    >
      {recording ? (
        <motion.span
          className="absolute inset-0 rounded-xl bg-accent/30"
          animate={{ scale: [1, 1.1, 1], opacity: [0.3, 0.6, 0.3] }}
          transition={{ duration: 1, repeat: Infinity, ease: "easeInOut" }}
        />
      ) : null}
      <span className="relative text-accent">
        {loading ? "…" : recording ? (
          <svg width={className?.includes("w-9") ? 16 : 20} height={className?.includes("w-9") ? 16 : 20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <rect x="6" y="4" width="4" height="16" rx="1" />
            <rect x="14" y="4" width="4" height="16" rx="1" />
          </svg>
        ) : (
          <svg width={className?.includes("w-9") ? 18 : 22} height={className?.includes("w-9") ? 18 : 22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" y1="19" x2="12" y2="23" />
            <line x1="8" y1="23" x2="16" y2="23" />
          </svg>
        )}
      </span>
    </motion.button>
  );
}
