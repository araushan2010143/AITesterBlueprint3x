/**
 * API client — typed wrappers for all backend endpoints.
 * Every feature imports from here, never fetches directly.
 */
// All calls go through Next.js rewrite /proxy/* → Render backend (server-side).
// Same-origin from browser — no CORS, no env vars, no build-time config needed.
export const BASE = "/proxy";

export interface Citation {
  source: string;
  path: string;
  filename: string;
  line: string;
  page: string;
  jira: string;
  testcase: string;
  score?: number;
}

export interface ChatResponse {
  answer: string;
  citations: Citation[];
  agent_id: string;
  intent: string;
  elapsed_ms?: number;
}

export interface SearchResult {
  text: string;
  score: number;
  collection: string;
  metadata: Record<string, string>;
}

export interface SearchResponse {
  results: SearchResult[];
  intent: string;
  collections_searched: string[];
  total: number;
}

export interface AgentInfo {
  id: string;
  description: string;
}

export interface IngestOptions {
  collection: string;
  source_type: string;
  repo?: string;
  framework?: string;
  module?: string;
  feature?: string;
  sprint?: string;
}

export interface IngestResponse {
  indexed: number;
  skipped: number;
  collection: string;
  filename: string;
}

function authHeaders(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const token = localStorage.getItem("qa_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

const TIMEOUT_MS = 45_000;

function withTimeout(signal?: AbortSignal): { signal: AbortSignal; clear: () => void } {
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), TIMEOUT_MS);
  // if a caller signal fires, mirror it
  signal?.addEventListener("abort", () => controller.abort());
  return { signal: controller.signal, clear: () => clearTimeout(tid) };
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (res.ok) return res.json();
  // Surface backend detail message when available
  const body = await res.text().catch(() => "");
  let detail = "";
  try { detail = JSON.parse(body).detail ?? ""; } catch { detail = body; }
  throw new Error(detail || `${res.status} ${res.statusText}`);
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const { signal, clear } = withTimeout();
  try {
    const res = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(body),
      signal,
    });
    return handleResponse<T>(res);
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError")
      throw new Error("Request timed out — backend is slow or waking up. Please try again.");
    throw err;
  } finally {
    clear();
  }
}

async function get<T>(path: string): Promise<T> {
  const { signal, clear } = withTimeout();
  try {
    const res = await fetch(`${BASE}${path}`, { headers: authHeaders(), signal });
    return handleResponse<T>(res);
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError")
      throw new Error("Request timed out — backend is slow or waking up. Please try again.");
    throw err;
  } finally {
    clear();
  }
}

export interface AuthToken { access_token: string; token_type: string; }
export interface AuthUser  { id: number; email: string; name: string; created_at: string; }

export const api = {
  register: (email: string, password: string, name: string) =>
    post<AuthUser>("/api/auth/register", { email, password, name }),

  login: (email: string, password: string) =>
    post<AuthToken>("/api/auth/login", { email, password }),

  me: () => get<AuthUser>("/api/auth/me"),


  chat: (query: string, agent = "qa_assistant", filters?: Record<string, string>, collections?: string[]) =>
    post<ChatResponse>("/api/chat", { query, agent, filters, collections }),

  search: (query: string, filters?: Record<string, string>, top_k = 5, collections?: string[]) =>
    post<SearchResponse>("/api/search", { query, filters, top_k, collections }),

  runAgent: (agentId: string, query: string, context?: Record<string, unknown>) =>
    post<ChatResponse>(`/api/agents/${agentId}/run`, { query, context }),

  listAgents: () => get<{ agents: AgentInfo[] }>("/api/agents"),

  listCollections: () => get<{ collections: Array<{ name: string; vectors: number; points: number }> }>("/api/collections"),

  health: () => get<Record<string, unknown>>("/health"),

  ingestFile: async (file: File, opts: IngestOptions): Promise<IngestResponse> => {
    const form = new FormData();
    form.append("file", file);
    form.append("collection", opts.collection);
    form.append("source_type", opts.source_type);
    if (opts.repo)      form.append("repo",      opts.repo);
    if (opts.framework) form.append("framework", opts.framework);
    if (opts.module)    form.append("module",    opts.module);
    if (opts.feature)   form.append("feature",   opts.feature);
    if (opts.sprint)    form.append("sprint",    opts.sprint);
    const { signal, clear } = withTimeout();
    try {
      const res = await fetch(`${BASE}/api/ingest/file`, { method: "POST", body: form, headers: authHeaders(), signal });
      return handleResponse<IngestResponse>(res);
    } finally {
      clear();
    }
  },
};
