import axios from "axios";
import { getToken, getRefreshToken, saveSession, saveRefreshToken, clearSession, getUser } from "@/lib/auth";

const api = axios.create({ baseURL: "/api" });

// Attach JWT on every request
api.interceptors.request.use(cfg => {
  const token = getToken();
  if (token) cfg.headers["Authorization"] = `Bearer ${token}`;
  return cfg;
});

// Auto-refresh on 401
let _refreshing: Promise<string | null> | null = null;
api.interceptors.response.use(
  r => r,
  async err => {
    const original = err.config;
    if (err.response?.status === 401 && !original._retry) {
      original._retry = true;
      if (!_refreshing) {
        _refreshing = (async () => {
          const rt = getRefreshToken();
          if (!rt) { clearSession(); return null; }
          try {
            const res = await axios.post("/api/auth/refresh", { refresh_token: rt });
            const { access_token, refresh_token, user } = res.data;
            saveSession(access_token, user);
            if (refresh_token) saveRefreshToken(refresh_token);
            return access_token;
          } catch {
            clearSession();
            return null;
          }
        })().finally(() => { _refreshing = null; });
      }
      const newToken = await _refreshing;
      if (!newToken) return Promise.reject(err);
      original.headers["Authorization"] = `Bearer ${newToken}`;
      return api(original);
    }
    return Promise.reject(err);
  }
);

export const statsApi = {
  get: () => api.get("/stats").then(r => r.data),
  // Root /health has full service + env data; /api/stats/health is a legacy stub
  health: () => fetch(`${process.env.NEXT_PUBLIC_API_URL ?? ""}/health`).then(r => r.json()),
};

export const documentsApi = {
  list: (params?: Record<string, string>) => api.get("/documents", { params }).then(r => r.data),
  get: (id: string) => api.get(`/documents/${id}`).then(r => r.data),
  filterValues: () => api.get("/documents/filters/values").then(r => r.data),
  delete: (id: string) => api.delete(`/ingest/${id}`).then(r => r.data),
};

export const ingestApi = {
  upload: (file: File, opts: { chunk_size?: number; chunk_overlap?: number; chunk_strategy?: string }) => {
    const form = new FormData();
    form.append("file", file);
    form.append("chunk_size", String(opts.chunk_size ?? 1000));
    form.append("chunk_overlap", String(opts.chunk_overlap ?? 200));
    form.append("chunk_strategy", opts.chunk_strategy ?? "recursive");
    return api.post("/ingest/upload", form).then(r => r.data);
  },
  uploadOpenApi: (file: File, populate_graph = false) => {
    const form = new FormData();
    form.append("file", file);
    form.append("populate_graph", String(populate_graph));
    return api.post("/ingest/openapi", form).then(r => r.data);
  },
};

export const searchApi = {
  search: (body: Record<string, unknown>) => api.post("/search", body).then(r => r.data),
  ask: (body: Record<string, unknown>) => api.post("/search/ask", body).then(r => r.data),
};

export const aiApi = {
  actions: () => api.get("/ai/actions").then(r => r.data),
  run: (action: string, content: string, options?: Record<string, unknown>) =>
    api.post(`/ai/${action}`, { action, content, options: options ?? {} }).then(r => r.data),
  factCheck: (answer: string, citations: unknown[]) =>
    api.post("/agents/fact-check", { answer, citations }).then(r => r.data),
};

export const migrationApi = {
  jobs: () => api.get("/migration/jobs").then(r => r.data),
  job: (id: string) => api.get(`/migration/jobs/${id}`).then(r => r.data),
  delete: (id: string) => api.delete(`/migration/jobs/${id}`).then(r => r.data),
};

export const connectorsApi = {
  list: () => api.get("/connectors").then(r => r.data),
  get: (id: string) => api.get(`/connectors/${id}`).then(r => r.data),
  create: (body: Record<string, unknown>) => api.post("/connectors", body).then(r => r.data),
  update: (id: string, body: Record<string, unknown>) => api.put(`/connectors/${id}`, body).then(r => r.data),
  delete: (id: string) => api.delete(`/connectors/${id}`).then(r => r.data),
  test: (id: string) => api.post(`/connectors/${id}/test`).then(r => r.data),
  sync: (id: string) => api.post(`/connectors/${id}/sync`).then(r => r.data),
  syncHistory: (id: string) => api.get(`/connectors/${id}/sync-history`).then(r => r.data),
};

export const graphApi = {
  nodes: (params?: Record<string, string>) => api.get("/graph/nodes", { params }).then(r => r.data),
  relationships: (params?: Record<string, string>) => api.get("/graph/relationships", { params }).then(r => r.data),
  impactAnalysis: (nodeId: string) => api.get(`/graph/impact/${nodeId}`).then(r => r.data),
  coverageGaps: (params?: Record<string, unknown>) => api.post("/graph/coverage-gaps", params ?? {}).then(r => r.data),
  releaseReadiness: (releaseId: string) => api.get(`/graph/release-readiness/${releaseId}`).then(r => r.data),
  populateCi: (body: Record<string, unknown>) => api.post("/graph/populate/ci", body).then(r => r.data),
  stats: () => api.get("/graph/stats").then(r => r.data),
};

export const auditApi = {
  list: (params?: Record<string, string>) => api.get("/audit", { params }).then(r => r.data),
  export: (params?: Record<string, string>) => api.get("/audit/export", { params, responseType: "blob" }).then(r => r.data),
};

export const webhooksApi = {
  list: () => api.get("/webhooks").then(r => r.data),
  get: (id: string) => api.get(`/webhooks/${id}`).then(r => r.data),
  create: (body: Record<string, unknown>) => api.post("/webhooks", body).then(r => r.data),
  update: (id: string, body: Record<string, unknown>) => api.put(`/webhooks/${id}`, body).then(r => r.data),
  delete: (id: string) => api.delete(`/webhooks/${id}`).then(r => r.data),
  deliveries: (id: string) => api.get(`/webhooks/${id}/deliveries`).then(r => r.data),
  retry: (id: string, deliveryId: string) => api.post(`/webhooks/${id}/deliveries/${deliveryId}/retry`).then(r => r.data),
};

export const promptsApi = {
  list: (params?: Record<string, string>) => api.get("/prompts", { params }).then(r => r.data),
  get: (name: string) => api.get(`/prompts/${name}`).then(r => r.data),
  getActive: (name: string) => api.get(`/prompts/${name}/active`).then(r => r.data),
  create: (body: Record<string, unknown>) => api.post("/prompts", body).then(r => r.data),
  activate: (id: number) => api.put(`/prompts/${id}/activate`).then(r => r.data),
  update: (id: number, body: Record<string, unknown>) => api.put(`/prompts/${id}`, body).then(r => r.data),
  delete: (id: number) => api.delete(`/prompts/${id}`).then(r => r.data),
};

export const authApi = {
  login: (email: string, password: string) => axios.post("/api/auth/login", { email, password }).then(r => r.data),
  register: (body: Record<string, unknown>) => axios.post("/api/auth/register", body).then(r => r.data),
  refresh: (refreshToken: string) => axios.post("/api/auth/refresh", { refresh_token: refreshToken }).then(r => r.data),
  logout: (refreshToken: string) => api.post("/auth/logout", { refresh_token: refreshToken }).then(r => r.data),
  sessions: () => api.get("/auth/sessions").then(r => r.data),
  revokeSession: (id: number) => api.delete(`/auth/sessions/${id}`).then(r => r.data),
};
