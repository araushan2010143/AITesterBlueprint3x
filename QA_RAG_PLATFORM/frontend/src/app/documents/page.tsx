"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { documentsApi } from "@/lib/api";
import { Document } from "@/types";
import { Trash2, RefreshCw, FileText, Clock } from "lucide-react";

const TYPE_COLORS: Record<string, string> = {
  test_cases: "bg-indigo-900/40 text-indigo-400",
  requirements: "bg-emerald-900/40 text-emerald-400",
  automation: "bg-violet-900/40 text-violet-400",
  report: "bg-amber-900/40 text-amber-400",
  api_docs: "bg-teal-900/40 text-teal-400",
  defects: "bg-red-900/40 text-red-400",
  general: "bg-slate-800 text-slate-400",
};

export default function DocumentsPage() {
  const qc = useQueryClient();
  const { data: docs = [], isLoading, refetch } = useQuery<Document[]>({
    queryKey: ["documents"],
    queryFn: () => documentsApi.list(),
    refetchInterval: 5000,
  });

  const deleteMut = useMutation({
    mutationFn: documentsApi.delete,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["documents"] }),
  });

  const [filter, setFilter] = useState("");

  const filtered = docs.filter(d =>
    d.filename.toLowerCase().includes(filter.toLowerCase()) ||
    (d.module ?? "").toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div className="p-6 max-w-6xl space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Documents</h1>
          <p className="text-sm text-[var(--text-muted)]">{docs.length} documents ingested</p>
        </div>
        <button onClick={() => refetch()} className="btn-ghost flex items-center gap-2 text-sm">
          <RefreshCw size={13} /> Refresh
        </button>
      </div>

      <input value={filter} onChange={e => setFilter(e.target.value)}
        placeholder="Filter by name or module…"
        className="w-full bg-[var(--surface-1)] border border-[var(--border)] rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-[var(--text-muted)] focus:outline-none focus:border-indigo-500" />

      {isLoading ? (
        <div className="text-center py-16 text-[var(--text-muted)]">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="card p-12 text-center">
          <FileText size={36} className="mx-auto mb-3 text-[var(--text-muted)]" />
          <p className="text-sm text-[var(--text-muted)]">No documents found</p>
        </div>
      ) : (
        <div className="card divide-y divide-[var(--border)] overflow-hidden">
          {filtered.map(doc => (
            <div key={doc.id} className="flex items-center gap-4 p-4 hover:bg-[var(--surface-2)] transition-all">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-white truncate">{doc.filename}</span>
                  <span className={`badge text-[10px] ${TYPE_COLORS[doc.document_type ?? "general"] ?? TYPE_COLORS.general}`}>
                    {doc.document_type ?? "general"}
                  </span>
                  {doc.module && <span className="badge bg-indigo-900/30 text-indigo-400 text-[10px]">{doc.module}</span>}
                  {doc.release && <span className="badge bg-slate-800 text-slate-400 text-[10px]">{doc.release}</span>}
                </div>
                <div className="flex items-center gap-4 mt-1 text-[11px] text-[var(--text-muted)]">
                  <span>{doc.total_chunks} chunks · {doc.total_vectors} vectors</span>
                  {doc.automation_status && <span>{doc.automation_status}</span>}
                  <span className="flex items-center gap-1"><Clock size={10} />{new Date(doc.created_at).toLocaleDateString()}</span>
                </div>
                {doc.error && <p className="text-[11px] text-red-400 mt-1">{doc.error}</p>}
              </div>
              <span className={`badge text-[10px] ${
                doc.status === "ready" ? "bg-emerald-900/40 text-emerald-400" :
                doc.status === "error" ? "bg-red-900/40 text-red-400" :
                "bg-amber-900/40 text-amber-400"
              }`}>{doc.status}</span>
              <button onClick={() => { if (confirm("Delete this document?")) deleteMut.mutate(doc.id); }}
                className="text-[var(--text-muted)] hover:text-red-400 transition-all">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
