export interface Document {
  id: string;
  filename: string;
  file_type: string;
  status: "processing" | "ready" | "error";
  document_type?: string;
  module?: string;
  feature?: string;
  priority?: string;
  author?: string;
  release?: string;
  tags?: string;
  automation_status?: string;
  total_pages: number;
  total_chunks: number;
  total_vectors: number;
  created_at: string;
  error?: string;
}

export interface SearchResult {
  chunk_id: string;
  doc_id: string;
  filename: string;
  text: string;
  score: number;
  page: number;
  metadata: Record<string, string>;
}

export interface SearchResponse {
  query: string;
  results: SearchResult[];
  total: number;
  latency_ms: number;
}

export interface Stats {
  total_documents: number;
  total_chunks: number;
  total_vectors: number;
  by_type: Record<string, number>;
  by_module: Record<string, number>;
  by_status: Record<string, number>;
  recent_documents: Document[];
}

export interface AIAction {
  id: string;
  label: string;
  description: string;
  icon: string;
}
