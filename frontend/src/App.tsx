import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthPage } from "./components/auth/AuthPage";
import { ServerConfigPage } from "./components/auth/ServerConfigPage";
import { BackButtonHandler } from "./components/BackButtonHandler";
import { needsServerConfig } from "./lib/apiBase";
import { AuthenticatedShell } from "./components/AuthenticatedShell";
import { Layout } from "./components/Layout";
import { Toast } from "./components/Toast";
import { CommandPalette } from "./components/CommandPalette";

const ChatPage = lazy(() => import("./components/chat/ChatPage").then((m) => ({ default: m.ChatPage })));
const TasksPage = lazy(() => import("./components/TasksPage").then((m) => ({ default: m.TasksPage })));
const SavedMessagesPage = lazy(() => import("./components/saved/SavedMessagesPage").then((m) => ({ default: m.SavedMessagesPage })));
import { ShortcutsOverlay } from "./components/ShortcutsOverlay";
import { useAuthStore } from "./store/authStore";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token);
  if (needsServerConfig()) return <Navigate to="/config-server" replace />;
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function App() {
  return (
    <>
      <Toast />
      <BrowserRouter>
        <BackButtonHandler />
        <Routes>
          <Route path="/config-server" element={<ServerConfigPage />} />
          <Route path="/login" element={<AuthPage />} />
          <Route
            element={
              <ProtectedRoute>
                <AuthenticatedShell />
                <CommandPalette />
                <ShortcutsOverlay />
              </ProtectedRoute>
            }
          >
            <Route path="/" element={<Layout />} />
            <Route
              path="/chat"
              element={
                <Suspense fallback={<div className="flex-1 flex items-center justify-center text-text-muted">Загрузка…</div>}>
                  <ChatPage />
                </Suspense>
              }
            />
            <Route
              path="/tasks"
              element={
                <Suspense fallback={<div className="flex-1 flex items-center justify-center text-text-muted">Загрузка…</div>}>
                  <TasksPage />
                </Suspense>
              }
            />
            <Route
              path="/saved"
              element={
                <Suspense fallback={<div className="flex-1 flex items-center justify-center text-text-muted">Загрузка…</div>}>
                  <SavedMessagesPage />
                </Suspense>
              }
            />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </>
  );
}

export default App;
