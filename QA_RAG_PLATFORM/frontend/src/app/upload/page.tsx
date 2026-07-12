"use client";
import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { useQueryClient } from "@tanstack/react-query";
import { ingestApi } from "@/lib/api";
import { CheckCircle, File, X, Upload, Settings } from "lucide-react";

interface Job { file: File; status: "pending" | "uploading" | "done" | "error"; doc_id?: string; error?: string; }

const EXTS = ".pdf,.xlsx,.xls,.csv,.docx,.doc,.html,.htm,.md,.json,.yaml,.yml,.ts,.js,.py,.txt,.xml";

export default function UploadPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [chunkSize, setChunkSize] = useState(1000);
  const [chunkOverlap, setChunkOverlap] = useState(200);
  const [strategy, setStrategy] = useState("recursive");
  const qc = useQueryClient();

  const onDrop = useCallback((files: File[]) => {
    setJobs(prev => [...prev, ...files.map(f => ({ file: f, status: "pending" as const }))]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop, multiple: true });

  const uploadAll = async () => {
    for (let i = 0; i < jobs.length; i++) {
      if (jobs[i].status !== "pending") continue;
      setJobs(prev => prev.map((j, idx) => idx === i ? { ...j, status: "uploading" } : j));
      try {
        const res = await ingestApi.upload(jobs[i].file, { chunk_size: chunkSize, chunk_overlap: chunkOverlap, chunk_strategy: strategy });
        setJobs(prev => prev.map((j, idx) => idx === i ? { ...j, status: "done", doc_id: res.doc_id } : j));
      } catch (e: any) {
        setJobs(prev => prev.map((j, idx) => idx === i ? { ...j, status: "error", error: e.response?.data?.detail ?? "Upload failed" } : j));
      }
    }
    qc.invalidateQueries({ queryKey: ["stats"] });
  };

  const pendingCount = jobs.filter(j => j.status === "pending").length;

  return (
    <div style={{ padding: "28px 32px", maxWidth: 780 }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text-1)", margin: "0 0 4px" }}>Upload Documents</h1>
        <p style={{ fontSize: 13, color: "var(--text-3)", margin: 0 }}>
          PDF · Excel · DOCX · HTML · Markdown · JSON · YAML/Swagger · Playwright TS · Python · CSV
        </p>
      </div>

      {/* Drop Zone */}
      <div
        {...getRootProps()}
        style={{
          border: `2px dashed ${isDragActive ? "var(--accent)" : "var(--border-strong)"}`,
          borderRadius: 16,
          padding: "48px 24px",
          textAlign: "center",
          cursor: "pointer",
          background: isDragActive ? "var(--accent-glow)" : "var(--surface-1)",
          transition: "all 0.2s",
          marginBottom: 20,
        }}
      >
        <input {...getInputProps()} accept={EXTS} />
        <div style={{
          width: 56, height: 56, borderRadius: 14,
          background: isDragActive ? "rgba(124,58,237,0.3)" : "var(--surface-2)",
          display: "flex", alignItems: "center", justifyContent: "center",
          margin: "0 auto 16px", border: "1px solid var(--border)",
        }}>
          <Upload size={22} color={isDragActive ? "var(--accent-light)" : "var(--text-3)"} />
        </div>
        <p style={{ fontSize: 15, fontWeight: 700, color: "var(--text-1)", margin: "0 0 6px" }}>
          {isDragActive ? "Drop files here" : "Drag & drop or click to browse"}
        </p>
        <p style={{ fontSize: 12, color: "var(--text-3)", margin: 0 }}>
          PDF, XLSX, CSV, DOCX, HTML, MD, JSON, YAML, TypeScript, Python, XML
        </p>
      </div>

      {/* Chunking Settings */}
      <div className="card" style={{ padding: 20, marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
          <Settings size={13} color="var(--text-3)" />
          <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
            Chunking Settings
          </span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
          <div>
            <label style={{ fontSize: 11, color: "var(--text-3)", display: "block", marginBottom: 6, fontWeight: 600 }}>Chunk Size</label>
            <input type="number" value={chunkSize} onChange={e => setChunkSize(+e.target.value)}
              min={200} max={4000} step={100} className="input" style={{ padding: "8px 12px", fontSize: 13 }} />
          </div>
          <div>
            <label style={{ fontSize: 11, color: "var(--text-3)", display: "block", marginBottom: 6, fontWeight: 600 }}>Overlap</label>
            <input type="number" value={chunkOverlap} onChange={e => setChunkOverlap(+e.target.value)}
              min={0} max={500} step={50} className="input" style={{ padding: "8px 12px", fontSize: 13 }} />
          </div>
          <div>
            <label style={{ fontSize: 11, color: "var(--text-3)", display: "block", marginBottom: 6, fontWeight: 600 }}>Strategy</label>
            <select value={strategy} onChange={e => setStrategy(e.target.value)} className="input" style={{ padding: "8px 12px", fontSize: 13 }}>
              <option value="recursive">Recursive</option>
              <option value="semantic">Semantic</option>
              <option value="fixed">Fixed Size</option>
            </select>
          </div>
        </div>
      </div>

      {/* Job List */}
      {jobs.length > 0 && (
        <div className="card" style={{ marginBottom: 16, overflow: "hidden" }}>
          {jobs.map((job, i) => (
            <div key={i} style={{
              display: "flex", alignItems: "center", gap: 12,
              padding: "12px 16px",
              borderBottom: i < jobs.length - 1 ? "1px solid var(--border)" : "none",
            }}>
              <div style={{
                width: 32, height: 32, borderRadius: 8,
                background: "var(--surface-2)", border: "1px solid var(--border)",
                display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
              }}>
                <File size={13} color="var(--text-3)" />
              </div>
              <span style={{ fontSize: 13, color: "var(--text-1)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {job.file.name}
              </span>
              <span style={{ fontSize: 11, color: "var(--text-3)", flexShrink: 0 }}>
                {(job.file.size / 1024).toFixed(0)} KB
              </span>
              {job.status === "done" && <CheckCircle size={15} color="var(--green)" />}
              {job.status === "error" && <span style={{ fontSize: 11, color: "var(--red)" }}>{job.error}</span>}
              {job.status === "uploading" && <span style={{ fontSize: 11, color: "var(--accent-light)" }}>Uploading…</span>}
              {job.status === "pending" && (
                <button onClick={() => setJobs(prev => prev.filter((_, idx) => idx !== i))}
                  style={{ background: "none", border: "none", cursor: "pointer", padding: 2, color: "var(--text-3)" }}>
                  <X size={13} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {pendingCount > 0 && (
        <button onClick={uploadAll} className="btn btn-primary" style={{ width: "100%", justifyContent: "center", padding: "12px 24px", fontSize: 14 }}>
          Upload {pendingCount} File{pendingCount > 1 ? "s" : ""} →
        </button>
      )}

      {jobs.length > 0 && pendingCount === 0 && (
        <button onClick={() => setJobs([])} className="btn btn-ghost" style={{ width: "100%", justifyContent: "center" }}>
          Clear All
        </button>
      )}
    </div>
  );
}
