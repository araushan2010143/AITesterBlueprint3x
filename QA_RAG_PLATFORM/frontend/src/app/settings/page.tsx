"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { statsApi } from "@/lib/api";
import {
  Settings, CheckCircle, XCircle, AlertTriangle, RefreshCw,
  Shield, Database, GitBranch, Zap, Server, Lock,
  Copy, ChevronDown, ChevronUp,
} from "lucide-react";

function StatusDot({ up, pulsing = false }: { up: boolean; pulsing?: boolean }) {
  return (
    <div style={{
      width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
      background: up ? "#22c55e" : "#ef4444",
      boxShadow: up ? "0 0 6px #22c55e80" : "none",
      animation: pulsing && up ? "pulse 2s ease infinite" : "none",
    }} />
  );
}

function ServiceCard({ name, icon: Icon, color, status, details, version, latency, delay }: {
  name: string; icon: any; color: string;
  status: "healthy" | "degraded" | "down" | "unknown";
  details?: Record<string, string>;
  version?: string;
  latency?: number;
  delay: number;
}) {
  const [showDetails, setShowDetails] = useState(false);

  const STATUS_MAP = {
    healthy:  { color: "#22c55e", icon: CheckCircle,   label: "Healthy"  },
    degraded: { color: "#f59e0b", icon: AlertTriangle, label: "Degraded" },
    down:     { color: "#ef4444", icon: XCircle,       label: "Down"     },
    unknown:  { color: "#6b7280", icon: AlertTriangle, label: "Unknown"  },
  };

  const sc = STATUS_MAP[status] ?? STATUS_MAP.unknown;
  const SIcon = sc.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      style={{ border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden", background: "var(--surface-1)" }}
    >
      <div style={{ padding: "14px 16px", display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{
          width: 40, height: 40, borderRadius: 10, flexShrink: 0,
          background: color + "18", border: `1px solid ${color}30`,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <Icon size={18} color={color} />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-1)" }}>{name}</span>
            {version && (
              <span style={{ fontSize: 10, fontFamily: "monospace", color: "var(--text-3)", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 4, padding: "1px 6px" }}>
                {version}
              </span>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
            <StatusDot up={status === "healthy"} pulsing />
            <span style={{ fontSize: 11, fontWeight: 600, color: sc.color }}>{sc.label}</span>
            {latency !== undefined && (
              <span style={{ fontSize: 10, color: "var(--text-3)", fontVariantNumeric: "tabular-nums" }}>
                {latency}ms
              </span>
            )}
          </div>
        </div>

        <div className="service-card-right">
          <div className="service-badge" style={{ background: sc.color + "15", border: `1px solid ${sc.color}30` }}>
            <SIcon size={11} color={sc.color} />
            <span style={{ fontSize: 11, fontWeight: 700, color: sc.color }}>{sc.label}</span>
          </div>
          {details && Object.keys(details).length > 0 && (
            <button onClick={() => setShowDetails(v => !v)}
              style={{ padding: "5px 8px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--surface-2)", cursor: "pointer", color: "var(--text-3)", display: "flex" }}>
              {showDetails ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>
          )}
        </div>
      </div>

      {showDetails && details && (
        <div style={{ borderTop: "1px solid var(--border)", padding: "10px 16px", background: "var(--surface-2)", display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
          {Object.entries(details).map(([k, v]) => (
            <div key={k} style={{ padding: "6px 10px", borderRadius: 6, background: "var(--surface-1)", border: "1px solid var(--border)" }}>
              <p style={{ fontSize: 9, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.07em", margin: "0 0 2px" }}>{k}</p>
              <p style={{ fontSize: 11, color: "var(--text-2)", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: "monospace" }}>{v}</p>
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
}

function EnvVarRow({ name, set, required = false }: { name: string; set: boolean; required?: boolean }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(name);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 12px", borderRadius: 7, background: "var(--surface-2)", border: "1px solid var(--border)" }}>
      <div style={{ width: 7, height: 7, borderRadius: "50%", background: set ? "#22c55e" : required ? "#ef4444" : "#6b7280", boxShadow: set ? "0 0 5px #22c55e60" : "none" }} />
      <span style={{ fontFamily: "monospace", fontSize: 12, color: set ? "var(--text-2)" : "var(--text-3)", flex: 1 }}>{name}</span>
      {required && !set && <span style={{ fontSize: 9, fontWeight: 700, color: "#ef4444", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 4, padding: "1px 5px" }}>Required</span>}
      {!required && !set && <span style={{ fontSize: 9, fontWeight: 600, color: "#6b7280", background: "var(--surface-1)", border: "1px solid var(--border)", borderRadius: 4, padding: "1px 5px" }}>Optional</span>}
      {set && <span style={{ fontSize: 9, fontWeight: 700, color: "#22c55e", background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.25)", borderRadius: 4, padding: "1px 5px" }}>Set</span>}
      <button onClick={copy} style={{ background: "none", border: "none", cursor: "pointer", color: copied ? "#22c55e" : "var(--text-3)", display: "flex" }}>
        <Copy size={11} />
      </button>
    </div>
  );
}

export default function SettingsPage() {
  const { data: health, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["platform-health"],
    queryFn: statsApi.health,
    refetchInterval: 30_000,
  });

  function resolveStatus(check: any): "healthy" | "degraded" | "down" | "unknown" {
    if (!check) return "unknown";
    if (check === true || check.status === "healthy" || check.status === "ok" || check.ok === true || check.connected === true) return "healthy";
    if (check === false || check.status === "down" || check.ok === false) return "down";
    if (check.status === "degraded") return "degraded";
    if (typeof check === "object" && Object.keys(check).length > 0) return "healthy";
    return "unknown";
  }

  const h = health ?? {};

  type ServiceStatus = "healthy" | "degraded" | "down" | "unknown";
  const services: Array<{ name: string; icon: any; color: string; status: ServiceStatus; version?: string; details?: Record<string, string>; latency?: number }> = [
    {
      name: "Database",
      icon: Database,
      color: "#10b981",
      status: resolveStatus(h.database),
      version: h.database?.version,
      details: h.database?.stats ? h.database.stats : undefined,
    },
    {
      name: "Vector Store",
      icon: Zap,
      color: "#7c3aed",
      status: resolveStatus(h.vector_store ?? h.pinecone),
      version: h.vector_store?.backend ?? "pinecone",
      details: h.vector_store?.stats,
      latency: h.vector_store?.latency_ms,
    },
    {
      name: "LLM Router",
      icon: Server,
      color: "#3b82f6",
      status: ((h.llm?.available_count ?? 0) > 0 ? "healthy" : "down") as ServiceStatus,
      version: `${h.llm?.available_count ?? 0}/${h.llm?.total_count ?? 0} providers`,
      details: Object.fromEntries((h.llm?.providers ?? []).map((p: any) => [p.name, p.available ? "up" : "down"])),
    },
    {
      name: "Knowledge Graph",
      icon: GitBranch,
      color: "#f59e0b",
      status: resolveStatus(h.graph),
      version: h.graph?.version,
      details: h.graph?.stats ? { nodes: String(h.graph.stats.nodes ?? 0), edges: String(h.graph.stats.edges ?? 0) } : undefined,
      latency: h.graph?.latency_ms,
    },
    {
      name: "HashiCorp Vault",
      icon: Lock,
      color: "#ec4899",
      status: (h.vault === undefined ? "unknown" : resolveStatus(h.vault)) as ServiceStatus,
      version: h.vault?.version,
      details: h.vault ? { sealed: String(h.vault.sealed ?? false), addr: h.vault.addr ?? "" } : undefined,
    },
    {
      name: "Cache / Redis",
      icon: RefreshCw,
      color: "#06b6d4",
      status: resolveStatus(h.redis ?? h.cache),
      latency: h.redis?.latency_ms,
      details: h.redis?.info ? { memory_used: h.redis.info.used_memory_human ?? "—", connected_clients: String(h.redis.info.connected_clients ?? "—") } : undefined,
    },
  ];

  const ENV_VARS = [
    { name: "MISTRAL_API_KEY",    set: !!(h.env?.MISTRAL_API_KEY),  required: true  },  // embeddings provider — needed for ingestion + search
    { name: "GROQ_API_KEY",       set: !!(h.env?.GROQ_API_KEY),     required: false },
    { name: "OPENAI_API_KEY",     set: !!(h.env?.OPENAI_API_KEY),   required: false },
    { name: "PINECONE_API_KEY",   set: !!(h.env?.PINECONE_API_KEY), required: false },
    { name: "NEO4J_URI",          set: !!(h.env?.NEO4J_URI),        required: false },
    { name: "REDIS_URL",          set: !!(h.env?.REDIS_URL),        required: false },
    { name: "VAULT_ADDR",         set: !!(h.env?.VAULT_ADDR),       required: false },
    { name: "OPENSEARCH_URL",     set: !!(h.env?.OPENSEARCH_URL),   required: false },
    { name: "CELERY_BROKER_URL",  set: !!(h.env?.CELERY_BROKER_URL), required: false },
    { name: "DATABASE_URL",       set: !!(h.env?.DATABASE_URL),     required: false },
  ];

  const healthyCount = services.filter(s => s.status === "healthy").length;
  const overallOk = healthyCount >= 2;

  return (
    <div className="settings-outer">
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }
        .settings-outer { padding: 28px 32px; max-width: 1000px; }
        .settings-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 24px; gap: 12px; }
        .services-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .build-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
        .service-card-right { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
        .service-badge { padding: 5px 10px; border-radius: 6px; display: flex; align-items: center; gap: 5px; white-space: nowrap; }
        @media (max-width: 767px) {
          .settings-outer { padding: 60px 14px 20px; }
          .settings-header { flex-direction: column; align-items: flex-start; }
          .services-grid { grid-template-columns: 1fr; }
          .build-grid { grid-template-columns: 1fr 1fr; }
          .service-card-right { flex-shrink: 0; }
          .service-badge span { display: none; }
        }
      `}</style>

      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
        className="settings-header">
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text-1)", margin: 0, display: "flex", alignItems: "center", gap: 10 }}>
            <Settings size={20} color="#7c3aed" /> Platform Settings
          </h1>
          <p style={{ fontSize: 13, color: "var(--text-3)", marginTop: 4 }}>
            Service health · Environment configuration · Version info
          </p>
        </div>
        <button onClick={() => refetch()}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 9, border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--text-2)", fontSize: 12, cursor: "pointer", fontWeight: 600 }}>
          <RefreshCw size={13} style={{ animation: isFetching ? "spin 0.8s linear infinite" : "none" }} />
          Refresh
        </button>
      </motion.div>

      {/* Overall status banner */}
      <motion.div
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
        style={{
          display: "flex", alignItems: "center", gap: 14, padding: "14px 20px", borderRadius: 12, marginBottom: 24,
          background: overallOk ? "rgba(34,197,94,0.06)" : "rgba(239,68,68,0.06)",
          border: `1px solid ${overallOk ? "rgba(34,197,94,0.25)" : "rgba(239,68,68,0.25)"}`,
        }}>
        {overallOk
          ? <CheckCircle size={22} color="#22c55e" />
          : <AlertTriangle size={22} color="#f59e0b" />}
        <div>
          <p style={{ fontSize: 15, fontWeight: 800, color: overallOk ? "#22c55e" : "#f59e0b", margin: 0 }}>
            {overallOk ? "Platform Operational" : "Partial Degradation"}
          </p>
          <p style={{ fontSize: 12, color: "var(--text-3)", margin: 0 }}>
            {healthyCount} of {services.length} services healthy · Version {h.version ?? "v6.0.0"}
          </p>
        </div>
        {h.version && (
          <span style={{ marginLeft: "auto", fontFamily: "monospace", fontSize: 12, padding: "4px 10px", borderRadius: 6, background: "rgba(124,58,237,0.1)", color: "#a78bfa", border: "1px solid rgba(124,58,237,0.2)" }}>
            {h.version}
          </span>
        )}
      </motion.div>

      {/* Services */}
      <div style={{ marginBottom: 28 }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.09em", marginBottom: 12 }}>Services</p>
        {isLoading ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 160, gap: 10, color: "var(--text-3)" }}>
            <RefreshCw size={16} style={{ animation: "spin 0.8s linear infinite" }} />
            <span style={{ fontSize: 13 }}>Checking services…</span>
          </div>
        ) : (
          <div className="services-grid">
            {services.map((s, i) => (
              <ServiceCard key={s.name} {...s} delay={i * 0.04} />
            ))}
          </div>
        )}
      </div>

      {/* Environment Variables */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.09em", margin: 0 }}>Environment Variables</p>
          <span style={{ fontSize: 11, color: "var(--text-3)" }}>
            {ENV_VARS.filter(e => e.set).length}/{ENV_VARS.length} configured
          </span>
        </div>
        <div style={{ border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
          <div style={{ padding: "8px 12px", background: "var(--surface-2)", borderBottom: "1px solid var(--border)", display: "flex", gap: 8 }}>
            <div style={{ display: "flex", gap: 12, fontSize: 10, color: "var(--text-3)" }}>
              {[{ color: "#22c55e", label: "Set" }, { color: "#ef4444", label: "Required / Missing" }, { color: "#6b7280", label: "Optional / Unset" }].map(b => (
                <div key={b.label} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: b.color }} />
                  {b.label}
                </div>
              ))}
            </div>
          </div>
          <div style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
            {isLoading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} style={{ height: 32, borderRadius: 7, background: "var(--surface-2)", animation: "pulse 1.5s ease infinite", opacity: 0.6 }} />
                ))
              : ENV_VARS.map(e => <EnvVarRow key={e.name} {...e} />)
            }
          </div>
        </div>
      </div>

      {/* Build info */}
      {h.build && (
        <div style={{ marginBottom: 24 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.09em", marginBottom: 12 }}>Build Info</p>
          <div className="build-grid" style={{ border: "1px solid var(--border)", borderRadius: 12, padding: "14px 16px", background: "var(--surface-1)" }}>
            {Object.entries(h.build).map(([k, v]) => (
              <div key={k} style={{ padding: "8px 12px", borderRadius: 8, background: "var(--surface-2)", border: "1px solid var(--border)" }}>
                <p style={{ fontSize: 9, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 3px" }}>{k.replace(/_/g, " ")}</p>
                <p style={{ fontSize: 12, color: "var(--text-2)", margin: 0, fontFamily: "monospace" }}>{String(v)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Docs links */}
      <div style={{ padding: "14px 18px", borderRadius: 12, background: "var(--surface-1)", border: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <Shield size={16} color="#7c3aed" />
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-1)" }}>QA RAG Platform</span>
        <span style={{ fontSize: 11, color: "var(--text-3)", fontFamily: "monospace" }}>v{h.version ?? "6.0.0"}</span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 10 }}>
          {[
            { label: "API Docs",    path: `${process.env.NEXT_PUBLIC_API_URL ?? ""}/api/docs`    },
            { label: "ReDoc",       path: `${process.env.NEXT_PUBLIC_API_URL ?? ""}/api/redoc`   },
            { label: "Health",      path: `${process.env.NEXT_PUBLIC_API_URL ?? ""}/health`      },
          ].map(({ label, path }) => (
            <a key={label} href={path} target="_blank" rel="noopener noreferrer"
              style={{ fontSize: 12, color: "#a78bfa", textDecoration: "none", padding: "4px 10px", borderRadius: 6, border: "1px solid rgba(124,58,237,0.25)", background: "rgba(124,58,237,0.06)", fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
              {label} →
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
