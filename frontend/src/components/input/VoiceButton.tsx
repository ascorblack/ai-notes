import { useRef, useState } from "react";
import { motion } from "framer-motion";
import { api } from "../../api/client";
import { useAuthStore } from "../../store/authStore";

interface VoiceButtonProps {
  onTranscription: (text: string) => void;
  onError?: (message: string) => void;
  disabled?: boolean;
}

export function VoiceButton({ onTranscription, onError, disabled }: VoiceButtonProps) {
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
      className="relative touch-target-48 p-2.5 sm:p-3 rounded-xl bg-surface border border-border hover:bg-accent-muted disabled:opacity-50 transition-colors min-h-[2.5rem] min-w-[2.5rem] sm:min-h-0 sm:min-w-0 shrink-0 flex items-center justify-center"
      title={recording ? "Stop recording" : "Start voice input"}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
    >
      {recording ? (
        <motion.span
          className="absolute inset-0 rounded-xl bg-accent/20"
          animate={{ scale: [1, 1.05, 1], opacity: [0.5, 0.8, 0.5] }}
          transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
        />
      ) : null}
      <span className="relative text-accent text-lg">
        {loading ? "…" : recording ? "⏹" : "🎤"}
      </span>
    </motion.button>
  );
}
