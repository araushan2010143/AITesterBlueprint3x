/**
 * API client — typed wrappers for all backend endpoints.
 * Every feature imports from here, never fetches directly.
 */
const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

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

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

export const api = {
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
    const res = await fetch(`${BASE}/api/ingest/file`, { method: "POST", body: form });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return res.json();
  },
};
