"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { auditApi } from "@/lib/api";
import {
  Shield, Download, Filter, Search, ChevronDown, ChevronUp,
  AlertTriangle, Info, CheckCircle, XCircle, RefreshCw,
} from "lucide-react";

const RISK_CONFIG: Record<string, { color: string; icon: any; bg: string }> = {
  critical: { color: "#ef4444", icon: XCircle,       bg: "rgba(239,68,68,0.08)"   },
  high:     { color: "#f97316", icon: AlertTriangle, bg: "rgba(249,115,22,0.08)"  },
  medium:   { color: "#f59e0b", icon: AlertTriangle, bg: "rgba(245,158,11,0.08)"  },
  low:      { color: "#22c55e", icon: CheckCircle,   bg: "rgba(34,197,94,0.08)"   },
  info:     { color: "#3b82f6", icon: Info,          bg: "rgba(59,130,246,0.08)"  },
};

const ACTION_COLORS: Record<string, string> = {
  login: "#10b981", logout: "#6b7280", upload: "#7c3aed", delete: "#ef4444",
  sync: "#3b82f6", query: "#f59e0b", export: "#06b6d4", create: "#8b5cf6",
  update: "#ec4899", error: "#ef4444",
};

function timeStr(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function AuditRow({ entry, index }: { entry: any; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const risk = entry.risk_level ?? "info";
  const rc = RISK_CONFIG[risk] ?? RISK_CONFIG.info;
  const RIcon = rc.icon;
  const actionColor = ACTION_COLORS[entry.action?.toLowerCase()] ?? "#6b7280";

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.02, duration: 0.2 }}
      style={{ borderBottom: "1px solid var(--border)" }}
    >
      <button onClick={() => setExpanded(v => !v)}
        style={{
          display: "flex", alignItems: "center", gap: 12, padding: "12px 16px",
          width: "100%", background: "none", border: "none", cursor: "pointer", textAlign: "left",
        }}>
        {/* Risk badge */}
        <div style={{
          width: 28, height: 28, borderRadius: 7, flexShrink: 0,
          background: rc.bg, border: `1px solid ${rc.color}30`,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <RIcon size={13} color={rc.color} />
        </div>

        {/* Timestamp */}
        <span style={{ fontSize: 11, color: "var(--text-3)", flexShrink: 0, width: 130, fontVariantNumeric: "tabular-nums" }}>
          {timeStr(entry.created_at)}
        </span>

        {/* Action */}
        <span style={{
          fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.07em",
          padding: "2px 7px", borderRadius: 4, flexShrink: 0,
          background: actionColor + "18", color: actionColor, border: `1px solid ${actionColor}30`,
        }}>
          {entry.action}
        </span>

        {/* Resource / message */}
        <span style={{ flex: 1, fontSize: 12, color: "var(--text-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {entry.resource_type && <span style={{ color: "var(--text-3)", marginRight: 6 }}>{entry.resource_type}:</span>}
          {entry.message ?? entry.resource_id ?? "—"}
        </span>

        {/* User */}
        {entry.user_email && (
          <span style={{ fontSize: 11, color: "var(--text-3)", flexShrink: 0, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {entry.user_email}
          </span>
        )}

        {/* IP */}
        {entry.ip_address && (
          <span style={{ fontSize: 10, color: "var(--text-3)", flexShrink: 0, fontFamily: "monospace" }}>
            {entry.ip_address}
          </span>
        )}

        {/* Risk label */}
        <span style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", color: rc.color, background: rc.bg, border: `1px solid ${rc.color}30`, borderRadius: 4, padding: "2px 6px", flexShrink: 0, letterSpacing: "0.06em" }}>
          {risk}
        </span>

        {expanded ? <ChevronUp size={12} color="var(--text-3)" style={{ flexShrink: 0 }} /> : <ChevronDown size={12} color="var(--text-3)" style={{ flexShrink: 0 }} />}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            style={{ overflow: "hidden" }}
          >
            <div style={{ padding: "10px 16px 14px 72px", display: "flex", flexDirection: "column", gap: 10 }}>
              {entry.details && typeof entry.details === "object" && Object.keys(entry.details).length > 0 && (
                <div>
                  <p style={{ fontSize: 10, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 6px" }}>Details</p>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
                    {Object.entries(entry.details).map(([k, v]) => (
                      <div key={k} style={{ padding: "5px 8px", borderRadius: 6, background: "var(--surface-2)", border: "1px solid var(--border)" }}>
                        <p style={{ fontSize: 9, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.07em", margin: "0 0 2px" }}>{k}</p>
                        <p style={{ fontSize: 11, color: "var(--text-2)", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{String(v)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {entry.stack_trace && (
                <div>
                  <p style={{ fontSize: 10, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 6px" }}>Stack Trace</p>
                  <pre style={{ fontSize: 10, color: "#ef4444", background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 7, padding: "8px 10px", margin: 0, overflowX: "auto", whiteSpace: "pre-wrap", wordBreak: "break-all", maxHeight: 180 }}>
                    {entry.stack_trace}
                  </pre>
                </div>
              )}
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {entry.team_id && <span style={{ fontSize: 10, color: "var(--text-3)", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 4, padding: "2px 7px" }}>Team: {entry.team_id}</span>}
                {entry.user_agent && <span style={{ fontSize: 10, color: "var(--text-3)", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 4, padding: "2px 7px", maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{entry.user_agent}</span>}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default function AuditPage() {
  const [riskFilter, setRiskFilter] = useState("all");
  const [actionFilter, setActionFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["audit", riskFilter, actionFilter, search, page],
    queryFn: () => auditApi.list({
      risk_level: riskFilter === "all" ? "" : riskFilter,
      action: actionFilter === "all" ? "" : actionFilter,
      search,
      page: String(page),
      limit: "50",
    }),
    refetchInterval: 30_000,
  });

  const entries: any[] = data?.entries ?? [];
  const total: number = data?.total ?? 0;
  const totalPages = Math.ceil(total / 50);

  const riskCounts: Record<string, number> = data?.risk_counts ?? {};

  async function handleExport() {
    try {
      const blob = await auditApi.export({ risk_level: riskFilter === "all" ? "" : riskFilter, search });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.jsonl`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert("Export failed");
    }
  }

  const RISK_LEVELS = ["all", "critical", "high", "medium", "low", "info"];
  const ACTIONS = ["all", "login", "logout", "upload", "delete", "sync", "query", "export", "create", "update", "error"];

  return (
    <div style={{ padding: "28px 32px", maxWidth: 1200 }}>
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
        style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text-1)", margin: 0, display: "flex", alignItems: "center", gap: 10 }}>
            <Shield size={20} color="#7c3aed" /> Audit Log
          </h1>
          <p style={{ fontSize: 13, color: "var(--text-3)", marginTop: 4 }}>
            Risk-filtered activity trail · {total.toLocaleString()} events
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => refetch()}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 9, border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--text-2)", fontSize: 12, cursor: "pointer", fontWeight: 600 }}>
            <RefreshCw size={13} style={{ animation: isFetching ? "spin 0.8s linear infinite" : "none" }} /> Refresh
          </button>
          <button onClick={handleExport}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 9, border: "none", background: "linear-gradient(135deg,#7c3aed,#a78bfa)", color: "white", fontSize: 12, cursor: "pointer", fontWeight: 700 }}>
            <Download size={13} /> Export JSONL
          </button>
        </div>
      </motion.div>

      {/* Risk breakdown */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10, marginBottom: 20 }}>
        {["critical", "high", "medium", "low", "info"].map(r => {
          const rc = RISK_CONFIG[r];
          const count = riskCounts[r] ?? 0;
          return (
            <motion.button key={r}
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              onClick={() => setRiskFilter(riskFilter === r ? "all" : r)}
              style={{
                padding: "12px 14px", borderRadius: 10, cursor: "pointer",
                background: riskFilter === r ? rc.bg : "var(--surface-1)",
                border: `1px solid ${riskFilter === r ? rc.color + "50" : "var(--border)"}`,
                textAlign: "left", position: "relative", overflow: "hidden",
              }}>
              <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: rc.color, opacity: riskFilter === r ? 1 : 0.4 }} />
              <div style={{ fontSize: 20, fontWeight: 800, color: rc.color, fontVariantNumeric: "tabular-nums" }}>{count.toLocaleString()}</div>
              <div style={{ fontSize: 10, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.07em", marginTop: 2 }}>{r}</div>
            </motion.button>
          );
        })}
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        {/* Search */}
        <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
          <Search size={13} color="var(--text-3)" style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }} />
          <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Search by user, action, resource…"
            style={{ width: "100%", padding: "8px 10px 8px 30px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--text-1)", fontSize: 12, boxSizing: "border-box" }} />
        </div>

        {/* Action filter */}
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {ACTIONS.slice(0, 7).map(a => (
            <button key={a} onClick={() => { setActionFilter(a); setPage(1); }} style={{
              padding: "5px 10px", borderRadius: 6, fontSize: 10, fontWeight: 600, cursor: "pointer",
              border: `1px solid ${actionFilter === a ? "rgba(124,58,237,0.5)" : "var(--border)"}`,
              background: actionFilter === a ? "rgba(124,58,237,0.12)" : "var(--surface-2)",
              color: actionFilter === a ? "#a78bfa" : "var(--text-3)",
            }}>{a === "all" ? "All Actions" : a}</button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div style={{ border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden", background: "var(--surface-1)" }}>
        <div style={{ padding: "10px 16px", background: "var(--surface-2)", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 8 }}>
          <Filter size={12} color="var(--text-3)" />
          <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-2)" }}>
            {entries.length > 0 ? `${entries.length} of ${total.toLocaleString()} events` : "Events"}
          </span>
        </div>

        {isLoading ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 200, gap: 10, color: "var(--text-3)" }}>
            <RefreshCw size={16} style={{ animation: "spin 0.8s linear infinite" }} />
            <span style={{ fontSize: 13 }}>Loading events…</span>
          </div>
        ) : entries.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 20px" }}>
            <Shield size={36} color="var(--text-3)" style={{ margin: "0 auto 12px" }} />
            <p style={{ fontSize: 14, fontWeight: 600, color: "var(--text-1)", margin: "0 0 6px" }}>No events found</p>
            <p style={{ fontSize: 12, color: "var(--text-3)", margin: 0 }}>Try adjusting the risk level or action filter</p>
          </div>
        ) : (
          entries.map((e: any, i: number) => <AuditRow key={e.id ?? i} entry={e} index={i} />)
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 16 }}>
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
            style={{ padding: "6px 12px", borderRadius: 7, border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--text-2)", cursor: "pointer", fontSize: 12, opacity: page === 1 ? 0.4 : 1 }}>
            ← Prev
          </button>
          <span style={{ fontSize: 12, color: "var(--text-3)", padding: "0 8px" }}>Page {page} of {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
            style={{ padding: "6px 12px", borderRadius: 7, border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--text-2)", cursor: "pointer", fontSize: 12, opacity: page === totalPages ? 0.4 : 1 }}>
            Next →
          </button>
        </div>
      )}

      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
