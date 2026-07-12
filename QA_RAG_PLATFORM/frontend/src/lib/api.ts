import axios from "axios";

const api = axios.create({ baseURL: "/api" });

export const statsApi = {
  get: () => api.get("/stats").then(r => r.data),
  health: () => api.get("/stats/health").then(r => r.data),
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
};

export const searchApi = {
  search: (body: Record<string, unknown>) => api.post("/search", body).then(r => r.data),
  ask: (body: Record<string, unknown>) => api.post("/search/ask", body).then(r => r.data),
};

export const aiApi = {
  actions: () => api.get("/ai/actions").then(r => r.data),
  run: (action: string, content: string, options?: Record<string, unknown>) =>
    api.post(`/ai/${action}`, { action, content, options: options ?? {} }).then(r => r.data),
};
