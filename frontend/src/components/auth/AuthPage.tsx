import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { api } from "../../api/client";
import { useAuthStore } from "../../store/authStore";

export function AuthPage() {
  const token = useAuthStore((s) => s.token);
  const [allowRegistration, setAllowRegistration] = useState(true);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const setToken = useAuthStore((s) => s.setToken);
  const navigate = useNavigate();

  useEffect(() => {
    if (token) navigate("/", { replace: true });
  }, [token, navigate]);

  useEffect(() => {
    api.auth.config().then((c) => setAllowRegistration(c.allow_registration));
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !password) {
      setError("Email and password required");
      return;
    }
    const fn = mode === "login" ? api.auth.login : api.auth.register;
    const res = await fn(email.trim(), password).catch((err: Error) => {
      setError(err.message);
      return null;
    });
    if (res) {
      setToken(res.access_token);
      navigate("/", { replace: true });
    }
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
        className="w-full max-w-sm p-4 sm:p-6 md:p-8 rounded-2xl bg-surface border border-border shadow-2xl"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      >
        <h1 className="text-xl sm:text-2xl font-semibold text-accent mb-6 sm:mb-8 tracking-tight">AI Notes</h1>
        <form onSubmit={submit} className="space-y-5">
          <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1, duration: 0.3 }}
          >
            <label className="block text-sm font-medium text-text-secondary mb-2">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-bg border border-border text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent/60 transition-colors"
              placeholder="you@example.com"
              autoComplete="email"
            />
          </motion.div>
          <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.15, duration: 0.3 }}
          >
            <label className="block text-sm font-medium text-text-secondary mb-2">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-bg border border-border text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent/60 transition-colors"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
            />
          </motion.div>
          {error && (
            <motion.p
              className="text-error text-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              {error}
            </motion.p>
          )}
          <motion.button
            type="submit"
            className="w-full py-3 rounded-xl bg-accent text-accent-fg font-semibold hover:opacity-90 active:scale-[0.99] transition-opacity"
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.3 }}
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.99 }}
          >
            {mode === "login" ? "Log in" : "Register"}
          </motion.button>
        </form>
        {allowRegistration && (
          <motion.button
            type="button"
            onClick={() => {
              setMode(mode === "login" ? "register" : "login");
              setError(null);
            }}
            className="mt-6 text-sm text-text-muted hover:text-accent transition-colors"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
          >
            {mode === "login" ? "Need an account? Register" : "Have an account? Log in"}
          </motion.button>
        )}
      </motion.div>
    </div>
  );
}
