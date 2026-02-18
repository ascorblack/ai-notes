import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import "./index.css";

// Prevent FOUC – apply stored theme before React hydrates
const _t = (localStorage.getItem("ai-notes-theme") || "dark") as "dark" | "light";
document.documentElement.classList.add(_t);
document.documentElement.style.colorScheme = _t;

const queryClient = new QueryClient();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>
);
