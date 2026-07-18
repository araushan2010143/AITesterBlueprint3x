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
}

export interface ChatResponse {
  answer: string;
  citations: Citation[];
  agent_id: string;
  intent: string;
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
  chat: (query: string, agent = "qa_assistant", filters?: Record<string, string>) =>
    post<ChatResponse>("/api/chat", { query, agent, filters }),

  search: (query: string, filters?: Record<string, string>, top_k = 5) =>
    post<SearchResponse>("/api/search", { query, filters, top_k }),

  runAgent: (agentId: string, query: string, context?: Record<string, unknown>) =>
    post<ChatResponse>(`/api/agents/${agentId}/run`, { query, context }),

  listAgents: () => get<{ agents: AgentInfo[] }>("/api/agents"),

  listCollections: () => get<{ collections: Array<{ name: string; vectors: number; points: number }> }>("/api/collections"),

  health: () => get<Record<string, unknown>>("/health"),
};
