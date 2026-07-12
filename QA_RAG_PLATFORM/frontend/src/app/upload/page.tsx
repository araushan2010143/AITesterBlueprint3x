"use client";
import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ingestApi } from "@/lib/api";
import { Upload, CheckCircle, XCircle, File, X } from "lucide-react";

const SUPPORTED = ".pdf,.xlsx,.xls,.csv,.docx,.doc,.html,.htm,.md,.json,.yaml,.yml,.ts,.js,.py,.txt,.xml";

interface UploadJob { file: File; status: "pending" | "uploading" | "done" | "error"; doc_id?: string; error?: string; }

export default function UploadPage() {
  const [jobs, setJobs] = useState<UploadJob[]>([]);
  const [chunkSize, setChunkSize] = useState(1000);
  const [chunkOverlap, setChunkOverlap] = useState(200);
  const [strategy, setStrategy] = useState("recursive");
  const qc = useQueryClient();

  const onDrop = useCallback((files: File[]) => {
    setJobs(prev => [...prev, ...files.map(f => ({ file: f, status: "pending" as const }))]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop, accept: { "application/*": [], "text/*": [] }, multiple: true,
  });

  const uploadAll = async () => {
    for (let i = 0; i < jobs.length; i++) {
      if (jobs[i].status !== "pending") continue;
      setJobs(prev => prev.map((j, idx) => idx === i ? { ...j, status: "uploading" } : j));
      try {
        const result = await ingestApi.upload(jobs[i].file, { chunk_size: chunkSize, chunk_overlap: chunkOverlap, chunk_strategy: strategy });
        setJobs(prev => prev.map((j, idx) => idx === i ? { ...j, status: "done", doc_id: result.doc_id } : j));
      } catch (e: any) {
        setJobs(prev => prev.map((j, idx) => idx === i ? { ...j, status: "error", error: e.response?.data?.detail ?? "Upload failed" } : j));
      }
    }
    qc.invalidateQueries({ queryKey: ["stats"] });
  };

  const removeJob = (i: number) => setJobs(prev => prev.filter((_, idx) => idx !== i));

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">Upload Documents</h1>
        <p className="text-sm text-[var(--text-muted)]">PDF · Excel · DOCX · HTML · Markdown · JSON · Swagger · Playwright TS · Python · CSV</p>
      </div>

      {/* Drop Zone */}
      <div
        {...getRootProps()}
        className={`card p-10 text-center cursor-pointer border-2 border-dashed transition-all ${
          isDragActive ? "border-indigo-500 bg-indigo-900/10" : "border-[var(--border)] hover:border-indigo-500/50"
        }`}
      >
        <input {...getInputProps()} accept={SUPPORTED} />
        <Upload size={32} className="mx-auto mb-3 text-indigo-400" />
        <p className="text-sm font-semibold text-white">{isDragActive ? "Drop files here" : "Drop files or click to select"}</p>
        <p className="text-xs text-[var(--text-muted)] mt-1">PDF, XLSX, CSV, DOCX, HTML, MD, JSON, YAML, TS, JS, PY, TXT</p>
      </div>

      {/* Chunking Settings */}
      <div className="card p-4 grid grid-cols-3 gap-4">
        <div>
          <label className="text-xs text-[var(--text-muted)] mb-1 block">Chunk Size</label>
          <input type="number" value={chunkSize} onChange={e => setChunkSize(+e.target.value)} min={200} max={4000} step={100}
            className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white" />
        </div>
        <div>
          <label className="text-xs text-[var(--text-muted)] mb-1 block">Chunk Overlap</label>
          <input type="number" value={chunkOverlap} onChange={e => setChunkOverlap(+e.target.value)} min={0} max={500} step={50}
            className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white" />
        </div>
        <div>
          <label className="text-xs text-[var(--text-muted)] mb-1 block">Strategy</label>
          <select value={strategy} onChange={e => setStrategy(e.target.value)}
            className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white">
            <option value="recursive">Recursive</option>
            <option value="semantic">Semantic</option>
            <option value="fixed">Fixed Size</option>
          </select>
        </div>
      </div>

      {/* Job List */}
      {jobs.length > 0 && (
        <div className="card divide-y divide-[var(--border)]">
          {jobs.map((job, i) => (
            <div key={i} className="flex items-center gap-3 p-3">
              <File size={14} className="text-[var(--text-muted)] shrink-0" />
              <span className="text-sm text-white flex-1 truncate">{job.file.name}</span>
              <span className="text-[11px] text-[var(--text-muted)]">{(job.file.size / 1024).toFixed(0)} KB</span>
              {job.status === "done" && <CheckCircle size={15} className="text-emerald-400" />}
              {job.status === "error" && <span className="text-[11px] text-red-400">{job.error}</span>}
              {job.status === "uploading" && <span className="text-[11px] text-indigo-400 animate-pulse">Uploading…</span>}
              {job.status === "pending" && (
                <button onClick={() => removeJob(i)}><X size={13} className="text-[var(--text-muted)] hover:text-red-400" /></button>
              )}
            </div>
          ))}
        </div>
      )}

      {jobs.some(j => j.status === "pending") && (
        <button onClick={uploadAll} className="btn-primary w-full">
          Upload {jobs.filter(j => j.status === "pending").length} File(s)
        </button>
      )}
    </div>
  );
}
