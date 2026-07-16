"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { graphApi } from "@/lib/api";
import {
  GitBranch, Activity, Target, CheckCircle, AlertTriangle, XCircle,
  RefreshCw, ChevronRight, Layers, GitCommit, Zap, Search,
} from "lucide-react";

const NODE_COLORS: Record<string, string> = {
  Feature:       "#7c3aed",
  TestCase:      "#10b981",
  Requirement:   "#3b82f6",
  Defect:        "#ef4444",
  APIEndpoint:   "#f59e0b",
  PipelineRun:   "#06b6d4",
  Release:       "#8b5cf6",
  Component:     "#ec4899",
};

const NODE_EMOJI: Record<string, string> = {
  Feature:       "🎯",
  TestCase:      "🧪",
  Requirement:   "📋",
  Defect:        "🐛",
  APIEndpoint:   "⚡",
  PipelineRun:   "🔄",
  Release:       "🚀",
  Component:     "🧩",
};

const VERDICT_CONFIG = {
  SUPPORTED:   { color: "#22c55e", icon: CheckCircle,  label: "Covered"       },
  PARTIAL:     { color: "#f59e0b", icon: AlertTriangle, label: "Partial"       },
  UNSUPPORTED: { color: "#ef4444", icon: XCircle,       label: "Gap"           },
};

function StatBadge({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <div style={{ padding: "10px 16px", borderRadius: 10, background: "var(--surface-1)", border: `1px solid ${color}25`, textAlign: "center", position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: color, opacity: 0.7 }} />
      <div style={{ fontSize: 22, fontWeight: 800, color, fontVariantNumeric: "tabular-nums" }}>{value}</div>
      <div style={{ fontSize: 10, color: "var(--text-3)", marginTop: 2, textTransform: "uppercase", letterSpacing: "0.07em" }}>{label}</div>
    </div>
  );
}

function NodeCard({ node, onSelect, selected }: { node: any; onSelect: () => void; selected: boolean }) {
  const color = NODE_COLORS[node.type] ?? "#6b7280";
  const emoji = NODE_EMOJI[node.type] ?? "📄";
  return (
    <button onClick={onSelect} style={{
      display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
      borderRadius: 9, border: `1px solid ${selected ? color + "60" : "var(--border)"}`,
      background: selected ? color + "0d" : "var(--surface-1)",
      cursor: "pointer", width: "100%", textAlign: "left", transition: "all 0.12s",
    }}>
      <span style={{ fontSize: 16 }}>{emoji}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 12, fontWeight: 600, color: selected ? color : "var(--text-1)", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {node.name ?? node.id}
        </p>
        <p style={{ fontSize: 10, color: "var(--text-3)", margin: 0 }}>{node.type}</p>
      </div>
      <ChevronRight size={12} color={selected ? color : "var(--text-3)"} />
    </button>
  );
}

function ImpactPanel({ nodeId }: { nodeId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["graph-impact", nodeId],
    queryFn: () => graphApi.impactAnalysis(nodeId),
    enabled: !!nodeId,
  });

  if (isLoading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 200, gap: 10, color: "var(--text-3)" }}>
      <RefreshCw size={16} style={{ animation: "spin 0.8s linear infinite" }} />
      <span style={{ fontSize: 13 }}>Analyzing impact…</span>
    </div>
  );

  if (!data) return null;
  const impacted: any[] = data.impacted_nodes ?? [];
  const paths: any[][] = data.paths ?? [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
        <StatBadge label="Impacted" value={impacted.length} color="#ef4444" />
        <StatBadge label="Test Cases" value={impacted.filter((n: any) => n.type === "TestCase").length} color="#10b981" />
        <StatBadge label="Defects"   value={impacted.filter((n: any) => n.type === "Defect").length}   color="#f59e0b" />
      </div>

      {impacted.length > 0 && (
        <div>
          <p style={{ fontSize: 10, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Impacted Nodes</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 280, overflowY: "auto" }}>
            {impacted.map((n: any, i: number) => {
              const col = NODE_COLORS[n.type] ?? "#6b7280";
              return (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 7, background: "var(--surface-2)", border: "1px solid var(--border)" }}>
                  <span style={{ fontSize: 14 }}>{NODE_EMOJI[n.type] ?? "📄"}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 12, fontWeight: 600, color: "var(--text-1)", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n.name ?? n.id}</p>
                    <p style={{ fontSize: 9, color: col, fontWeight: 700, margin: 0, textTransform: "uppercase" }}>{n.type}</p>
                  </div>
                  {n.relationship && <span style={{ fontSize: 10, color: "var(--text-3)", background: "var(--surface-1)", border: "1px solid var(--border)", borderRadius: 4, padding: "1px 6px" }}>{n.relationship}</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {data.summary && (
        <div style={{ padding: "10px 14px", borderRadius: 8, background: "rgba(124,58,237,0.06)", border: "1px solid rgba(124,58,237,0.2)" }}>
          <p style={{ fontSize: 12, color: "var(--text-2)", margin: 0, lineHeight: 1.6 }}>{data.summary}</p>
        </div>
      )}
    </div>
  );
}

function CoverageTab() {
  const qc = useQueryClient();
  const [module, setModule] = useState("");

  const mutation = useMutation({
    mutationFn: () => graphApi.coverageGaps({ module: module || undefined }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["coverage-gaps"] }),
  });

  const { data } = useQuery({
    queryKey: ["coverage-gaps"],
    queryFn: () => graphApi.coverageGaps({}),
  });

  const gaps: any[] = data?.gaps ?? [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", gap: 8 }}>
        <input value={module} onChange={e => setModule(e.target.value)} placeholder="Filter by module (optional)"
          style={{ flex: 1, padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--text-1)", fontSize: 13 }} />
        <button onClick={() => mutation.mutate()} disabled={mutation.isPending}
          style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "linear-gradient(135deg,#7c3aed,#a78bfa)", color: "white", fontSize: 13, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
          {mutation.isPending ? <RefreshCw size={13} style={{ animation: "spin 0.8s linear infinite" }} /> : <Target size={13} />}
          Analyze Gaps
        </button>
      </div>

      {data && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
            <StatBadge label="Total Reqs" value={data.total_requirements ?? 0}    color="#3b82f6" />
            <StatBadge label="Covered"   value={data.covered_requirements ?? 0}  color="#22c55e" />
            <StatBadge label="Gaps"      value={data.uncovered_requirements ?? 0} color="#ef4444" />
          </div>

          {gaps.length > 0 && (
            <div>
              <p style={{ fontSize: 10, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
                Coverage Gaps ({gaps.length})
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 400, overflowY: "auto" }}>
                {gaps.map((g: any, i: number) => {
                  const vc = VERDICT_CONFIG[g.verdict as keyof typeof VERDICT_CONFIG] ?? VERDICT_CONFIG.UNSUPPORTED;
                  const VIcon = vc.icon;
                  return (
                    <div key={i} style={{ padding: "10px 14px", borderRadius: 8, background: "var(--surface-1)", border: "1px solid var(--border)", display: "flex", gap: 10, alignItems: "flex-start" }}>
                      <VIcon size={13} color={vc.color} style={{ marginTop: 2, flexShrink: 0 }} />
                      <div style={{ flex: 1 }}>
                        <p style={{ fontSize: 12, fontWeight: 600, color: "var(--text-1)", margin: "0 0 3px" }}>{g.requirement ?? g.name}</p>
                        {g.suggestion && <p style={{ fontSize: 11, color: "var(--text-3)", margin: 0, lineHeight: 1.5 }}>{g.suggestion}</p>}
                      </div>
                      <span style={{ fontSize: 10, fontWeight: 700, color: vc.color, background: vc.color + "15", border: `1px solid ${vc.color}30`, borderRadius: 4, padding: "2px 7px", flexShrink: 0 }}>{vc.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function CITab() {
  const qc = useQueryClient();
  const [ciSystem, setCiSystem] = useState("github");
  const [token, setToken] = useState("");
  const [repo, setRepo] = useState("");
  const [owner, setOwner] = useState("");
  const [branch, setBranch] = useState("main");
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");

  const mutation = useMutation({
    mutationFn: () => graphApi.populateCi({ ci_system: ciSystem, token, repo, owner, branch, limit: 20 }),
    onSuccess: d => { setResult(d); qc.invalidateQueries({ queryKey: ["graph-stats"] }); },
    onError: (e: any) => setError(e?.response?.data?.detail ?? "Failed"),
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", gap: 6 }}>
        {["github", "gitlab"].map(s => (
          <button key={s} onClick={() => setCiSystem(s)} style={{
            padding: "6px 14px", borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: "pointer",
            border: `1px solid ${ciSystem === s ? "rgba(124,58,237,0.5)" : "var(--border)"}`,
            background: ciSystem === s ? "rgba(124,58,237,0.12)" : "var(--surface-2)",
            color: ciSystem === s ? "#a78bfa" : "var(--text-2)",
          }}>{s === "github" ? "GitHub Actions" : "GitLab CI"}</button>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {ciSystem === "github" && (
          <div>
            <label style={{ fontSize: 11, color: "var(--text-3)", display: "block", marginBottom: 4 }}>Owner / Org</label>
            <input value={owner} onChange={e => setOwner(e.target.value)} placeholder="octocat"
              style={{ width: "100%", padding: "7px 10px", borderRadius: 7, border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--text-1)", fontSize: 12, boxSizing: "border-box" }} />
          </div>
        )}
        <div>
          <label style={{ fontSize: 11, color: "var(--text-3)", display: "block", marginBottom: 4 }}>Repository</label>
          <input value={repo} onChange={e => setRepo(e.target.value)} placeholder={ciSystem === "github" ? "my-repo" : "123"}
            style={{ width: "100%", padding: "7px 10px", borderRadius: 7, border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--text-1)", fontSize: 12, boxSizing: "border-box" }} />
        </div>
        <div>
          <label style={{ fontSize: 11, color: "var(--text-3)", display: "block", marginBottom: 4 }}>Branch</label>
          <input value={branch} onChange={e => setBranch(e.target.value)} placeholder="main"
            style={{ width: "100%", padding: "7px 10px", borderRadius: 7, border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--text-1)", fontSize: 12, boxSizing: "border-box" }} />
        </div>
        <div>
          <label style={{ fontSize: 11, color: "var(--text-3)", display: "block", marginBottom: 4 }}>API Token</label>
          <input type="password" value={token} onChange={e => setToken(e.target.value)} placeholder="ghp_..."
            style={{ width: "100%", padding: "7px 10px", borderRadius: 7, border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--text-1)", fontSize: 12, boxSizing: "border-box" }} />
        </div>
      </div>

      {error && <p style={{ fontSize: 12, color: "#ef4444" }}>{error}</p>}

      <button onClick={() => mutation.mutate()} disabled={mutation.isPending || !token || !repo}
        style={{ padding: "9px 20px", borderRadius: 9, border: "none", background: "linear-gradient(135deg,#7c3aed,#a78bfa)", color: "white", fontSize: 13, fontWeight: 700, cursor: "pointer", opacity: mutation.isPending || !token || !repo ? 0.6 : 1, display: "flex", alignItems: "center", gap: 7, width: "fit-content" }}>
        {mutation.isPending ? <RefreshCw size={14} style={{ animation: "spin 0.8s linear infinite" }} /> : <Zap size={14} />}
        Import Pipeline Runs
      </button>

      {result && (
        <div style={{ padding: "12px 14px", borderRadius: 9, background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.25)", display: "flex", gap: 10, alignItems: "center" }}>
          <CheckCircle size={14} color="#22c55e" />
          <span style={{ fontSize: 13, fontWeight: 600, color: "#22c55e" }}>
            Imported {result.imported ?? 0} pipeline runs · {result.edges_created ?? 0} graph edges
          </span>
        </div>
      )}
    </div>
  );
}

type Tab = "explorer" | "coverage" | "ci";

export default function GraphPage() {
  const [tab, setTab] = useState<Tab>("explorer");
  const [search, setSearch] = useState("");
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState("all");

  const { data: statsData } = useQuery({
    queryKey: ["graph-stats"],
    queryFn: graphApi.stats,
    refetchInterval: 15_000,
  });

  const { data: nodesData, isLoading } = useQuery({
    queryKey: ["graph-nodes", typeFilter, search],
    queryFn: () => graphApi.nodes({ type: typeFilter === "all" ? "" : typeFilter, search }),
    enabled: tab === "explorer",
  });

  const nodes: any[] = nodesData?.nodes ?? [];
  const stats = statsData ?? {};

  const TABS: { id: Tab; label: string; icon: any }[] = [
    { id: "explorer", label: "Impact Explorer", icon: Activity    },
    { id: "coverage", label: "Coverage Gaps",   icon: Target      },
    { id: "ci",       label: "CI Pipeline",     icon: GitCommit   },
  ];

  return (
    <div style={{ padding: "28px 32px", maxWidth: 1200 }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
        style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text-1)", margin: 0, display: "flex", alignItems: "center", gap: 10 }}>
          <GitBranch size={20} color="#7c3aed" /> Knowledge Graph
        </h1>
        <p style={{ fontSize: 13, color: "var(--text-3)", marginTop: 4 }}>
          Impact analysis · Coverage gaps · CI pipeline integration
        </p>
      </motion.div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 24 }}>
        {[
          { label: "Nodes",     value: stats.total_nodes         ?? 0, color: "#7c3aed" },
          { label: "Edges",     value: stats.total_relationships ?? 0, color: "#10b981" },
          { label: "Features",  value: stats.features            ?? 0, color: "#3b82f6" },
          { label: "Tests",     value: stats.test_cases          ?? 0, color: "#f59e0b" },
          { label: "Pipelines", value: stats.pipeline_runs       ?? 0, color: "#06b6d4" },
        ].map(s => (
          <motion.div key={s.label}
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            style={{ padding: "12px 16px", borderRadius: 12, background: "var(--surface-1)", border: `1px solid ${s.color}25`, position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: s.color, opacity: 0.7 }} />
            <div style={{ fontSize: 22, fontWeight: 800, color: s.color, fontVariantNumeric: "tabular-nums" }}>{s.value.toLocaleString()}</div>
            <div style={{ fontSize: 10, color: "var(--text-3)", marginTop: 2, textTransform: "uppercase", letterSpacing: "0.07em" }}>{s.label}</div>
          </motion.div>
        ))}
      </div>

      {/* Tab bar */}
      <div style={{ display: "flex", gap: 4, borderBottom: "1px solid var(--border)", marginBottom: 20 }}>
        {TABS.map(t => {
          const active = tab === t.id;
          const TIcon = t.icon;
          return (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "8px 14px", fontSize: 12, fontWeight: active ? 700 : 500, cursor: "pointer",
              borderRadius: "8px 8px 0 0", border: "1px solid",
              borderBottom: active ? "1px solid var(--surface-1)" : "1px solid var(--border)",
              background: active ? "var(--surface-1)" : "transparent",
              borderColor: active ? "rgba(124,58,237,0.4)" : "var(--border)",
              color: active ? "#a78bfa" : "var(--text-3)",
              transition: "all 0.1s", marginBottom: "-1px",
            }}>
              <TIcon size={13} />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {tab === "explorer" && (
        <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 16 }}>
          {/* Node browser */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ position: "relative" }}>
              <Search size={13} color="var(--text-3)" style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }} />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search nodes…"
                style={{ width: "100%", padding: "8px 10px 8px 30px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--text-1)", fontSize: 12, boxSizing: "border-box" }} />
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {["all", ...Object.keys(NODE_COLORS)].map(t => (
                <button key={t} onClick={() => setTypeFilter(t)} style={{
                  padding: "3px 8px", borderRadius: 5, fontSize: 10, fontWeight: 600, cursor: "pointer",
                  border: `1px solid ${typeFilter === t ? "rgba(124,58,237,0.5)" : "var(--border)"}`,
                  background: typeFilter === t ? "rgba(124,58,237,0.12)" : "var(--surface-2)",
                  color: typeFilter === t ? "#a78bfa" : "var(--text-3)",
                }}>{t === "all" ? "All" : t}</button>
              ))}
            </div>

            <div style={{ border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden", flex: 1 }}>
              <div style={{ padding: "8px 12px", background: "var(--surface-2)", borderBottom: "1px solid var(--border)" }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  Nodes ({nodes.length})
                </span>
              </div>
              {isLoading ? (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 120 }}>
                  <RefreshCw size={16} color="var(--text-3)" style={{ animation: "spin 0.8s linear infinite" }} />
                </div>
              ) : nodes.length === 0 ? (
                <div style={{ padding: 20, textAlign: "center" }}>
                  <p style={{ fontSize: 12, color: "var(--text-3)", margin: 0 }}>No nodes found</p>
                  <p style={{ fontSize: 11, color: "var(--text-3)", margin: "6px 0 0" }}>Upload documents to populate the graph</p>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 4, padding: 8, maxHeight: 500, overflowY: "auto" }}>
                  {nodes.map((n: any, i: number) => (
                    <NodeCard key={n.id ?? i} node={n}
                      selected={selectedNode === (n.id ?? i)}
                      onSelect={() => setSelectedNode(selectedNode === (n.id ?? i) ? null : (n.id ?? i))} />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Impact panel */}
          <div style={{ border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
            <div style={{ padding: "12px 16px", background: "var(--surface-2)", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 8 }}>
              <Layers size={14} color="#7c3aed" />
              <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-1)" }}>Impact Analysis</span>
              {selectedNode && <span style={{ fontSize: 10, color: "var(--text-3)", background: "var(--surface-1)", border: "1px solid var(--border)", borderRadius: 5, padding: "2px 8px" }}>Node: {selectedNode}</span>}
            </div>
            <div style={{ padding: 16 }}>
              {!selectedNode ? (
                <div style={{ textAlign: "center", padding: "48px 20px" }}>
                  <Activity size={32} color="var(--text-3)" style={{ margin: "0 auto 12px" }} />
                  <p style={{ fontSize: 14, fontWeight: 600, color: "var(--text-1)", margin: "0 0 6px" }}>Select a node</p>
                  <p style={{ fontSize: 12, color: "var(--text-3)", margin: 0 }}>Click any node on the left to see its impact across the knowledge graph</p>
                </div>
              ) : (
                <ImpactPanel nodeId={selectedNode} />
              )}
            </div>
          </div>
        </div>
      )}

      {tab === "coverage" && (
        <div style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 20, background: "var(--surface-1)" }}>
          <CoverageTab />
        </div>
      )}

      {tab === "ci" && (
        <div style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 20, background: "var(--surface-1)" }}>
          <CITab />
        </div>
      )}
    </div>
  );
}
