import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthPage } from "./components/auth/AuthPage";
import { BackButtonHandler } from "./components/BackButtonHandler";
import { AuthenticatedShell } from "./components/AuthenticatedShell";
import { Layout } from "./components/Layout";
import { Toast } from "./components/Toast";
import { ChatPage } from "./components/chat/ChatPage";
import { TasksPage } from "./components/TasksPage";
import { useAuthStore } from "./store/authStore";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token);
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
          <Route path="/login" element={<AuthPage />} />
          <Route
            element={
              <ProtectedRoute>
                <AuthenticatedShell />
              </ProtectedRoute>
            }
          >
            <Route path="/" element={<Layout />} />
            <Route path="/chat" element={<ChatPage />} />
            <Route path="/tasks" element={<TasksPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </>
  );
}

export default App;
