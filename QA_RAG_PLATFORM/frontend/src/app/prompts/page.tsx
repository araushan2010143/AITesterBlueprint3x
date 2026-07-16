"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { promptsApi } from "@/lib/api";
import {
  BookOpen, Plus, CheckCircle, Clock, ChevronDown, ChevronUp,
  Copy, Trash2, Zap, AlertTriangle, Eye, GitBranch,
} from "lucide-react";

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function diffLines(a: string, b: string): Array<{ type: "eq" | "add" | "del"; text: string }> {
  const la = a.split("\n");
  const lb = b.split("\n");
  const result: Array<{ type: "eq" | "add" | "del"; text: string }> = [];
  const maxLen = Math.max(la.length, lb.length);
  for (let i = 0; i < maxLen; i++) {
    const lineA = la[i];
    const lineB = lb[i];
    if (lineA === lineB) {
      result.push({ type: "eq", text: lineA ?? "" });
    } else {
      if (lineA !== undefined) result.push({ type: "del", text: lineA });
      if (lineB !== undefined) result.push({ type: "add", text: lineB });
    }
  }
  return result;
}

function VersionCard({ version, allVersions, onActivate, activating }: {
  version: any;
  allVersions: any[];
  onActivate: () => void;
  activating: boolean;
}) {
  const [showContent, setShowContent] = useState(false);
  const [showDiff, setShowDiff] = useState(false);
  const [copied, setCopied] = useState(false);

  const prev = allVersions.find((v: any) => v.version === version.version - 1);

  function copy() {
    navigator.clipboard.writeText(version.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden", background: "var(--surface-1)" }}>
      <div style={{ padding: "12px 16px", display: "flex", alignItems: "center", gap: 12 }}>
        {/* Version badge */}
        <div style={{
          width: 36, height: 36, borderRadius: 9, flexShrink: 0,
          background: version.is_active ? "rgba(124,58,237,0.15)" : "var(--surface-2)",
          border: `1px solid ${version.is_active ? "rgba(124,58,237,0.4)" : "var(--border)"}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 11, fontWeight: 800,
          color: version.is_active ? "#a78bfa" : "var(--text-3)",
        }}>
          v{version.version}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            {version.is_active && (
              <span style={{ fontSize: 9, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", padding: "2px 7px", borderRadius: 4, background: "rgba(124,58,237,0.15)", color: "#a78bfa", border: "1px solid rgba(124,58,237,0.3)" }}>
                Active
              </span>
            )}
            {version.description && (
              <span style={{ fontSize: 12, color: "var(--text-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{version.description}</span>
            )}
          </div>
          <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 3, display: "flex", gap: 10 }}>
            <span>{version.created_at ? timeAgo(version.created_at) : "—"}</span>
            {version.created_by && <span>by {version.created_by}</span>}
            {version.team_id && <span>Team: {version.team_id}</span>}
            <span style={{ fontFamily: "monospace", fontSize: 10, color: "var(--text-3)" }}>{version.content?.length ?? 0} chars</span>
          </div>
        </div>

        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
          <button onClick={() => setShowContent(v => !v)} title="Preview content"
            style={{ display: "flex", alignItems: "center", gap: 4, padding: "5px 9px", borderRadius: 7, border: "1px solid var(--border)", background: "var(--surface-2)", cursor: "pointer", color: "var(--text-2)", fontSize: 11 }}>
            <Eye size={11} /> {showContent ? "Hide" : "Preview"}
          </button>
          {prev && (
            <button onClick={() => setShowDiff(v => !v)} title="Diff with previous version"
              style={{ display: "flex", alignItems: "center", gap: 4, padding: "5px 9px", borderRadius: 7, border: "1px solid var(--border)", background: "var(--surface-2)", cursor: "pointer", color: "var(--text-2)", fontSize: 11 }}>
              <GitBranch size={11} /> Diff
            </button>
          )}
          <button onClick={copy} title="Copy content"
            style={{ display: "flex", alignItems: "center", gap: 4, padding: "5px 9px", borderRadius: 7, border: "1px solid var(--border)", background: "var(--surface-2)", cursor: "pointer", color: copied ? "#22c55e" : "var(--text-2)", fontSize: 11 }}>
            <Copy size={11} /> {copied ? "Copied!" : "Copy"}
          </button>
          {!version.is_active && (
            <button onClick={onActivate} disabled={activating}
              style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 12px", borderRadius: 7, border: "none", background: "linear-gradient(135deg,#7c3aed,#a78bfa)", color: "white", cursor: "pointer", fontSize: 11, fontWeight: 700, opacity: activating ? 0.6 : 1 }}>
              {activating ? <Clock size={11} style={{ animation: "spin 0.8s linear infinite" }} /> : <CheckCircle size={11} />}
              Activate
            </button>
          )}
        </div>
      </div>

      <AnimatePresence>
        {showContent && (
          <motion.div
            initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }} style={{ overflow: "hidden" }}>
            <div style={{ borderTop: "1px solid var(--border)" }}>
              <pre style={{ margin: 0, padding: "12px 16px", fontSize: 12, lineHeight: 1.7, color: "#e6edf3", background: "#0d1117", overflowX: "auto", whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 300, overflowY: "auto" }}>
                {version.content}
              </pre>
            </div>
          </motion.div>
        )}

        {showDiff && prev && (
          <motion.div
            initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }} style={{ overflow: "hidden" }}>
            <div style={{ borderTop: "1px solid var(--border)" }}>
              <div style={{ padding: "8px 12px", background: "var(--surface-2)", borderBottom: "1px solid var(--border)" }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  Diff — v{prev.version} → v{version.version}
                </span>
              </div>
              <div style={{ maxHeight: 300, overflowY: "auto" }}>
                {diffLines(prev.content, version.content).map((line, i) => (
                  <div key={i} style={{
                    padding: "1px 12px", fontFamily: "monospace", fontSize: 11, lineHeight: 1.6,
                    background: line.type === "add" ? "#0a2d14" : line.type === "del" ? "#2d0a0a" : "transparent",
                    color: line.type === "add" ? "#86efac" : line.type === "del" ? "#fca5a5" : "#9ca3af",
                    borderLeft: `3px solid ${line.type === "add" ? "#22c55e" : line.type === "del" ? "#ef4444" : "transparent"}`,
                    whiteSpace: "pre-wrap", wordBreak: "break-word",
                  }}>
                    {line.type === "add" ? "+ " : line.type === "del" ? "- " : "  "}{line.text}
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function PromptGroup({ name, versions }: { name: string; versions: any[] }) {
  const qc = useQueryClient();
  const [activating, setActivating] = useState<number | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const sorted = [...versions].sort((a, b) => b.version - a.version);
  const activeVersion = sorted.find(v => v.is_active);

  const activateMutation = useMutation({
    mutationFn: (id: number) => promptsApi.activate(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["prompts"] }); setActivating(null); },
    onError: () => setActivating(null),
  });

  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
      {/* Group header */}
      <button onClick={() => setCollapsed(v => !v)}
        style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", width: "100%", background: "var(--surface-2)", border: "none", borderBottom: collapsed ? "none" : "1px solid var(--border)", cursor: "pointer", textAlign: "left" }}>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(124,58,237,0.12)", border: "1px solid rgba(124,58,237,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <BookOpen size={14} color="#7c3aed" />
        </div>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 14, fontWeight: 700, color: "var(--text-1)", margin: 0, fontFamily: "monospace" }}>{name}</p>
          <p style={{ fontSize: 11, color: "var(--text-3)", margin: 0 }}>{versions.length} version{versions.length !== 1 ? "s" : ""} · Active: v{activeVersion?.version ?? "none"}</p>
        </div>
        {activeVersion && (
          <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 5, background: "rgba(34,197,94,0.1)", color: "#22c55e", border: "1px solid rgba(34,197,94,0.25)", fontWeight: 700 }}>
            Live v{activeVersion.version}
          </span>
        )}
        {collapsed ? <ChevronDown size={14} color="var(--text-3)" /> : <ChevronUp size={14} color="var(--text-3)" />}
      </button>

      <AnimatePresence>
        {!collapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }} style={{ overflow: "hidden" }}>
            <div style={{ padding: "12px", display: "flex", flexDirection: "column", gap: 8 }}>
              {sorted.map((v: any) => (
                <VersionCard key={v.id ?? `${name}-v${v.version}`} version={v} allVersions={sorted}
                  activating={activating === v.id}
                  onActivate={() => {
                    setActivating(v.id);
                    activateMutation.mutate(v.id);
                  }} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function CreatePromptModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [content, setContent] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");

  const mutation = useMutation({
    mutationFn: () => promptsApi.create({ name, content, description }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["prompts"] }); onClose(); },
    onError: (e: any) => setError(e?.response?.data?.detail ?? "Failed to create prompt"),
  });

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.6)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
        style={{ background: "var(--surface-1)", border: "1px solid var(--border)", borderRadius: 16, padding: 24, width: 560, maxHeight: "90vh", overflowY: "auto" }}>
        <h2 style={{ fontSize: 16, fontWeight: 800, color: "var(--text-1)", margin: "0 0 20px" }}>New Prompt Version</h2>

        <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 20 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.08em", display: "block", marginBottom: 5 }}>Prompt Name</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="qa_agent_system, coverage_analyzer…"
              style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--text-1)", fontSize: 13, fontFamily: "monospace", boxSizing: "border-box" }} />
            <p style={{ fontSize: 10, color: "var(--text-3)", margin: "4px 0 0" }}>If this name already exists a new version is created; otherwise a new prompt is created.</p>
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.08em", display: "block", marginBottom: 5 }}>Description (optional)</label>
            <input value={description} onChange={e => setDescription(e.target.value)} placeholder="What changed in this version?"
              style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--text-1)", fontSize: 13, boxSizing: "border-box" }} />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.08em", display: "block", marginBottom: 5 }}>Content</label>
            <textarea value={content} onChange={e => setContent(e.target.value)} rows={12} placeholder="You are a QA intelligence assistant…"
              style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--text-1)", fontSize: 13, fontFamily: "monospace", lineHeight: 1.6, resize: "vertical", boxSizing: "border-box" }} />
            <p style={{ fontSize: 10, color: "var(--text-3)", margin: "4px 0 0", textAlign: "right" }}>{content.length} chars</p>
          </div>
        </div>

        {error && <p style={{ fontSize: 12, color: "#ef4444", marginBottom: 12 }}>{error}</p>}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--text-2)", fontSize: 13, cursor: "pointer" }}>Cancel</button>
          <button onClick={() => mutation.mutate()} disabled={!name.trim() || !content.trim() || mutation.isPending}
            style={{ padding: "8px 20px", borderRadius: 8, border: "none", background: "linear-gradient(135deg,#7c3aed,#a78bfa)", color: "white", fontSize: 13, fontWeight: 700, cursor: "pointer", opacity: mutation.isPending ? 0.6 : 1 }}>
            {mutation.isPending ? "Saving…" : "Save Version"}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

export default function PromptsPage() {
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["prompts"],
    queryFn: () => promptsApi.list(),
    refetchInterval: 15_000,
  });

  const allVersions: any[] = data?.prompts ?? data ?? [];

  // Group by prompt name — skip records where name is missing/empty
  const grouped: Record<string, any[]> = {};
  allVersions.forEach((v: any) => {
    const key = v.name ?? v.prompt_name ?? "";
    if (!key) return;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(v);
  });

  const filteredNames = Object.keys(grouped).filter(n => !search || n.toLowerCase().includes(search.toLowerCase()));
  const totalActive = allVersions.filter((v: any) => v.is_active).length;

  return (
    <div style={{ padding: "28px 32px", maxWidth: 1000 }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
        style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text-1)", margin: 0, display: "flex", alignItems: "center", gap: 10 }}>
            <BookOpen size={20} color="#7c3aed" /> Prompt Versions
          </h1>
          <p style={{ fontSize: 13, color: "var(--text-3)", marginTop: 4 }}>
            {filteredNames.length} prompt{filteredNames.length !== 1 ? "s" : ""} · {totalActive} active · Full version history with diff
          </p>
        </div>
        <button onClick={() => setShowCreate(true)}
          style={{ display: "flex", alignItems: "center", gap: 7, padding: "9px 18px", borderRadius: 10, border: "none", background: "linear-gradient(135deg,#7c3aed,#a78bfa)", color: "white", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
          <Plus size={14} /> New Version
        </button>
      </motion.div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 24 }}>
        {[
          { label: "Prompt Names",    value: Object.keys(grouped).length, color: "#7c3aed" },
          { label: "Total Versions",  value: allVersions.length,          color: "#3b82f6" },
          { label: "Active Versions", value: totalActive,                  color: "#22c55e" },
        ].map(({ label, value, color }) => (
          <motion.div key={label}
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            style={{ padding: "14px 18px", borderRadius: 12, background: "var(--surface-1)", border: `1px solid ${color}25`, position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: color, opacity: 0.6 }} />
            <div style={{ fontSize: 24, fontWeight: 800, color, fontVariantNumeric: "tabular-nums" }}>{value}</div>
            <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>{label}</div>
          </motion.div>
        ))}
      </div>

      {/* Info banner */}
      <div style={{ padding: "10px 14px", borderRadius: 9, background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.2)", marginBottom: 20, display: "flex", gap: 8 }}>
        <AlertTriangle size={13} color="#f59e0b" style={{ flexShrink: 0, marginTop: 2 }} />
        <p style={{ fontSize: 11, color: "#f59e0b", margin: 0, lineHeight: 1.6 }}>
          <strong>Immutable versions:</strong> Prompt content cannot be edited. To change a prompt, create a new version — previous versions are preserved for audit and rollback. Only one version per prompt name can be active at a time.
        </p>
      </div>

      {/* Search */}
      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search prompt names…"
        style={{ width: "100%", padding: "9px 14px", borderRadius: 9, border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--text-1)", fontSize: 13, marginBottom: 16, boxSizing: "border-box" }} />

      {/* Prompt groups */}
      {isLoading ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 200, gap: 10, color: "var(--text-3)" }}>
          <Clock size={16} style={{ animation: "spin 0.8s linear infinite" }} />
          <span style={{ fontSize: 13 }}>Loading prompts…</span>
        </div>
      ) : filteredNames.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 20px", border: "1px solid var(--border)", borderRadius: 12, background: "var(--surface-1)" }}>
          <BookOpen size={40} color="var(--text-3)" style={{ margin: "0 auto 14px" }} />
          <p style={{ fontSize: 15, fontWeight: 700, color: "var(--text-1)", margin: "0 0 8px" }}>No prompts yet</p>
          <p style={{ fontSize: 13, color: "var(--text-3)", margin: "0 0 24px" }}>Create versioned system prompts for your AI agents with full rollback support.</p>
          <button onClick={() => setShowCreate(true)}
            style={{ padding: "10px 22px", borderRadius: 10, border: "none", background: "linear-gradient(135deg,#7c3aed,#a78bfa)", color: "white", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            Create First Prompt
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {filteredNames.map((name, i) => (
            <PromptGroup key={name || `group-${i}`} name={name} versions={grouped[name]} />
          ))}
        </div>
      )}

      <AnimatePresence>
        {showCreate && <CreatePromptModal onClose={() => setShowCreate(false)} />}
      </AnimatePresence>
    </div>
  );
}
