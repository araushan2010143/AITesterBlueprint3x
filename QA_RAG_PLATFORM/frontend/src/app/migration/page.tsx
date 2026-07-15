"use client";
import { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Upload, Github, Play, Download, FileCode, CheckCircle,
  XCircle, Clock, RefreshCw, Trash2, ChevronDown, ChevronRight,
  Zap, AlertTriangle, Info, BookOpen, GitPullRequest, RotateCcw,
  ShieldCheck, ShieldAlert, ShieldX, Cpu, GitBranch, Cloud, Lock,
} from "lucide-react";
import MigrationResultViewer from "@/components/MigrationResultViewer";

// ── Types ──────────────────────────────────────────────────────────────────────

type FileStatus = {
  filename: string;
  status: "pending" | "running" | "done" | "failed";
  stage: number;       // 1-5, 0 = not started
  stageName: string;
  confidence?: number;
  language?: string;
  framework?: string;
  error?: string;
};

type ActiveJob = {
  jobId: string;
  sourceName: string;
  total: number;
  files: FileStatus[];
  jobStatus: "running" | "done" | "partial" | "failed";
  succeeded: number;
  failed: number;
};

type HistoryJob = {
  id: string;
  status: string;
  source_type: string;
  source_name: string;
  file_count: number;
  completed_files: number;
  failed_files: number;
  created_at: string;
};

type FileResult = {
  file: string;
  status: "done" | "failed";
  result?: any;
  error?: string;
};

type Standard = { id: string; name: string; filename: string; chunk_count: number; created_at: string };

type ValidationResult = {
  method: string;
  passed: boolean | null;
  error_count: number;
  errors: string[];
};

const STAGE_LABELS = ["", "Detecting", "AST Parse", "Business Logic", "POMs", "Spec", "Validate"];

const CONFIDENCE_COLOR = (n: number) =>
  n >= 80 ? "#10b981" : n >= 60 ? "#f59e0b" : "#ef4444";

// ── Sub-components ─────────────────────────────────────────────────────────────

// ── V3 sub-components ─────────────────────────────────────────────────────────

function ValidationBadge({ v }: { v?: ValidationResult }) {
  if (!v || v.method === "skipped") return null;
  const passed = v.passed;
  const [open, setOpen] = useState(false);
  const Icon = passed === true ? ShieldCheck : passed === false ? ShieldAlert : ShieldX;
  const color = passed === true ? "#10b981" : passed === false ? "#ef4444" : "#f59e0b";
  const label = passed === true ? "TS valid" : passed === null ? "TS unknown" : `${v.error_count} TS error${v.error_count !== 1 ? "s" : ""}`;
  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(!open)}
        style={{ display: "flex", alignItems: "center", gap: 4, background: "transparent", border: "none", cursor: "pointer", color, fontSize: 11 }}
        title={v.method}
      >
        <Icon size={12} /> {label}
      </button>
      <AnimatePresence>
        {open && v.errors.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            style={{ position: "absolute", right: 0, top: "100%", zIndex: 20, background: "#111827", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: 12, minWidth: 280, maxHeight: 160, overflowY: "auto" }}
          >
            {v.errors.slice(0, 8).map((e, i) => (
              <p key={i} style={{ fontSize: 11, color: "#e5e7eb", fontFamily: "monospace", marginBottom: 4, lineHeight: 1.4 }}>{e}</p>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function AstBadge({ method }: { method?: string }) {
  if (!method || method === "llm") return null;
  return (
    <span title={`Parsed via ${method}`} style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10, color: "#a78bfa", background: "rgba(124,58,237,0.1)", border: "1px solid rgba(124,58,237,0.2)", borderRadius: 4, padding: "1px 5px" }}>
      <Cpu size={9} /> AST
    </span>
  );
}

function StandardsPanel() {
  const [standards, setStandards] = useState<Standard[]>([]);
  const [uploading, setUploading] = useState(false);
  const [open, setOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const r = await fetch("/api/migration/standards");
    const d = await r.json();
    setStandards(d.standards || []);
  }, []);

  useEffect(() => { load(); }, [load]);

  const upload = async (file: File) => {
    setUploading(true);
    const form = new FormData();
    form.append("file", file);
    form.append("name", file.name.replace(/\.[^.]+$/, ""));
    await fetch("/api/migration/standards", { method: "POST", body: form });
    await load();
    setUploading(false);
  };

  const remove = async (id: string) => {
    await fetch(`/api/migration/standards/${id}`, { method: "DELETE" });
    setStandards((prev) => prev.filter((s) => s.id !== id));
  };

  return (
    <div style={{ background: "#0d111b", border: "1px solid rgba(124,58,237,0.15)", borderRadius: 12, marginBottom: 20 }}>
      <button
        onClick={() => setOpen(!open)}
        style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", background: "transparent", border: "none", cursor: "pointer", color: "#9ca3af" }}
      >
        <BookOpen size={14} color="#7c3aed" />
        <span style={{ fontSize: 13, fontWeight: 500, color: "#e5e7eb", flex: 1, textAlign: "left" }}>
          Company Coding Standards
          {standards.length > 0 && <span style={{ marginLeft: 8, fontSize: 11, color: "#7c3aed" }}>{standards.length} uploaded</span>}
        </span>
        <span style={{ fontSize: 11, color: "#4b5563" }}>V3 — injected into Stage 4+5</span>
        <motion.div animate={{ rotate: open ? 90 : 0 }} transition={{ duration: 0.15 }}>
          <ChevronRight size={13} color="#4b5563" />
        </motion.div>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} style={{ overflow: "hidden" }}>
            <div style={{ padding: "0 16px 16px" }}>
              <p style={{ fontSize: 12, color: "#6b7280", marginBottom: 12 }}>
                Upload .md or .txt files with your naming conventions, test patterns, or style guides. Relevant sections are automatically retrieved and injected into POM generation and Playwright synthesis.
              </p>
              {standards.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  {standards.map((s) => (
                    <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                      <BookOpen size={12} color="#7c3aed" />
                      <span style={{ fontSize: 12, color: "#e5e7eb", flex: 1 }}>{s.name}</span>
                      <span style={{ fontSize: 11, color: "#4b5563" }}>{s.chunk_count} sections</span>
                      <button onClick={() => remove(s.id)} style={{ background: "transparent", border: "none", cursor: "pointer", color: "#374151" }}>
                        <Trash2 size={11} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <input ref={fileRef} type="file" accept=".md,.txt" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); }} />
              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", background: "rgba(124,58,237,0.1)", border: "1px solid rgba(124,58,237,0.3)", borderRadius: 8, color: "#a78bfa", cursor: "pointer", fontSize: 12 }}
              >
                <Upload size={12} /> {uploading ? "Uploading…" : "Upload Standard"}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function PRPanel({ jobId, results }: { jobId: string; results: FileResult[] }) {
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState("");
  const [repo, setRepo] = useState("");
  const [baseBranch, setBaseBranch] = useState("main");
  const [loading, setLoading] = useState(false);
  const [prUrl, setPrUrl] = useState("");
  const [error, setError] = useState("");

  const submit = async () => {
    if (!token || !repo) return;
    setLoading(true); setError(""); setPrUrl("");
    const form = new FormData();
    form.append("github_token", token);
    form.append("repo", repo);
    form.append("base_branch", baseBranch);
    try {
      const r = await fetch(`/api/migration/jobs/${jobId}/create-pr`, { method: "POST", body: form });
      const d = await r.json();
      if (!r.ok) { setError(d.detail || "Failed"); return; }
      setPrUrl(d.pr_url);
    } catch (e: any) { setError(e.message); } finally { setLoading(false); }
  };

  const doneCount = results.filter((r) => r.status === "done").length;

  return (
    <div style={{ background: "#0d111b", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, marginTop: 16 }}>
      <button
        onClick={() => setOpen(!open)}
        style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", background: "transparent", border: "none", cursor: "pointer" }}
      >
        <GitPullRequest size={14} color="#7c3aed" />
        <span style={{ fontSize: 13, fontWeight: 500, color: "#e5e7eb", flex: 1, textAlign: "left" }}>
          Create GitHub PR <span style={{ color: "#4b5563", fontWeight: 400 }}>— push {doneCount} file{doneCount !== 1 ? "s" : ""} to your repo</span>
        </span>
        <motion.div animate={{ rotate: open ? 90 : 0 }} transition={{ duration: 0.15 }}>
          <ChevronRight size={13} color="#4b5563" />
        </motion.div>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} style={{ overflow: "hidden" }}>
            <div style={{ padding: "0 16px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
              {prUrl ? (
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px", background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.2)", borderRadius: 8 }}>
                  <CheckCircle size={16} color="#10b981" />
                  <a href={prUrl} target="_blank" rel="noopener noreferrer" style={{ color: "#10b981", fontSize: 13, fontWeight: 600 }}>PR created → {prUrl}</a>
                </div>
              ) : (
                <>
                  <input value={token} onChange={(e) => setToken(e.target.value)} placeholder="GitHub Personal Access Token (repo scope)" type="password"
                    style={{ padding: "9px 12px", background: "#111827", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, fontSize: 13, color: "#e5e7eb", outline: "none" }} />
                  <input value={repo} onChange={(e) => setRepo(e.target.value)} placeholder="owner/repository"
                    style={{ padding: "9px 12px", background: "#111827", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, fontSize: 13, color: "#e5e7eb", outline: "none" }} />
                  <input value={baseBranch} onChange={(e) => setBaseBranch(e.target.value)} placeholder="Base branch (default: main)"
                    style={{ padding: "9px 12px", background: "#111827", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, fontSize: 13, color: "#e5e7eb", outline: "none" }} />
                  {error && <p style={{ fontSize: 12, color: "#ef4444" }}>{error}</p>}
                  <button onClick={submit} disabled={loading || !token || !repo}
                    style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "9px 16px", background: loading ? "#374151" : "#7c3aed", border: "none", borderRadius: 8, color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 500 }}>
                    {loading ? <><motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}><RefreshCw size={13} /></motion.div> Creating PR…</> : <><GitPullRequest size={13} /> Create Pull Request</>}
                  </button>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function VersionHistory({ jobId }: { jobId: string }) {
  const [versions, setVersions] = useState<{ version: number; created_at: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch(`/api/migration/jobs/${jobId}/versions`);
    const d = await r.json();
    setVersions(d.versions || []);
  }, [jobId]);

  useEffect(() => { if (open) load(); }, [open, load]);

  const save = async () => {
    setSaving(true);
    await fetch(`/api/migration/jobs/${jobId}/versions`, { method: "POST" });
    await load();
    setSaving(false);
  };

  const restore = async (v: number) => {
    await fetch(`/api/migration/jobs/${jobId}/versions/${v}/restore`, { method: "POST" });
    window.location.reload();
  };

  return (
    <div style={{ background: "#0d111b", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, marginTop: 16 }}>
      <button
        onClick={() => setOpen(!open)}
        style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", background: "transparent", border: "none", cursor: "pointer" }}
      >
        <RotateCcw size={14} color="#7c3aed" />
        <span style={{ fontSize: 13, fontWeight: 500, color: "#e5e7eb", flex: 1, textAlign: "left" }}>
          Version History
          {versions.length > 0 && <span style={{ marginLeft: 8, fontSize: 11, color: "#4b5563" }}>{versions.length} snapshot{versions.length !== 1 ? "s" : ""}</span>}
        </span>
        <motion.div animate={{ rotate: open ? 90 : 0 }} transition={{ duration: 0.15 }}>
          <ChevronRight size={13} color="#4b5563" />
        </motion.div>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} style={{ overflow: "hidden" }}>
            <div style={{ padding: "0 16px 16px" }}>
              <button onClick={save} disabled={saving}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", background: "rgba(124,58,237,0.1)", border: "1px solid rgba(124,58,237,0.2)", borderRadius: 7, color: "#a78bfa", cursor: "pointer", fontSize: 12, marginBottom: 12 }}>
                {saving ? "Saving…" : "Save snapshot"}
              </button>
              {versions.length === 0 && <p style={{ fontSize: 12, color: "#4b5563" }}>No snapshots yet. Save one before re-running to allow rollback.</p>}
              {versions.map((v) => (
                <div key={v.version} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                  <span style={{ fontSize: 12, color: "#9ca3af", minWidth: 24 }}>v{v.version}</span>
                  <span style={{ fontSize: 11, color: "#6b7280", flex: 1 }}>{new Date(v.created_at).toLocaleString()}</span>
                  <button onClick={() => restore(v.version)}
                    style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 8px", background: "transparent", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 5, color: "#6b7280", cursor: "pointer", fontSize: 11 }}>
                    <RotateCcw size={9} /> Restore
                  </button>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function StageDots({ stage, status }: { stage: number; status: FileStatus["status"] }) {
  return (
    <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
      {[1, 2, 3, 4, 5, 6].map((i) => {
        const done = stage > i || status === "done";
        const active = stage === i && status === "running";
        const col = done ? "#7c3aed" : active ? "#a78bfa" : "#374151";
        return (
          <motion.div
            key={i}
            animate={active ? { scale: [1, 1.3, 1], opacity: [1, 0.6, 1] } : {}}
            transition={active ? { duration: 0.9, repeat: Infinity } : {}}
            title={STAGE_LABELS[i]}
            style={{
              width: 8, height: 8, borderRadius: "50%",
              background: col,
              border: active ? "1px solid #a78bfa" : "none",
            }}
          />
        );
      })}
    </div>
  );
}

function FileRow({ f }: { f: FileStatus }) {
  const statusIcon =
    f.status === "done" ? <CheckCircle size={14} color="#10b981" /> :
    f.status === "failed" ? <XCircle size={14} color="#ef4444" /> :
    f.status === "running" ? <motion.div animate={{ rotate: 360 }} transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }}><RefreshCw size={14} color="#7c3aed" /></motion.div> :
    <Clock size={14} color="#4b5563" />;

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: "10px 16px",
        borderBottom: "1px solid rgba(255,255,255,0.04)",
        background: f.status === "running" ? "rgba(124,58,237,0.04)" : "transparent",
      }}
    >
      {statusIcon}
      <span style={{ flex: 1, fontSize: 13, color: "#e5e7eb", fontFamily: "monospace" }}>
        {f.filename}
      </span>
      {f.language && (
        <span style={{ fontSize: 11, color: "#6b7280", minWidth: 40 }}>{f.language}</span>
      )}
      {f.status === "running" && (
        <span style={{ fontSize: 11, color: "#a78bfa", minWidth: 100 }}>{f.stageName}</span>
      )}
      {f.status === "done" && f.confidence !== undefined && (
        <span style={{ fontSize: 12, fontWeight: 700, color: CONFIDENCE_COLOR(f.confidence), minWidth: 40 }}>
          {f.confidence}%
        </span>
      )}
      {f.status === "failed" && (
        <span style={{ fontSize: 11, color: "#ef4444", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {f.error}
        </span>
      )}
      <StageDots stage={f.stage} status={f.status} />
    </motion.div>
  );
}

function ExpandableResult({ fr }: { fr: FileResult }) {
  const [open, setOpen] = useState(false);
  const conf = fr.result?.confidence_score ?? 0;
  const sa = fr.result?.source_analysis ?? {};
  return (
    <div style={{ border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10, marginBottom: 8, overflow: "hidden" }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: "100%", display: "flex", alignItems: "center", gap: 12,
          padding: "12px 16px", background: "transparent", border: "none",
          cursor: "pointer", color: "#e5e7eb", textAlign: "left",
        }}
      >
        {fr.status === "done" ? <CheckCircle size={14} color="#10b981" /> : <XCircle size={14} color="#ef4444" />}
        <span style={{ flex: 1, fontSize: 13, fontFamily: "monospace" }}>{fr.file}</span>
        {fr.status === "done" && (
          <>
            <span style={{ fontSize: 11, color: "#6b7280" }}>{sa.language} · {sa.framework}</span>
            <AstBadge method={fr.result?.ast_method} />
            <ValidationBadge v={fr.result?.validation} />
            <span style={{ fontSize: 13, fontWeight: 700, color: CONFIDENCE_COLOR(conf), marginLeft: 4 }}>{conf}%</span>
          </>
        )}
        {fr.status === "failed" && (
          <span style={{ fontSize: 11, color: "#ef4444" }}>Failed</span>
        )}
        <motion.div animate={{ rotate: open ? 90 : 0 }} transition={{ duration: 0.15 }}>
          <ChevronRight size={14} color="#4b5563" />
        </motion.div>
      </button>
      <AnimatePresence>
        {open && fr.status === "done" && fr.result && (
          <motion.div
            initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }}
            style={{ overflow: "hidden" }}
          >
            <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", padding: 16 }}>
              <MigrationResultViewer result={fr.result} />
            </div>
          </motion.div>
        )}
        {open && fr.status === "failed" && (
          <motion.div
            initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }}
            style={{ overflow: "hidden" }}
          >
            <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", padding: 16 }}>
              <p style={{ fontSize: 13, color: "#ef4444", fontFamily: "monospace" }}>{fr.error}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function HistoryRow({ job, onOpen }: { job: HistoryJob; onOpen: (id: string) => void }) {
  const statusColor = job.status === "done" ? "#10b981" : job.status === "partial" ? "#f59e0b" : job.status === "failed" ? "#ef4444" : "#6b7280";
  const d = new Date(job.created_at);
  const ago = Math.round((Date.now() - d.getTime()) / 60000);
  const timeStr = ago < 60 ? `${ago}m ago` : ago < 1440 ? `${Math.round(ago / 60)}h ago` : d.toLocaleDateString();

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,0.04)",
        cursor: "pointer",
      }}
      whileHover={{ background: "rgba(124,58,237,0.05)" }}
      onClick={() => onOpen(job.id)}
    >
      <div style={{ width: 8, height: 8, borderRadius: "50%", background: statusColor, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, color: "#e5e7eb", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {job.source_name}
        </div>
        <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>
          {job.source_type === "github" ? "GitHub" : "ZIP"} · {timeStr}
        </div>
      </div>
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <div style={{ fontSize: 12, color: "#9ca3af" }}>{job.completed_files}/{job.file_count} files</div>
        <div style={{ fontSize: 11, color: statusColor, textTransform: "capitalize" }}>{job.status}</div>
      </div>
      <ChevronRight size={14} color="#4b5563" />
    </motion.div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function MigrationPage() {
  const [tab, setTab] = useState<"new" | "history">("new");
  const [sourceType, setSourceType] = useState<"zip" | "github" | "gitlab" | "bitbucket" | "azure" | "s3">("zip");
  const [repoUrl, setRepoUrl] = useState("");
  const [repoToken, setRepoToken] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

  const [activeJob, setActiveJob] = useState<ActiveJob | null>(null);
  const [completedResults, setCompletedResults] = useState<FileResult[] | null>(null);

  const [history, setHistory] = useState<HistoryJob[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [openHistoryJob, setOpenHistoryJob] = useState<string | null>(null);
  const [historyResults, setHistoryResults] = useState<Record<string, FileResult[]>>({});

  const fileInputRef = useRef<HTMLInputElement>(null);
  const evtSourceRef = useRef<EventSource | null>(null);

  // ── Load history ───────────────────────────────────────────────────────────

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const r = await fetch("/api/migration/jobs");
      const d = await r.json();
      setHistory(d.jobs || []);
    } catch { /* ignore */ } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === "history") loadHistory();
  }, [tab, loadHistory]);

  // ── Start job ──────────────────────────────────────────────────────────────

  const startJob = async () => {
    setUploadError("");
    const isUrl = sourceType !== "zip";
    if (!isUrl && !selectedFile) { setUploadError("Please select a ZIP file"); return; }
    if (isUrl && !repoUrl.trim()) { setUploadError("Please enter a repository URL"); return; }

    setUploading(true);
    setActiveJob(null);
    setCompletedResults(null);

    const form = new FormData();
    if (!isUrl && selectedFile) form.append("file", selectedFile);
    if (isUrl) {
      form.append("repo_url", repoUrl.trim());
      if (repoToken.trim()) form.append("repo_token", repoToken.trim());
    }

    let jobId = "";
    let sourceName = "";
    let fileCount = 0;

    try {
      const r = await fetch("/api/migration/jobs", { method: "POST", body: form });
      if (!r.ok) {
        const e = await r.json();
        throw new Error(e.detail || "Failed to create job");
      }
      const d = await r.json();
      jobId = d.job_id;
      sourceName = d.source_name;
      fileCount = d.file_count;
    } catch (err: any) {
      setUploadError(err.message || "Upload failed");
      setUploading(false);
      return;
    }

    setUploading(false);
    setActiveJob({
      jobId, sourceName, total: fileCount,
      files: [],
      jobStatus: "running",
      succeeded: 0, failed: 0,
    });

    // Open SSE stream
    if (evtSourceRef.current) evtSourceRef.current.close();
    const es = new EventSource(`/api/migration/jobs/${jobId}/stream`);
    evtSourceRef.current = es;

    es.onmessage = (e) => {
      const evt = JSON.parse(e.data);

      if (evt.type === "ping") return;

      if (evt.type === "job_start") {
        setActiveJob((prev) => prev ? { ...prev, total: evt.total } : prev);
      }

      if (evt.type === "file_start") {
        setActiveJob((prev) => {
          if (!prev) return prev;
          const files = [...prev.files];
          if (!files.find((f) => f.filename === evt.file)) {
            files.push({ filename: evt.file, status: "pending", stage: 0, stageName: "" });
          }
          return { ...prev, files };
        });
      }

      if (evt.type === "stage") {
        setActiveJob((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            files: prev.files.map((f) =>
              f.filename === evt.file
                ? { ...f, status: "running", stage: evt.stage, stageName: evt.stage_name }
                : f
            ),
          };
        });
      }

      if (evt.type === "file_done") {
        setActiveJob((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            files: prev.files.map((f) =>
              f.filename === evt.file
                ? { ...f, status: "done", stage: 5, stageName: "", confidence: evt.confidence, language: evt.language, framework: evt.framework }
                : f
            ),
          };
        });
      }

      if (evt.type === "file_failed") {
        setActiveJob((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            files: prev.files.map((f) =>
              f.filename === evt.file
                ? { ...f, status: "failed", stage: 0, stageName: "", error: evt.error }
                : f
            ),
          };
        });
      }

      if (evt.type === "job_done") {
        es.close();
        setActiveJob((prev) => prev ? { ...prev, jobStatus: evt.status, succeeded: evt.succeeded, failed: evt.failed } : prev);
        // Fetch final detailed results
        fetch(`/api/migration/jobs/${jobId}`)
          .then((r) => r.json())
          .then((d) => setCompletedResults(d.results || []));
      }
    };

    es.onerror = () => {
      es.close();
      setActiveJob((prev) => prev && prev.jobStatus === "running" ? { ...prev, jobStatus: "failed" } : prev);
    };
  };

  // ── History detail ─────────────────────────────────────────────────────────

  const openHistoryDetail = async (id: string) => {
    setOpenHistoryJob((prev) => (prev === id ? null : id));
    if (!historyResults[id]) {
      const r = await fetch(`/api/migration/jobs/${id}`);
      const d = await r.json();
      setHistoryResults((prev) => ({ ...prev, [id]: d.results || [] }));
    }
  };

  const deleteJob = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await fetch(`/api/migration/jobs/${id}`, { method: "DELETE" });
    setHistory((prev) => prev.filter((j) => j.id !== id));
    if (openHistoryJob === id) setOpenHistoryJob(null);
  };

  // ── Drag handlers ──────────────────────────────────────────────────────────

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f?.name.endsWith(".zip")) setSelectedFile(f);
    else setUploadError("Please drop a .zip file");
  };

  // ── Summary bar ────────────────────────────────────────────────────────────

  const jobDone = activeJob && activeJob.jobStatus !== "running";
  const avgConf = completedResults
    ? Math.round(
        completedResults.filter((r) => r.status === "done").reduce((s, r) => s + (r.result?.confidence_score ?? 0), 0) /
        Math.max(1, completedResults.filter((r) => r.status === "done").length)
      )
    : 0;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ padding: "32px 40px", maxWidth: 900, margin: "0 auto" }}>

      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(225,29,72,0.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <RefreshCw size={18} color="#e11d48" />
          </div>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: "#f9fafb", margin: 0 }}>Migration Studio</h1>
            <span style={{ fontSize: 12, color: "#6b7280" }}>V2 — Multi-file pipeline with real-time progress</span>
          </div>
          <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 700, color: "#e11d48", background: "rgba(225,29,72,0.12)", border: "1px solid rgba(225,29,72,0.2)", borderRadius: 6, padding: "2px 8px", letterSpacing: "0.06em" }}>
            BETA
          </span>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ display: "flex", gap: 4, marginBottom: 28, background: "#111827", borderRadius: 10, padding: 4, width: "fit-content" }}>
        {(["new", "history"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: "7px 20px", borderRadius: 7, border: "none", cursor: "pointer",
              fontSize: 13, fontWeight: 500,
              background: tab === t ? "#7c3aed" : "transparent",
              color: tab === t ? "#fff" : "#6b7280",
              transition: "all 0.15s",
            }}
          >
            {t === "new" ? "New Migration" : "History"}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">

        {/* ── New Migration tab ── */}
        {tab === "new" && (
          <motion.div key="new" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>

            {/* V3: Standards panel — always visible */}
            {!activeJob && <StandardsPanel />}

            {/* Source selector */}
            {!activeJob && (
              <>
                {/* Source type pills */}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
                  {([
                    { id: "zip",       icon: <Upload size={13} />,    label: "ZIP Upload"   },
                    { id: "github",    icon: <Github size={13} />,    label: "GitHub"       },
                    { id: "gitlab",    icon: <GitBranch size={13} />, label: "GitLab"       },
                    { id: "bitbucket", icon: <Cloud size={13} />,     label: "Bitbucket"    },
                    { id: "azure",     icon: <FileCode size={13} />,  label: "Azure DevOps" },
                    { id: "s3",        icon: <Cloud size={13} />,     label: "S3 Bucket"    },
                  ] as const).map(({ id, icon, label }) => (
                    <button key={id}
                      onClick={() => { setSourceType(id as any); setUploadError(""); setRepoUrl(""); setRepoToken(""); }}
                      style={{
                        display: "flex", alignItems: "center", gap: 6,
                        padding: "7px 14px", borderRadius: 9, cursor: "pointer",
                        fontSize: 12, fontWeight: 500,
                        border: sourceType === id ? "1px solid rgba(124,58,237,0.5)" : "1px solid rgba(255,255,255,0.07)",
                        background: sourceType === id ? "rgba(124,58,237,0.12)" : "#111827",
                        color: sourceType === id ? "#a78bfa" : "#6b7280",
                        transition: "all 0.15s",
                      }}>
                      {icon} {label}
                    </button>
                  ))}
                </div>

                {/* ZIP drop zone */}
                {sourceType === "zip" && (
                  <div
                    onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={onDrop}
                    onClick={() => fileInputRef.current?.click()}
                    style={{
                      border: `2px dashed ${dragOver ? "#7c3aed" : selectedFile ? "rgba(124,58,237,0.4)" : "rgba(255,255,255,0.1)"}`,
                      borderRadius: 14, padding: "48px 32px",
                      textAlign: "center", cursor: "pointer",
                      background: dragOver ? "rgba(124,58,237,0.06)" : selectedFile ? "rgba(124,58,237,0.04)" : "#0d111b",
                      transition: "all 0.2s", marginBottom: 16,
                    }}
                  >
                    <input ref={fileInputRef} type="file" accept=".zip" style={{ display: "none" }}
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) setSelectedFile(f); }}
                    />
                    <Upload size={32} color={selectedFile ? "#7c3aed" : "#374151"} style={{ margin: "0 auto 12px" }} />
                    {selectedFile ? (
                      <>
                        <p style={{ fontSize: 15, fontWeight: 600, color: "#a78bfa", marginBottom: 4 }}>{selectedFile.name}</p>
                        <p style={{ fontSize: 12, color: "#6b7280" }}>{(selectedFile.size / 1024).toFixed(0)} KB — click to change</p>
                      </>
                    ) : (
                      <>
                        <p style={{ fontSize: 15, fontWeight: 600, color: "#6b7280", marginBottom: 6 }}>Drop your test suite ZIP here</p>
                        <p style={{ fontSize: 12, color: "#4b5563" }}>Java · Python · C# · TypeScript · Robot · Gherkin · up to 50 files</p>
                      </>
                    )}
                  </div>
                )}

                {/* URL-based sources */}
                {sourceType !== "zip" && (() => {
                  const cfg: Record<string, { placeholder: string; hint: string; tokenLabel?: string; tokenHint?: string }> = {
                    github: {
                      placeholder: "https://github.com/owner/repo",
                      hint: "Public repos need no token. For private repos enter a Personal Access Token.",
                      tokenLabel: "Personal Access Token (optional)",
                      tokenHint: "Needs repo read scope",
                    },
                    gitlab: {
                      placeholder: "https://gitlab.com/namespace/repo  or  https://your-gitlab.company.com/ns/repo",
                      hint: "Works with gitlab.com and self-hosted GitLab instances.",
                      tokenLabel: "Private Token / PAT (optional for private repos)",
                      tokenHint: "Settings → Access Tokens → read_repository scope",
                    },
                    bitbucket: {
                      placeholder: "https://bitbucket.org/workspace/repo",
                      hint: "Bitbucket Cloud (bitbucket.org). For private repos use username:app_password.",
                      tokenLabel: "Credentials: username:app_password (optional)",
                      tokenHint: "Bitbucket → Personal Settings → App passwords → Repository read",
                    },
                    azure: {
                      placeholder: "https://dev.azure.com/org/project/_git/repo",
                      hint: "Azure DevOps Services. Private projects require a Personal Access Token.",
                      tokenLabel: "Personal Access Token",
                      tokenHint: "User Settings → Personal Access Tokens → Code (Read) scope",
                    },
                    s3: {
                      placeholder: "s3://bucket-name/path/archive.zip  or  https://bucket.s3.amazonaws.com/archive.zip",
                      hint: "Public buckets work directly. For private buckets: AWS Console → S3 → object → Share with pre-signed URL.",
                    },
                  };
                  const c = cfg[sourceType] || cfg.github;
                  return (
                    <div style={{ marginBottom: 16, display: "flex", flexDirection: "column", gap: 10 }}>
                      <input
                        type="text"
                        value={repoUrl}
                        onChange={(e) => setRepoUrl(e.target.value)}
                        placeholder={c.placeholder}
                        style={{ width: "100%", padding: "12px 14px", background: "#0d111b", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, fontSize: 13, color: "#e5e7eb", outline: "none" }}
                      />
                      {c.tokenLabel && (
                        <div style={{ position: "relative" }}>
                          <Lock size={13} color="#4b5563" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }} />
                          <input
                            type="password"
                            value={repoToken}
                            onChange={(e) => setRepoToken(e.target.value)}
                            placeholder={c.tokenLabel}
                            style={{ width: "100%", padding: "10px 12px 10px 32px", background: "#0d111b", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, fontSize: 13, color: "#e5e7eb", outline: "none" }}
                          />
                        </div>
                      )}
                      <p style={{ fontSize: 11, color: "#4b5563", margin: 0 }}>
                        {c.hint}{c.tokenHint && <span style={{ color: "#374151" }}> — {c.tokenHint}</span>}
                      </p>
                    </div>
                  );
                })()}

                {uploadError && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 8, marginBottom: 16 }}>
                    <AlertTriangle size={14} color="#ef4444" />
                    <span style={{ fontSize: 13, color: "#ef4444" }}>{uploadError}</span>
                  </div>
                )}

                <motion.button
                  whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}
                  onClick={startJob}
                  disabled={uploading}
                  style={{
                    width: "100%", padding: "14px", borderRadius: 12, border: "none",
                    background: uploading ? "#374151" : "linear-gradient(135deg, #7c3aed, #e11d48)",
                    color: "#fff", fontSize: 14, fontWeight: 600, cursor: uploading ? "not-allowed" : "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  }}
                >
                  {uploading ? (
                    <><motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}><RefreshCw size={16} /></motion.div> Uploading…</>
                  ) : (
                    <><Play size={16} /> Start Migration</>
                  )}
                </motion.button>
              </>
            )}

            {/* ── Active job progress ── */}
            {activeJob && (
              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
                {/* Job header */}
                <div style={{ background: "#111827", border: "1px solid rgba(124,58,237,0.2)", borderRadius: 14, marginBottom: 16, overflow: "hidden" }}>
                  <div style={{ padding: "16px 20px", borderBottom: "1px solid rgba(255,255,255,0.05)", display: "flex", alignItems: "center", gap: 12 }}>
                    {activeJob.jobStatus === "running" ? (
                      <motion.div animate={{ rotate: 360 }} transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}>
                        <RefreshCw size={16} color="#7c3aed" />
                      </motion.div>
                    ) : activeJob.jobStatus === "done" ? (
                      <CheckCircle size={16} color="#10b981" />
                    ) : activeJob.jobStatus === "partial" ? (
                      <AlertTriangle size={16} color="#f59e0b" />
                    ) : (
                      <XCircle size={16} color="#ef4444" />
                    )}
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: 13, fontWeight: 600, color: "#e5e7eb", margin: 0 }}>{activeJob.sourceName}</p>
                      <p style={{ fontSize: 11, color: "#6b7280", margin: 0 }}>
                        {activeJob.files.filter((f) => f.status === "done").length + activeJob.files.filter((f) => f.status === "failed").length}
                        /{activeJob.total} files processed
                      </p>
                    </div>
                    {jobDone && (
                      <div style={{ display: "flex", gap: 8 }}>
                        <a
                          href={`/api/migration/jobs/${activeJob.jobId}/report`}
                          target="_blank" rel="noopener noreferrer"
                          style={{ fontSize: 12, color: "#a78bfa", textDecoration: "none", padding: "6px 12px", border: "1px solid rgba(124,58,237,0.3)", borderRadius: 8 }}
                        >
                          View Report
                        </a>
                        <a
                          href={`/api/migration/jobs/${activeJob.jobId}/download`}
                          style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#fff", textDecoration: "none", padding: "6px 12px", background: "#7c3aed", borderRadius: 8 }}
                        >
                          <Download size={12} /> Download ZIP
                        </a>
                      </div>
                    )}
                  </div>

                  {/* Progress bar */}
                  <div style={{ height: 3, background: "#1f2937" }}>
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${activeJob.total > 0 ? ((activeJob.files.filter(f => f.status === "done" || f.status === "failed").length) / activeJob.total) * 100 : 0}%` }}
                      transition={{ duration: 0.5 }}
                      style={{ height: "100%", background: "linear-gradient(90deg, #7c3aed, #e11d48)" }}
                    />
                  </div>

                  {/* File rows */}
                  <div>
                    {activeJob.files.map((f) => <FileRow key={f.filename} f={f} />)}
                    {activeJob.jobStatus === "running" && activeJob.files.length === 0 && (
                      <div style={{ padding: "24px", textAlign: "center", color: "#4b5563", fontSize: 13 }}>Initialising pipeline…</div>
                    )}
                  </div>
                </div>

                {/* Summary after done */}
                {jobDone && (
                  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                    <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
                      {[
                        { label: "Succeeded", value: activeJob.succeeded, color: "#10b981" },
                        { label: "Failed", value: activeJob.failed, color: "#ef4444" },
                        { label: "Avg Confidence", value: `${avgConf}%`, color: avgConf >= 80 ? "#10b981" : avgConf >= 60 ? "#f59e0b" : "#ef4444" },
                      ].map(({ label, value, color }) => (
                        <div key={label} style={{ flex: 1, background: "#111827", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10, padding: "14px 16px" }}>
                          <div style={{ fontSize: 20, fontWeight: 700, color }}>{value}</div>
                          <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>{label}</div>
                        </div>
                      ))}
                    </div>

                    {/* Per-file expandable results */}
                    {completedResults && completedResults.map((fr) => (
                      <ExpandableResult key={fr.file} fr={fr} />
                    ))}

                    {/* V3: PR generation + Version history */}
                    {completedResults && (
                      <>
                        <PRPanel jobId={activeJob.jobId} results={completedResults} />
                        <VersionHistory jobId={activeJob.jobId} />
                      </>
                    )}

                    <button
                      onClick={() => { setActiveJob(null); setCompletedResults(null); setSelectedFile(null); setRepoUrl(""); setRepoToken(""); }}
                      style={{ marginTop: 16, padding: "10px 20px", background: "transparent", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, color: "#6b7280", cursor: "pointer", fontSize: 13 }}
                    >
                      Start another migration
                    </button>
                  </motion.div>
                )}
              </motion.div>
            )}
          </motion.div>
        )}

        {/* ── History tab ── */}
        {tab === "history" && (
          <motion.div key="history" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <span style={{ fontSize: 13, color: "#6b7280" }}>{history.length} migration{history.length !== 1 ? "s" : ""}</span>
              <button onClick={loadHistory} style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, padding: "6px 12px", color: "#6b7280", cursor: "pointer", fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
                <RefreshCw size={11} /> Refresh
              </button>
            </div>

            {historyLoading && (
              <div style={{ textAlign: "center", padding: 40, color: "#4b5563" }}>Loading…</div>
            )}

            {!historyLoading && history.length === 0 && (
              <div style={{ textAlign: "center", padding: 60, color: "#4b5563", fontSize: 14 }}>
                No migrations yet.<br />
                <span style={{ fontSize: 12 }}>Start one in the "New Migration" tab.</span>
              </div>
            )}

            {!historyLoading && history.length > 0 && (
              <div style={{ background: "#111827", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, overflow: "hidden" }}>
                {history.map((job) => (
                  <div key={job.id}>
                    <div style={{ display: "flex", alignItems: "center" }}>
                      <div style={{ flex: 1 }}>
                        <HistoryRow job={job} onOpen={openHistoryDetail} />
                      </div>
                      <button
                        onClick={(e) => deleteJob(job.id, e)}
                        style={{ padding: "12px 16px", background: "transparent", border: "none", cursor: "pointer", color: "#374151" }}
                        title="Delete"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                    <AnimatePresence>
                      {openHistoryJob === job.id && historyResults[job.id] && (
                        <motion.div
                          initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }}
                          style={{ overflow: "hidden", borderTop: "1px solid rgba(255,255,255,0.04)" }}
                        >
                          <div style={{ padding: 16 }}>
                            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                              <a href={`/api/migration/jobs/${job.id}/report`} target="_blank" rel="noopener noreferrer"
                                style={{ fontSize: 12, color: "#a78bfa", textDecoration: "none", padding: "5px 12px", border: "1px solid rgba(124,58,237,0.3)", borderRadius: 7 }}>
                                View Report
                              </a>
                              <a href={`/api/migration/jobs/${job.id}/download`}
                                style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "#fff", textDecoration: "none", padding: "5px 12px", background: "#7c3aed", borderRadius: 7 }}>
                                <Download size={11} /> Download ZIP
                              </a>
                            </div>
                            {historyResults[job.id].map((fr) => (
                              <ExpandableResult key={fr.file} fr={fr} />
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  );
}
