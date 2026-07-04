import axios from 'axios'
import type {
  AppStatus, IngestResponse, DocumentInfo, ChunkInfo,
  QueryResponse, AllMetrics
} from '../types'

const http = axios.create({ baseURL: '/api', timeout: 120_000 })

export const api = {
  getStatus: () =>
    http.get<AppStatus>('/status').then((r) => r.data),

  // Combined upload + ingest: sends PDF as multipart form data
  ingestFile: (
    file: File,
    opts: { chunk_size?: number; chunk_overlap?: number; rebuild?: boolean } = {}
  ) => {
    const form = new FormData()
    form.append('file', file)
    form.append('chunk_size', String(opts.chunk_size ?? 800))
    form.append('chunk_overlap', String(opts.chunk_overlap ?? 150))
    form.append('rebuild', opts.rebuild ? 'true' : 'false')
    return http.post<IngestResponse>('/ingest', form).then((r) => r.data)
  },

  reindexFile: (
    file: File,
    opts: { chunk_size?: number; chunk_overlap?: number } = {}
  ) => {
    const form = new FormData()
    form.append('file', file)
    form.append('chunk_size', String(opts.chunk_size ?? 800))
    form.append('chunk_overlap', String(opts.chunk_overlap ?? 150))
    return http.post<IngestResponse>('/reindex', form).then((r) => r.data)
  },

  query: (
    question: string,
    opts: { top_k?: number; temperature?: number; max_tokens?: number } = {}
  ) =>
    http.post<QueryResponse>('/query', { question, ...opts }).then((r) => r.data),

  getDocuments: () =>
    http.get<DocumentInfo[]>('/documents').then((r) => r.data),

  getChunks: (params?: { doc_id?: string; page?: number }) =>
    http.get<ChunkInfo[]>('/chunks', { params }).then((r) => r.data),

  getMetrics: () =>
    http.get<AllMetrics>('/metrics').then((r) => r.data),
}
