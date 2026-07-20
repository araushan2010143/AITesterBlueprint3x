"use client";
import { useState, useCallback, useEffect } from "react";
import { useDropzone } from "react-dropzone";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ingestApi, documentsApi, statsApi } from "@/lib/api";
import { Document } from "@/types";
import {
  Upload, File, CheckCircle, XCircle, Loader2, Trash2,
  Settings, Database, FileText, ChevronDown, RefreshCw, AlertCircle,
} from "lucide-react";

const EXTS = ".pdf,.xlsx,.xls,.csv,.docx,.doc,.html,.htm,.md,.json,.yaml,.yml,.ts,.js,.py,.txt,.xml";

const FILE_TYPE_COLORS: Record<string, string> = {
  pdf: "#ef4444", xlsx: "#22c55e", xls: "#22c55e", csv: "#10b981",
  docx: "#3b82f6", doc: "#3b82f6", md: "#8b5cf6", json: "#f59e0b",
  yaml: "#f59e0b", yml: "#f59e0b", ts: "#06b6d4", js: "#fbbf24",
  py: "#6366f1", txt: "#9ca3af", html: "#f97316", xml: "#a78bfa",
};

interface UploadJob {
  file: File;
  status: "pending" | "uploading" | "done" | "error";
  doc_id?: string;
  error?: string;
  progress?: number;
}

function StatusBadge({ status }: { status: Document["status"] | "uploading" | "pending" }) {
  const map: Record<string, { label: string; color: string; bg: string }> = {
    ready:      { label: "Ready",      color: "#22c55e", bg: "rgba(34,197,94,0.1)"   },
    processing: { label: "Processing", color: "#f59e0b", bg: "rgba(245,158,11,0.1)"  },
    uploading:  { label: "Uploading",  color: "#7c3aed", bg: "rgba(124,58,237,0.1)"  },
    pending:    { label: "Pending",    color: "#6b7280", bg: "rgba(107,114,128,0.1)" },
    error:      { label: "Error",      color: "#ef4444", bg: "rgba(239,68,68,0.1)"   },
  };
  const s = map[status] ?? map.pending;
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 4,
      color: s.color, background: s.bg, textTransform: "uppercase", letterSpacing: "0.06em",
      whiteSpace: "nowrap",
    }}>
      {s.label}
    </span>
  );
}

function FileTypePill({ ext }: { ext: string }) {
  const color = FILE_TYPE_COLORS[ext.toLowerCase()] ?? "#6b7280";
  return (
    <span style={{
      fontSize: 9, fontWeight: 800, padding: "1px 5px", borderRadius: 3,
      color, background: `${color}18`, textTransform: "uppercase", letterSpacing: "0.06em",
      fontFamily: "monospace", border: `1px solid ${color}30`,
    }}>
      {ext}
    </span>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="card" style={{ padding: "16px 20px", flex: 1 }}>
      <p style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", margin: "0 0 6px", textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</p>
      <p style={{ fontSize: 26, fontWeight: 800, color: "var(--text-1)", margin: "0 0 2px", fontVariantNumeric: "tabular-nums" }}>{value}</p>
      {sub && <p style={{ fontSize: 11, color: "var(--text-3)", margin: 0 }}>{sub}</p>}
    </div>
  );
}

export default function IngestPage() {
  const qc = useQueryClient();
  const [jobs, setJobs] = useState<UploadJob[]>([]);
  const [chunkSize, setChunkSize] = useState(1000);
  const [chunkOverlap, setChunkOverlap] = useState(200);
  const [strategy, setStrategy] = useState("recursive");
  const [showSettings, setShowSettings] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const { data: stats } = useQuery({
    queryKey: ["stats"],
    queryFn: () => statsApi.get(),
    refetchInterval: 10_000,
  });

  const { data: docsData, refetch: refetchDocs } = useQuery({
    queryKey: ["documents"],
    queryFn: () => documentsApi.list({ limit: "50", order: "desc" }),
    refetchInterval: 5_000,
  });

  const documents: Document[] = docsData?.documents ?? docsData ?? [];

  // Auto-refetch while any doc is still processing
  useEffect(() => {
    const hasProcessing = documents.some(d => d.status === "processing");
    if (hasProcessing) {
      const t = setTimeout(() => refetchDocs(), 3000);
      return () => clearTimeout(t);
    }
  }, [documents, refetchDocs]);

  const onDrop = useCallback((files: File[]) => {
    setJobs(prev => [...prev, ...files.map(f => ({ file: f, status: "pending" as const }))]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: true,
    accept: { "application/*": [], "text/*": [] },
  });

  async function uploadAll() {
    for (let i = 0; i < jobs.length; i++) {
      if (jobs[i].status !== "pending") continue;
      setJobs(prev => prev.map((j, idx) => idx === i ? { ...j, status: "uploading" } : j));
      try {
        const res = await ingestApi.upload(jobs[i].file, {
          chunk_size: chunkSize,
          chunk_overlap: chunkOverlap,
          chunk_strategy: strategy,
        });
        setJobs(prev => prev.map((j, idx) => idx === i ? { ...j, status: "done", doc_id: res.doc_id } : j));
      } catch (e: any) {
        const msg = e.response?.data?.detail ?? "Upload failed";
        setJobs(prev => prev.map((j, idx) => idx === i ? { ...j, status: "error", error: msg } : j));
      }
    }
    qc.invalidateQueries({ queryKey: ["stats"] });
    qc.invalidateQueries({ queryKey: ["documents"] });
  }

  async function deleteDoc(id: string) {
    setDeleting(id);
    try {
      await documentsApi.delete(id);
      qc.invalidateQueries({ queryKey: ["documents"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
    } catch {
      // ignore
    } finally {
      setDeleting(null);
      setDeleteConfirm(null);
    }
  }

  const pendingCount = jobs.filter(j => j.status === "pending").length;
  const hasJobs = jobs.length > 0;

  return (
    <div style={{ padding: "28px 32px", maxWidth: 900 }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text-1)", margin: "0 0 4px" }}>
          Knowledge Base Ingest
        </h1>
        <p style={{ fontSize: 13, color: "var(--text-3)", margin: 0 }}>
          Upload documents to build your QA knowledge base. Supported: PDF · Excel · DOCX · Markdown · JSON · YAML · TypeScript · Python · CSV
        </p>
      </div>

      {/* Stats Row */}
      {stats && (
        <div style={{ display: "flex", gap: 12, marginBottom: 24 }}>
          <StatCard label="Documents" value={stats.total_documents ?? 0} sub="indexed" />
          <StatCard label="Chunks" value={(stats.total_chunks ?? 0).toLocaleString()} sub="vector embeddings" />
          <StatCard label="Vectors" value={(stats.total_vectors ?? 0).toLocaleString()} sub="in Pinecone" />
          {stats.by_status && (
            <StatCard
              label="Ready"
              value={stats.by_status.ready ?? 0}
              sub={`${stats.by_status.processing ?? 0} processing`}
            />
          )}
        </div>
      )}

      {/* Upload Zone */}
      <div
        {...getRootProps()}
        style={{
          border: `2px dashed ${isDragActive ? "#7c3aed" : "var(--border-strong)"}`,
          borderRadius: 16,
          padding: "40px 24px",
          textAlign: "center",
          cursor: "pointer",
          background: isDragActive ? "rgba(124,58,237,0.06)" : "var(--surface-1)",
          transition: "all 0.2s",
          marginBottom: 12,
        }}
      >
        <input {...getInputProps()} accept={EXTS} />
        <div style={{
          width: 52, height: 52, borderRadius: 14,
          background: isDragActive ? "rgba(124,58,237,0.2)" : "var(--surface-2)",
          display: "flex", alignItems: "center", justifyContent: "center",
          margin: "0 auto 14px", border: "1px solid var(--border)",
        }}>
          <Upload size={20} color={isDragActive ? "#a78bfa" : "var(--text-3)"} />
        </div>
        <p style={{ fontSize: 15, fontWeight: 700, color: "var(--text-1)", margin: "0 0 4px" }}>
          {isDragActive ? "Drop files to ingest" : "Drag & drop files here"}
        </p>
        <p style={{ fontSize: 12, color: "var(--text-3)", margin: 0 }}>or click to browse — multiple files supported</p>
      </div>

      {/* Chunking Settings (collapsible) */}
      <div className="card" style={{ marginBottom: 16, overflow: "hidden" }}>
        <button
          onClick={() => setShowSettings(s => !s)}
          style={{
            width: "100%", display: "flex", alignItems: "center", gap: 8,
            padding: "12px 16px", background: "none", border: "none",
            cursor: "pointer", color: "var(--text-3)", fontSize: 12,
          }}
        >
          <Settings size={12} />
          <span style={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", fontSize: 11 }}>
            Chunking Settings
          </span>
          <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--text-4)" }}>
            {chunkSize} tokens · {chunkOverlap} overlap · {strategy}
          </span>
          <ChevronDown size={12} style={{ transform: showSettings ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
        </button>

        {showSettings && (
          <div style={{ padding: "0 16px 16px", borderTop: "1px solid var(--border)" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, paddingTop: 14 }}>
              <div>
                <label style={{ fontSize: 11, color: "var(--text-3)", display: "block", marginBottom: 6, fontWeight: 600 }}>
                  Chunk Size (tokens)
                </label>
                <input type="number" value={chunkSize} onChange={e => setChunkSize(+e.target.value)}
                  min={200} max={4000} step={100} className="input"
                  style={{ padding: "8px 12px", fontSize: 13, width: "100%", boxSizing: "border-box" }} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: "var(--text-3)", display: "block", marginBottom: 6, fontWeight: 600 }}>
                  Overlap
                </label>
                <input type="number" value={chunkOverlap} onChange={e => setChunkOverlap(+e.target.value)}
                  min={0} max={500} step={50} className="input"
                  style={{ padding: "8px 12px", fontSize: 13, width: "100%", boxSizing: "border-box" }} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: "var(--text-3)", display: "block", marginBottom: 6, fontWeight: 600 }}>
                  Strategy
                </label>
                <select value={strategy} onChange={e => setStrategy(e.target.value)} className="input"
                  style={{ padding: "8px 12px", fontSize: 13, width: "100%", boxSizing: "border-box" }}>
                  <option value="recursive">Recursive (recommended)</option>
                  <option value="semantic">Semantic</option>
                  <option value="fixed">Fixed Size</option>
                </select>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Upload Queue */}
      {hasJobs && (
        <div className="card" style={{ marginBottom: 12, overflow: "hidden" }}>
          <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Queue — {jobs.length} file{jobs.length > 1 ? "s" : ""}
            </span>
            <button onClick={() => setJobs([])} style={{ background: "none", border: "none", color: "var(--text-4)", fontSize: 11, cursor: "pointer" }}>
              Clear all
            </button>
          </div>
          {jobs.map((job, i) => (
            <div key={i} style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "10px 16px",
              borderBottom: i < jobs.length - 1 ? "1px solid var(--border)" : "none",
            }}>
              <div style={{
                width: 30, height: 30, borderRadius: 7,
                background: "var(--surface-2)", border: "1px solid var(--border)",
                display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
              }}>
                {job.status === "uploading"
                  ? <Loader2 size={13} color="var(--accent-light)" style={{ animation: "spin 1s linear infinite" }} />
                  : job.status === "done"
                  ? <CheckCircle size={13} color="#22c55e" />
                  : job.status === "error"
                  ? <XCircle size={13} color="#ef4444" />
                  : <File size={13} color="var(--text-3)" />}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 12, color: "var(--text-1)", margin: "0 0 2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {job.file.name}
                </p>
                {job.status === "error" && (
                  <p style={{ fontSize: 11, color: "#ef4444", margin: 0 }}>{job.error}</p>
                )}
              </div>
              <span style={{ fontSize: 11, color: "var(--text-4)", flexShrink: 0 }}>
                {(job.file.size / 1024).toFixed(0)} KB
              </span>
              <FileTypePill ext={job.file.name.split(".").pop() ?? "?"} />
              <StatusBadge status={job.status} />
              {job.status === "pending" && (
                <button onClick={() => setJobs(prev => prev.filter((_, idx) => idx !== i))}
                  style={{ background: "none", border: "none", cursor: "pointer", padding: 2, color: "var(--text-4)", flexShrink: 0 }}>
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Upload button */}
      {pendingCount > 0 && (
        <button onClick={uploadAll} className="btn btn-primary"
          style={{ width: "100%", justifyContent: "center", padding: "12px 24px", fontSize: 14, marginBottom: 24 }}>
          <Upload size={15} />
          Ingest {pendingCount} File{pendingCount > 1 ? "s" : ""}
        </button>
      )}

      {/* Ingested Documents */}
      <div style={{ marginTop: pendingCount > 0 ? 0 : 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: "var(--text-1)", margin: 0 }}>
            Ingested Documents
          </h2>
          <button onClick={() => refetchDocs()} style={{ background: "none", border: "none", color: "var(--text-3)", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, fontSize: 12 }}>
            <RefreshCw size={11} /> Refresh
          </button>
        </div>

        {documents.length === 0 ? (
          <div className="card" style={{ padding: "40px 24px", textAlign: "center" }}>
            <Database size={28} color="var(--text-4)" style={{ marginBottom: 12 }} />
            <p style={{ fontSize: 13, color: "var(--text-3)", margin: 0 }}>No documents ingested yet. Upload files above to populate the knowledge base.</p>
          </div>
        ) : (
          <div className="card" style={{ overflow: "hidden" }}>
            {/* Table header */}
            <div style={{
              display: "grid", gridTemplateColumns: "1fr 60px 70px 70px 70px 80px 36px",
              padding: "8px 16px", borderBottom: "1px solid var(--border)",
              fontSize: 10, fontWeight: 700, color: "var(--text-4)",
              textTransform: "uppercase", letterSpacing: "0.08em",
            }}>
              <span>File</span>
              <span style={{ textAlign: "right" }}>Pages</span>
              <span style={{ textAlign: "right" }}>Chunks</span>
              <span style={{ textAlign: "right" }}>Vectors</span>
              <span style={{ textAlign: "center" }}>Type</span>
              <span style={{ textAlign: "center" }}>Status</span>
              <span />
            </div>

            {documents.map((doc, i) => (
              <div key={doc.id} style={{
                display: "grid", gridTemplateColumns: "1fr 60px 70px 70px 70px 80px 36px",
                alignItems: "center", padding: "10px 16px",
                borderBottom: i < documents.length - 1 ? "1px solid var(--border)" : "none",
              }}>
                {/* Filename */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                  <FileText size={13} color="var(--text-4)" style={{ flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: "var(--text-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {doc.filename}
                  </span>
                  {doc.status === "error" && doc.error && (
                    <span title={doc.error} style={{ flexShrink: 0 }}>
                      <AlertCircle size={11} color="#ef4444" />
                    </span>
                  )}
                </div>

                <span style={{ fontSize: 12, color: "var(--text-3)", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                  {doc.total_pages}
                </span>
                <span style={{ fontSize: 12, color: "var(--text-3)", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                  {doc.total_chunks.toLocaleString()}
                </span>
                <span style={{ fontSize: 12, color: "var(--text-3)", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                  {doc.total_vectors.toLocaleString()}
                </span>

                <div style={{ display: "flex", justifyContent: "center" }}>
                  <FileTypePill ext={doc.file_type} />
                </div>

                <div style={{ display: "flex", justifyContent: "center" }}>
                  {doc.status === "processing"
                    ? <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: "#f59e0b" }}>
                        <Loader2 size={10} style={{ animation: "spin 1s linear infinite" }} /> Processing
                      </span>
                    : <StatusBadge status={doc.status} />}
                </div>

                {/* Delete */}
                <div style={{ display: "flex", justifyContent: "center" }}>
                  {deleteConfirm === doc.id ? (
                    <button
                      onClick={() => deleteDoc(doc.id)}
                      disabled={deleting === doc.id}
                      style={{ background: "#ef4444", border: "none", borderRadius: 5, padding: "3px 7px", cursor: "pointer", color: "white", fontSize: 10, fontWeight: 700 }}>
                      {deleting === doc.id ? "…" : "Yes"}
                    </button>
                  ) : (
                    <button
                      onClick={() => setDeleteConfirm(doc.id)}
                      title="Delete document"
                      style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-4)", padding: 4, borderRadius: 5, display: "flex" }}
                      onMouseEnter={e => (e.currentTarget.style.color = "#ef4444")}
                      onMouseLeave={e => (e.currentTarget.style.color = "var(--text-4)")}
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
