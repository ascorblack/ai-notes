const API_BASE = "/api";

async function request<T>(
  path: string,
  options: RequestInit & { token?: string } = {}
): Promise<T> {
  const { token, ...init } = options;
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string>),
  };
  if (token) {
    (headers as Record<string, string>)["Authorization"] = `Bearer ${token}`;
  }
  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  if (!res.ok) {
    const body = await res.text();
    let detail: string = body;
    try {
      const j = JSON.parse(body);
      const d = j.detail ?? body;
      detail = Array.isArray(d) ? d.map((x: { msg?: string }) => x.msg ?? JSON.stringify(x)).join("; ") : String(d);
    } catch {
      // ignore
    }
    throw new Error(detail);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  auth: {
    config: () =>
      request<{ allow_registration: boolean }>("/auth/config"),
    register: (email: string, password: string) =>
      request<{ access_token: string }>("/auth/register", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      }),
    login: (email: string, password: string) =>
      request<{ access_token: string }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      }),
  },
  folders: {
    getTree: (token: string) =>
      request<{ roots: FolderTree[]; root_notes: NoteRef[] }>("/folders", {
        token,
      }),
    create: (token: string, data: { name: string; parent_folder_id?: number | null; order_index?: number }) =>
      request<FolderResponse>("/folders", {
        method: "POST",
        token,
        body: JSON.stringify(data),
      }),
    delete: (token: string, id: number) =>
      request<void>(`/folders/${id}`, { method: "DELETE", token }),
  },
  events: {
    list: (token: string, fromDt: string, toDt: string) =>
      request<EventResponse[]>(`/events?from=${encodeURIComponent(fromDt)}&to=${encodeURIComponent(toDt)}`, {
        token,
      }),
  },
  chat: {
    listSessions: (token: string) =>
      request<{ id: number; title: string; created_at: string; updated_at: string }[]>(
        "/chat/sessions",
        { token }
      ),
    createSession: (token: string) =>
      request<{ id: number; title: string; created_at: string; updated_at: string }>(
        "/chat/sessions",
        { method: "POST", token }
      ),
    getSession: (token: string, sessionId: number) =>
      request<{
        id: number;
        title: string;
        created_at: string;
        updated_at: string;
        messages: { id: number; role: string; content: string; tool_calls?: unknown; created_at: string }[];
      }>(`/chat/sessions/${sessionId}`, { token }),
    deleteSession: (token: string, sessionId: number) =>
      request<{ ok: boolean }>(`/chat/sessions/${sessionId}`, {
        method: "DELETE",
        token,
      }),
    patchSession: (token: string, sessionId: number, data: { title?: string }) =>
      request<{ id: number; title: string; created_at: string; updated_at: string }>(
        `/chat/sessions/${sessionId}`,
        { method: "PATCH", token, body: JSON.stringify(data) }
      ),
    deleteMessage: (token: string, sessionId: number, messageId: number) =>
      request<{ ok: boolean }>(`/chat/sessions/${sessionId}/messages/${messageId}`, {
        method: "DELETE",
        token,
      }),
    regenerateStream: async (
      token: string,
      sessionId: number,
      messageId: number,
      onEvent: (event: string, data: Record<string, unknown>) => void
    ) => {
      const res = await fetch(`${API_BASE}/chat/sessions/${sessionId}/regenerate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ message_id: messageId }),
      });
      if (!res.ok) {
        const body = await res.text();
        let detail = body;
        try {
          const j = JSON.parse(body);
          detail = j.detail ?? body;
        } catch {
          // ignore
        }
        throw new Error(detail);
      }
      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body");
      const dec = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() ?? "";
        for (const part of parts) {
          const lines = part.split("\n");
          let event = "";
          let dataStr = "";
          for (const line of lines) {
            if (line.startsWith("event: ")) event = line.slice(7);
            else if (line.startsWith("data: ")) dataStr = line.slice(6);
          }
          if (!dataStr) continue;
          try {
            const data = JSON.parse(dataStr) as Record<string, unknown>;
            onEvent(event, data);
          } catch {
            // skip
          }
        }
      }
    },
    sendMessageStream: async (
      token: string,
      sessionId: number,
      content: string,
      onEvent: (event: string, data: Record<string, unknown>) => void
    ) => {
      const res = await fetch(`${API_BASE}/chat/sessions/${sessionId}/message`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) {
        const body = await res.text();
        let detail = body;
        try {
          const j = JSON.parse(body);
          detail = j.detail ?? body;
        } catch {
          // ignore
        }
        throw new Error(detail);
      }
      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body");
      const dec = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() ?? "";
        for (const part of parts) {
          const lines = part.split("\n");
          let event = "";
          let dataStr = "";
          for (const line of lines) {
            if (line.startsWith("event: ")) event = line.slice(7);
            else if (line.startsWith("data: ")) dataStr = line.slice(6);
          }
          if (!dataStr) continue;
          try {
            const data = JSON.parse(dataStr) as Record<string, unknown>;
            onEvent(event, data);
          } catch {
            // skip
          }
        }
      }
    },
  },
  search: {
    query: (token: string, q: string, limit?: number) =>
      request<{ id: number; title: string; folder_id: number | null; snippet: string }[]>(
        `/search?q=${encodeURIComponent(q)}&limit=${limit ?? 10}`,
        { token }
      ),
    reindex: (token: string) =>
      request<{ reindexed: number }>("/search/reindex", { method: "POST", token }),
  },
  transcribe: (token: string, audioBlob: Blob) => {
    const formData = new FormData();
    formData.append("file", audioBlob, "recording.webm");
    return fetch(`${API_BASE}/transcribe`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    }).then(async (res) => {
      if (!res.ok) {
        const body = await res.text();
        let detail: string = body;
        try {
          const j = JSON.parse(body);
          const d = j.detail ?? body;
          detail = Array.isArray(d) ? d.map((x: { msg?: string }) => x.msg ?? JSON.stringify(x)).join("; ") : String(d);
        } catch {
          // ignore
        }
        throw new Error(detail);
      }
      return res.json() as Promise<{ text: string }>;
    });
  },
  agent: {
    getSettings: (token: string, agent: "notes" | "chat" = "notes") =>
      request<{
        base_url: string;
        model: string;
        api_key_set: boolean;
        temperature: number;
        frequency_penalty: number;
        top_p: number;
        max_tokens: number;
      }>(`/agent/settings?agent=${agent}`, { token }),
    patchSettings: (
      token: string,
      agent: "notes" | "chat",
      data: {
        base_url?: string;
        model?: string;
        api_key?: string;
        temperature?: number;
        frequency_penalty?: number;
        top_p?: number;
        max_tokens?: number;
      }
    ) =>
      request<{
        base_url: string;
        model: string;
        api_key_set: boolean;
        temperature: number;
        frequency_penalty: number;
        top_p: number;
        max_tokens: number;
      }>(`/agent/settings?agent=${agent}`, { method: "PATCH", token, body: JSON.stringify(data) }),
    getProfile: (token: string) =>
      request<{ facts: { id: number; fact: string }[] }>("/agent/profile", { token }),
    updateProfileFact: (token: string, factId: number, fact: string) =>
      request<{ id: number; fact: string }>(`/agent/profile/${factId}`, {
        method: "PATCH",
        token,
        body: JSON.stringify({ fact }),
      }),
    deleteProfileFact: (token: string, factId: number) =>
      request<void>(`/agent/profile/${factId}`, { method: "DELETE", token }),
    process: (token: string, userInput: string, noteId?: number | null) =>
      request<{ affected_ids: number[]; created_ids: number[] }>("/agent/process", {
        method: "POST",
        token,
        body: JSON.stringify({ user_input: userInput, note_id: noteId ?? undefined }),
      }),

    processStream: async (
      token: string,
      userInput: string,
      onEvent: (event: "status" | "done" | "error", data: Record<string, unknown>) => void,
      noteId?: number | null
    ) => {
      const res = await fetch(`${API_BASE}/agent/process/stream`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ user_input: userInput, note_id: noteId ?? undefined }),
      });
      if (!res.ok) {
        const body = await res.text();
        let detail = body;
        try {
          const j = JSON.parse(body);
          const d = j.detail ?? body;
          detail = Array.isArray(d) ? d.map((x: { msg?: string }) => x.msg ?? JSON.stringify(x)).join("; ") : String(d);
        } catch {
          // ignore
        }
        throw new Error(detail);
      }
      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body");
      const dec = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() ?? "";
        for (const part of parts) {
          const lines = part.split("\n");
          let event = "status";
          let dataStr = "";
          for (const line of lines) {
            if (line.startsWith("event: ")) event = line.slice(7);
            else if (line.startsWith("data: ")) dataStr = line.slice(6);
          }
          if (!dataStr) continue;
          try {
            const data = JSON.parse(dataStr) as Record<string, unknown>;
            onEvent(event as "status" | "done" | "error", data);
          } catch {
            // skip malformed
          }
        }
      }
    },
  },
  notes: {
    get: (token: string, id: number) =>
      request<NoteResponse>(`/notes/${id}`, { token }),
    create: (token: string, data: { title: string; content?: string; folder_id?: number | null }) =>
      request<NoteResponse>("/notes", {
        method: "POST",
        token,
        body: JSON.stringify(data),
      }),
    update: (token: string, id: number, data: { title?: string; content?: string; folder_id?: number | null }) =>
      request<NoteResponse>(`/notes/${id}`, {
        method: "PATCH",
        token,
        body: JSON.stringify(data),
      }),
    delete: (token: string, id: number) =>
      request<void>(`/notes/${id}`, { method: "DELETE", token }),
    trash: {
      list: (token: string) =>
        request<TrashItem[]>(`/notes/trash`, { token }),
      restore: (token: string, id: number) =>
        request<void>(`/notes/trash/${id}/restore`, {
          method: "POST",
          token,
        }),
      deletePermanent: (token: string, id: number) =>
        request<void>(`/notes/trash/${id}`, { method: "DELETE", token }),
    },
  },
  tasks: {
    list: (token: string, includeCompleted?: boolean, folderId?: number | null) =>
      request<TaskResponse[]>(
        `/tasks?include_completed=${includeCompleted ?? false}${folderId != null ? `&folder_id=${folderId}` : ""}`,
        { token }
      ),
    categories: (token: string) =>
      request<TaskCategory[]>(`/tasks/categories`, { token }),
    complete: (token: string, id: number) =>
      request<TaskResponse>(`/tasks/${id}/complete`, { method: "PATCH", token }),
    uncomplete: (token: string, id: number) =>
      request<TaskResponse>(`/tasks/${id}/uncomplete`, { method: "PATCH", token }),
    updateSubtasks: (token: string, id: number, subtasks: SubtaskItem[]) =>
      request<TaskResponse>(`/tasks/${id}/subtasks`, {
        method: "PATCH",
        token,
        body: JSON.stringify({ subtasks }),
      }),
  },
};

export interface FolderTree {
  id: number;
  name: string;
  parent_folder_id: number | null;
  order_index: number;
  children: FolderTree[];
  notes: NoteRef[];
}

export interface NoteRef {
  id: number;
  title: string;
}

export interface FolderResponse {
  id: number;
  name: string;
  parent_folder_id: number | null;
  order_index: number;
}

export interface NoteResponse {
  id: number;
  folder_id: number | null;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
  is_task?: boolean;
}

export interface TrashItem {
  id: number;
  title: string;
  folder_id: number | null;
  deleted_at: string;
}

export interface EventResponse {
  id: number;
  note_id: number;
  title: string;
  starts_at: string;
  ends_at: string;
}

export interface SubtaskItem {
  text: string;
  done: boolean;
}

export interface TaskCategory {
  id: number;
  name: string;
}

export interface TaskResponse {
  id: number;
  title: string;
  content: string;
  subtasks: SubtaskItem[] | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  folder_id: number | null;
}
