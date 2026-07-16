"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { connectorsApi } from "@/lib/api";
import {
  Plug, Plus, RefreshCw, CheckCircle, XCircle, Clock, Trash2,
  ChevronDown, ChevronUp, Zap, AlertTriangle, ExternalLink,
} from "lucide-react";

const CONNECTOR_TYPES = [
  { id: "jira",       label: "Jira",        color: "#0052CC", emoji: "🔵", fields: ["base_url", "username", "api_token", "project_key"] },
  { id: "confluence", label: "Confluence",  color: "#0065FF", emoji: "📘", fields: ["base_url", "username", "api_token", "space_key"] },
  { id: "testrail",   label: "TestRail",    color: "#65A64B", emoji: "🟢", fields: ["base_url", "username", "api_key", "project_id"] },
  { id: "zephyr",     label: "Zephyr",      color: "#FF5630", emoji: "⚡", fields: ["base_url", "api_token", "project_key"] },
  { id: "github",     label: "GitHub",      color: "#24292E", emoji: "⚫", fields: ["token", "owner", "repo"] },
  { id: "gitlab",     label: "GitLab CI",   color: "#FC6D26", emoji: "🦊", fields: ["base_url", "token", "project_id"] },
];

const FIELD_LABELS: Record<string, string> = {
  base_url: "Base URL", username: "Username", api_token: "API Token",
  api_key: "API Key", project_key: "Project Key", space_key: "Space Key",
  project_id: "Project ID", token: "Access Token", owner: "Owner/Org", repo: "Repository",
};

const STATUS_CONFIG: Record<string, { color: string; icon: any; label: string }> = {
  active:       { color: "#22c55e", icon: CheckCircle,   label: "Active"       },
  error:        { color: "#ef4444", icon: XCircle,       label: "Error"        },
  syncing:      { color: "#f59e0b", icon: RefreshCw,     label: "Syncing"      },
  idle:         { color: "#6b7280", icon: Clock,         label: "Idle"         },
  never_synced: { color: "#6b7280", icon: AlertTriangle, label: "Not synced"   },
};

function timeAgo(iso?: string): string {
  if (!iso) return "never";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function ConnectorCard({ connector, onTest, onSync, onDelete, testing, syncing }: {
  connector: any;
  onTest: () => void;
  onSync: () => void;
  onDelete: () => void;
  testing: boolean;
  syncing: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const type = CONNECTOR_TYPES.find(t => t.id === connector.connector_type) ?? CONNECTOR_TYPES[0];
  const status = connector.status ?? "idle";
  const sc = STATUS_CONFIG[status] ?? STATUS_CONFIG.idle;
  const StatusIcon = sc.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden",
        background: "var(--surface-1)",
      }}
    >
      <div style={{ padding: "14px 16px", display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{
          width: 38, height: 38, borderRadius: 10, flexShrink: 0,
          background: type.color + "18", border: `1px solid ${type.color}33`,
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18,
        }}>{type.emoji}</div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-1)" }}>{connector.name}</span>
            <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 5, background: type.color + "18", color: type.color, fontWeight: 700 }}>{type.label}</span>
          </div>
          <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 3, display: "flex", gap: 10 }}>
            <span>Last sync: {timeAgo(connector.last_synced_at)}</span>
            {connector.docs_synced != null && <span>{connector.docs_synced} docs</span>}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 6, background: sc.color + "15", border: `1px solid ${sc.color}30` }}>
            <StatusIcon size={11} color={sc.color} style={{ animation: status === "syncing" ? "spin 1s linear infinite" : "none" }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: sc.color }}>{sc.label}</span>
          </div>

          <button onClick={onTest} disabled={testing}
            title="Test connection"
            style={{ padding: "6px 10px", borderRadius: 7, border: "1px solid var(--border)", background: "var(--surface-2)", cursor: testing ? "wait" : "pointer", color: "var(--text-2)", fontSize: 11, display: "flex", alignItems: "center", gap: 4, fontWeight: 600 }}>
            {testing ? <RefreshCw size={11} style={{ animation: "spin 0.8s linear infinite" }} /> : <Zap size={11} />}
            Test
          </button>

          <button onClick={onSync} disabled={syncing}
            title="Trigger sync"
            style={{ padding: "6px 10px", borderRadius: 7, border: "1px solid rgba(124,58,237,0.3)", background: "rgba(124,58,237,0.1)", cursor: syncing ? "wait" : "pointer", color: "#a78bfa", fontSize: 11, display: "flex", alignItems: "center", gap: 4, fontWeight: 600 }}>
            {syncing ? <RefreshCw size={11} style={{ animation: "spin 0.8s linear infinite" }} /> : <RefreshCw size={11} />}
            Sync
          </button>

          <button onClick={() => setExpanded(v => !v)}
            style={{ padding: 6, borderRadius: 7, border: "1px solid var(--border)", background: "var(--surface-2)", cursor: "pointer", color: "var(--text-3)", display: "flex" }}>
            {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>

          <button onClick={onDelete}
            style={{ padding: 6, borderRadius: 7, border: "1px solid rgba(239,68,68,0.2)", background: "rgba(239,68,68,0.06)", cursor: "pointer", color: "#ef4444", display: "flex" }}>
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{ overflow: "hidden" }}
          >
            <div style={{ borderTop: "1px solid var(--border)", padding: "12px 16px", background: "var(--surface-2)", display: "flex", flexDirection: "column", gap: 6 }}>
              <p style={{ fontSize: 10, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.08em", margin: 0 }}>Connection details</p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                {Object.entries(connector.config ?? {}).map(([k, v]) => (
                  <div key={k} style={{ padding: "6px 10px", borderRadius: 6, background: "var(--surface-1)", border: "1px solid var(--border)" }}>
                    <p style={{ fontSize: 9, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.07em", margin: "0 0 2px" }}>
                      {FIELD_LABELS[k] ?? k}
                    </p>
                    <p style={{ fontSize: 11, color: "var(--text-2)", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {k.includes("token") || k.includes("key") || k.includes("password") ? "••••••••" : String(v)}
                    </p>
                  </div>
                ))}
              </div>
              {connector.last_error && (
                <div style={{ padding: "8px 10px", borderRadius: 7, background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.2)", display: "flex", gap: 8 }}>
                  <AlertTriangle size={12} color="#ef4444" style={{ flexShrink: 0, marginTop: 2 }} />
                  <span style={{ fontSize: 11, color: "#ef4444" }}>{connector.last_error}</span>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function CreateConnectorModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [type, setType] = useState(CONNECTOR_TYPES[0].id);
  const [name, setName] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState("");

  const selectedType = CONNECTOR_TYPES.find(t => t.id === type)!;

  const mutation = useMutation({
    mutationFn: () => connectorsApi.create({ name, connector_type: type, config: fields }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["connectors"] }); onClose(); },
    onError: (e: any) => setError(e?.response?.data?.detail ?? "Failed to create connector"),
  });

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.6)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        style={{ background: "var(--surface-1)", border: "1px solid var(--border)", borderRadius: 16, padding: 24, width: 480, maxHeight: "90vh", overflowY: "auto" }}
      >
        <h2 style={{ fontSize: 16, fontWeight: 800, color: "var(--text-1)", margin: "0 0 20px" }}>New Connector</h2>

        {/* Type picker */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.08em", display: "block", marginBottom: 8 }}>Type</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {CONNECTOR_TYPES.map(ct => (
              <button key={ct.id} onClick={() => setType(ct.id)} style={{
                padding: "6px 12px", borderRadius: 8, border: `1px solid ${type === ct.id ? ct.color + "70" : "var(--border)"}`,
                background: type === ct.id ? ct.color + "18" : "var(--surface-2)",
                color: type === ct.id ? ct.color : "var(--text-2)", cursor: "pointer", fontSize: 12, fontWeight: 600,
                display: "flex", alignItems: "center", gap: 5,
              }}>
                <span>{ct.emoji}</span>{ct.label}
              </button>
            ))}
          </div>
        </div>

        {/* Name */}
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.08em", display: "block", marginBottom: 5 }}>Name</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder={`My ${selectedType.label}`}
            style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--text-1)", fontSize: 13, boxSizing: "border-box" }} />
        </div>

        {/* Dynamic fields */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Connection Config</label>
          {selectedType.fields.map(f => (
            <div key={f}>
              <label style={{ fontSize: 11, color: "var(--text-3)", display: "block", marginBottom: 4 }}>{FIELD_LABELS[f] ?? f}</label>
              <input
                type={f.includes("token") || f.includes("key") || f.includes("password") ? "password" : "text"}
                value={fields[f] ?? ""}
                onChange={e => setFields(p => ({ ...p, [f]: e.target.value }))}
                placeholder={f === "base_url" ? "https://yourcompany.atlassian.net" : ""}
                style={{ width: "100%", padding: "7px 10px", borderRadius: 7, border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--text-1)", fontSize: 12, boxSizing: "border-box" }}
              />
            </div>
          ))}
        </div>

        {error && <p style={{ fontSize: 12, color: "#ef4444", marginBottom: 12 }}>{error}</p>}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--text-2)", fontSize: 13, cursor: "pointer" }}>Cancel</button>
          <button onClick={() => mutation.mutate()} disabled={!name.trim() || mutation.isPending}
            style={{ padding: "8px 20px", borderRadius: 8, border: "none", background: "linear-gradient(135deg,#7c3aed,#a78bfa)", color: "white", fontSize: 13, fontWeight: 700, cursor: "pointer", opacity: mutation.isPending ? 0.6 : 1 }}>
            {mutation.isPending ? "Creating…" : "Create Connector"}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

export default function ConnectorsPage() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [testing, setTesting] = useState<Record<string, boolean>>({});
  const [syncing, setSyncing] = useState<Record<string, boolean>>({});
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; message: string }>>({});
  const [filterType, setFilterType] = useState("all");

  const { data, isLoading, error } = useQuery({
    queryKey: ["connectors"],
    queryFn: connectorsApi.list,
    refetchInterval: 10_000,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => connectorsApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["connectors"] }),
  });

  async function handleTest(id: string) {
    setTesting(p => ({ ...p, [id]: true }));
    try {
      const res = await connectorsApi.test(id);
      setTestResults(p => ({ ...p, [id]: { ok: res.success ?? true, message: res.message ?? "Connection successful" } }));
      qc.invalidateQueries({ queryKey: ["connectors"] });
    } catch (e: any) {
      setTestResults(p => ({ ...p, [id]: { ok: false, message: e?.response?.data?.detail ?? "Connection failed" } }));
    } finally {
      setTesting(p => ({ ...p, [id]: false }));
    }
  }

  async function handleSync(id: string) {
    setSyncing(p => ({ ...p, [id]: true }));
    try {
      await connectorsApi.sync(id);
      qc.invalidateQueries({ queryKey: ["connectors"] });
    } finally {
      setSyncing(p => ({ ...p, [id]: false }));
    }
  }

  const connectors: any[] = data?.connectors ?? data ?? [];
  const filtered = filterType === "all" ? connectors : connectors.filter((c: any) => c.connector_type === filterType);

  const byStatus = { active: 0, error: 0, syncing: 0, idle: 0 };
  connectors.forEach((c: any) => { const s = c.status ?? "idle"; if (s in byStatus) (byStatus as any)[s]++; });

  return (
    <div style={{ padding: "28px 32px", maxWidth: 1100 }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
        style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text-1)", margin: 0, display: "flex", alignItems: "center", gap: 10 }}>
            <Plug size={20} color="#7c3aed" /> Connectors
          </h1>
          <p style={{ fontSize: 13, color: "var(--text-3)", marginTop: 4 }}>
            Jira · Confluence · TestRail · Zephyr · GitHub · GitLab — sync QA artifacts into the knowledge graph
          </p>
        </div>
        <button onClick={() => setShowCreate(true)}
          style={{ display: "flex", alignItems: "center", gap: 7, padding: "9px 18px", borderRadius: 10, border: "none", background: "linear-gradient(135deg,#7c3aed,#a78bfa)", color: "white", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
          <Plus size={14} /> New Connector
        </button>
      </motion.div>

      {/* Stats bar */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 24 }}>
        {[
          { label: "Active",   value: byStatus.active,  color: "#22c55e" },
          { label: "Errors",   value: byStatus.error,   color: "#ef4444" },
          { label: "Syncing",  value: byStatus.syncing, color: "#f59e0b" },
          { label: "Idle",     value: byStatus.idle,    color: "#6b7280" },
        ].map(({ label, value, color }) => (
          <motion.div key={label}
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            style={{ padding: "14px 18px", borderRadius: 12, background: "var(--surface-1)", border: `1px solid ${color}30`, position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: color, opacity: 0.6 }} />
            <div style={{ fontSize: 24, fontWeight: 800, color, fontVariantNumeric: "tabular-nums" }}>{value}</div>
            <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>{label}</div>
          </motion.div>
        ))}
      </div>

      {/* Filter tabs */}
      <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
        {["all", ...CONNECTOR_TYPES.map(t => t.id)].map(f => (
          <button key={f} onClick={() => setFilterType(f)} style={{
            padding: "5px 12px", borderRadius: 7, fontSize: 11, fontWeight: 600, cursor: "pointer",
            border: `1px solid ${filterType === f ? "rgba(124,58,237,0.5)" : "var(--border)"}`,
            background: filterType === f ? "rgba(124,58,237,0.12)" : "var(--surface-2)",
            color: filterType === f ? "#a78bfa" : "var(--text-3)",
          }}>
            {f === "all" ? "All" : CONNECTOR_TYPES.find(t => t.id === f)?.label ?? f}
            {f !== "all" && <span style={{ marginLeft: 5, fontSize: 10, fontWeight: 800 }}>{connectors.filter((c: any) => c.connector_type === f).length}</span>}
          </button>
        ))}
      </div>

      {/* Test results toast */}
      <AnimatePresence>
        {Object.entries(testResults).map(([id, r]) => (
          <motion.div key={id}
            initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            style={{
              display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 8, marginBottom: 8,
              background: r.ok ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.08)",
              border: `1px solid ${r.ok ? "rgba(34,197,94,0.25)" : "rgba(239,68,68,0.25)"}`,
            }}>
            {r.ok ? <CheckCircle size={13} color="#22c55e" /> : <XCircle size={13} color="#ef4444" />}
            <span style={{ fontSize: 12, color: r.ok ? "#22c55e" : "#ef4444", fontWeight: 600 }}>{r.message}</span>
            <button onClick={() => setTestResults(p => { const n = { ...p }; delete n[id]; return n; })}
              style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "var(--text-3)", fontSize: 16, lineHeight: 1 }}>×</button>
          </motion.div>
        ))}
      </AnimatePresence>

      {/* Connector list */}
      {isLoading ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 200 }}>
          <div style={{ width: 32, height: 32, border: "3px solid var(--accent)", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 20px" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🔌</div>
          <p style={{ fontSize: 15, fontWeight: 700, color: "var(--text-1)", margin: "0 0 8px" }}>No connectors yet</p>
          <p style={{ fontSize: 13, color: "var(--text-3)", margin: "0 0 24px" }}>
            Connect Jira, Confluence, TestRail, or Zephyr to sync QA artifacts automatically.
          </p>
          <button onClick={() => setShowCreate(true)}
            style={{ padding: "10px 22px", borderRadius: 10, border: "none", background: "linear-gradient(135deg,#7c3aed,#a78bfa)", color: "white", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            Add First Connector
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {filtered.map((c: any, i: number) => (
            <ConnectorCard key={c.id ?? i} connector={c}
              onTest={() => handleTest(c.id)}
              onSync={() => handleSync(c.id)}
              onDelete={() => { if (confirm(`Delete "${c.name}"?`)) deleteMutation.mutate(c.id); }}
              testing={testing[c.id] ?? false}
              syncing={syncing[c.id] ?? false}
            />
          ))}
        </div>
      )}

      <AnimatePresence>
        {showCreate && <CreateConnectorModal onClose={() => setShowCreate(false)} />}
      </AnimatePresence>
    </div>
  );
}
