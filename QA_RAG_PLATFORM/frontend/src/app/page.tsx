"use client";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { statsApi } from "@/lib/api";
import { Stats } from "@/types";
import Link from "next/link";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import {
  FileText, Hash, Brain, CheckCircle, Clock, Zap,
  Flame, GitBranch, TestTube, RefreshCw, ArrowRight,
  Copy, Target, AlertCircle, FileCheck, Code, Database,
} from "lucide-react";

const COLORS = ["#7c3aed", "#10b981", "#3b82f6", "#f59e0b", "#ef4444", "#06b6d4"];

const QUICK_AGENTS = [
  { label: "Flaky Test Analyzer", icon: Flame,     desc: "Detect unstable tests", action: "flaky_test_analyzer" },
  { label: "Generate Test Cases",  icon: TestTube,  desc: "AI-powered test generation", action: "generate_test_cases" },
  { label: "Automation Pipeline",  icon: GitBranch, desc: "Spec.ts from user stories", action: "automation_pipeline" },
  { label: "Coverage Analysis",    icon: Target,    desc: "Gap detection & suggestions", action: "coverage_analysis" },
];

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function CountUp({ to }: { to: number }) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (to === 0) return;
    let cur = 0;
    const step = Math.max(1, Math.ceil(to / 50));
    const id = setInterval(() => {
      cur = Math.min(cur + step, to);
      setVal(cur);
      if (cur >= to) clearInterval(id);
    }, 16);
    return () => clearInterval(id);
  }, [to]);
  return <>{val.toLocaleString()}</>;
}

const STAT_DEFS = [
  { key: "total_documents", label: "Documents",  icon: FileText,     accent: "#7c3aed" },
  { key: "total_chunks",    label: "Chunks",     icon: Hash,         accent: "#10b981" },
  { key: "total_vectors",   label: "Vectors",    icon: Brain,        accent: "#3b82f6" },
  { key: "ready",           label: "Ready",      icon: CheckCircle,  accent: "#22c55e" },
  { key: "processing",      label: "Processing", icon: Clock,        accent: "#f59e0b" },
] as const;

function StatCard({ label, value, icon: Icon, accent, delay }: {
  label: string; value: number; icon: any; accent: string; delay: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      style={{
        padding: "20px 22px", borderRadius: 14,
        background: "var(--surface-1)", border: "1px solid var(--border)",
        position: "relative", overflow: "hidden",
      }}
    >
      {/* accent strip */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: accent, borderRadius: "14px 14px 0 0", opacity: 0.8 }} />
      <div style={{
        width: 34, height: 34, borderRadius: 9, marginBottom: 12,
        background: `${accent}20`,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <Icon size={16} color={accent} />
      </div>
      <div style={{ fontSize: 26, fontWeight: 800, color: "var(--text-1)", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
        <CountUp to={value} />
      </div>
      <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 4, fontWeight: 500 }}>{label}</div>
    </motion.div>
  );
}

function LLMStatusWidget() {
  const { data, refetch, isFetching } = useQuery({
    queryKey: ["llm-status-dash"],
    queryFn: async () => {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ""}/api/llm/status`);
      return res.json();
    },
    refetchInterval: 30_000,
    retry: false,
  });

  const providers: { name: string; available: boolean; resets_in_s?: number }[] = data?.providers ?? [];
  const availCount = data?.available_count ?? 0;
  const totalCount = data?.total_count ?? 0;
  const allOk = availCount === totalCount && totalCount > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3, duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      style={{ padding: 20, borderRadius: 14, background: "var(--surface-1)", border: "1px solid var(--border)" }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <p style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.08em", margin: 0 }}>LLM Router</p>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
            <div style={{
              width: 7, height: 7, borderRadius: "50%",
              background: allOk ? "#22c55e" : totalCount === 0 ? "#6B7280" : "#f59e0b",
              boxShadow: allOk ? "0 0 6px #22c55e80" : "none",
            }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-1)" }}>
              {totalCount === 0 ? "Checking…" : `${availCount}/${totalCount} providers up`}
            </span>
          </div>
        </div>
        <button
          onClick={() => refetch()}
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid var(--border)", borderRadius: 7, padding: 7, cursor: "pointer", color: "var(--text-3)", display: "flex" }}
          title="Refresh status"
        >
          <RefreshCw size={13} style={{ animation: isFetching ? "spin 0.8s linear infinite" : "none" }} />
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {providers.length === 0 ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} style={{ height: 28, borderRadius: 6, background: "rgba(255,255,255,0.04)", animation: "pulse 1.5s ease infinite" }} />
          ))
        ) : (
          providers.map((p) => (
            <div key={p.name} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{
                width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
                background: p.available ? "#22c55e" : "#ef4444",
                boxShadow: p.available ? "0 0 5px #22c55e80" : "none",
              }} />
              <span style={{ fontSize: 12, color: p.available ? "var(--text-2)" : "var(--text-3)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {p.name}
              </span>
              {!p.available && p.resets_in_s && p.resets_in_s > 0 && (
                <span style={{ fontSize: 10, color: "#f59e0b", background: "rgba(245,158,11,0.1)", padding: "1px 6px", borderRadius: 4, flexShrink: 0 }}>
                  ~{Math.ceil(p.resets_in_s / 60)}m
                </span>
              )}
              {p.available && (
                <span style={{ fontSize: 10, color: "#22c55e", background: "rgba(34,197,94,0.1)", padding: "1px 6px", borderRadius: 4, flexShrink: 0 }}>
                  Live
                </span>
              )}
            </div>
          ))
        )}
      </div>
      <style>{`@keyframes pulse { 0%,100%{opacity:0.4} 50%{opacity:0.7} }`}</style>
    </motion.div>
  );
}

function QuickLaunchWidget({ agentCount }: { agentCount: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.35, duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      style={{ padding: 20, borderRadius: 14, background: "var(--surface-1)", border: "1px solid var(--border)" }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <p style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.08em", margin: 0 }}>AI Agents</p>
          <p style={{ fontSize: 12, fontWeight: 600, color: "var(--text-1)", marginTop: 4 }}>{agentCount} specialized QA agents · Groq llama-3.3</p>
        </div>
        <Link href="/ai" style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--accent-light)" }}>
          All agents <ArrowRight size={12} />
        </Link>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {QUICK_AGENTS.map(({ label, icon: Icon, desc, action }, i) => (
          <motion.div key={action}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.4 + i * 0.05 }}
            whileHover={{ borderColor: "rgba(124,58,237,0.4)", y: -1 }}
            style={{
              padding: "10px 12px", borderRadius: 10, cursor: "pointer",
              background: "rgba(124,58,237,0.05)", border: "1px solid rgba(124,58,237,0.12)",
              transition: "border-color 0.15s",
            }}
            onClick={() => { window.location.href = `/ai#${action}`; }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 4 }}>
              <Icon size={13} color="#a78bfa" />
              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-1)", lineHeight: 1.3 }}>{label}</span>
            </div>
            <p style={{ fontSize: 10, color: "var(--text-3)", margin: 0, lineHeight: 1.4 }}>{desc}</p>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "var(--surface-3)", border: "1px solid var(--border-strong)", borderRadius: 8, padding: "8px 12px" }}>
      <p style={{ fontSize: 12, color: "var(--text-2)", margin: 0 }}>{label}</p>
      <p style={{ fontSize: 14, fontWeight: 700, color: "var(--text-1)", margin: "2px 0 0" }}>{payload[0].value}</p>
    </div>
  );
};

const FILE_ICONS: Record<string, string> = {
  pdf: "📄", xlsx: "📊", csv: "📊", docx: "📝", ts: "⚡", js: "⚡",
};

function DocRow({ doc, i, total }: { doc: any; i: number; total: number }) {
  const icon = FILE_ICONS[doc.file_type] ?? "📋";
  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.05 * i, duration: 0.25 }}
      style={{
        display: "flex", alignItems: "center", gap: 14,
        padding: "14px 20px",
        borderBottom: i < total - 1 ? "1px solid var(--border)" : "none",
      }}
    >
      <div style={{
        width: 36, height: 36, borderRadius: 8,
        background: "var(--surface-2)", border: "1px solid var(--border)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 16, flexShrink: 0,
      }}>
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {doc.filename}
          </span>
          {doc.module && <span className="badge badge-purple" style={{ fontSize: 10 }}>{doc.module}</span>}
          {doc.document_type && <span className="badge badge-slate" style={{ fontSize: 10 }}>{doc.document_type}</span>}
        </div>
        <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 3, display: "flex", gap: 10 }}>
          <span>{doc.total_chunks} chunks</span>
          <span>{doc.total_vectors} vectors</span>
          {doc.author && <span>{doc.author}</span>}
          <span style={{ marginLeft: "auto", flexShrink: 0 }}>{timeAgo(doc.created_at)}</span>
        </div>
      </div>
      <span className={`badge ${doc.status === "ready" ? "badge-green" : doc.status === "error" ? "badge-red" : "badge-amber"}`} style={{ fontSize: 10, flexShrink: 0 }}>
        {doc.status}
      </span>
    </motion.div>
  );
}

export default function Dashboard() {
  const { data: stats, isLoading } = useQuery<Stats>({
    queryKey: ["stats"],
    queryFn: statsApi.get,
    refetchInterval: 8000,
  });

  const { data: actionsData } = useQuery({
    queryKey: ["ai-actions-count"],
    queryFn: async () => {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ""}/api/ai/actions`);
      return res.json();
    },
    staleTime: Infinity,
  });

  const typeData = Object.entries(stats?.by_type ?? {}).map(([name, value]) => ({
    name: name.replace("_", " "), value,
  }));
  const moduleData = Object.entries(stats?.by_module ?? {})
    .sort(([, a], [, b]) => (b as number) - (a as number))
    .slice(0, 7)
    .map(([name, value]) => ({ name, value }));

  const statValues = {
    total_documents: stats?.total_documents ?? 0,
    total_chunks: stats?.total_chunks ?? 0,
    total_vectors: stats?.total_vectors ?? 0,
    ready: stats?.by_status?.ready ?? 0,
    processing: stats?.by_status?.processing ?? 0,
  };

  const agentCount = actionsData?.actions?.length ?? 12;

  if (isLoading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{
          width: 40, height: 40, border: "3px solid var(--accent)", borderTopColor: "transparent",
          borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 12px",
        }} />
        <p style={{ color: "var(--text-3)", fontSize: 13 }}>Loading platform…</p>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  return (
    <div style={{ padding: "28px 32px", maxWidth: 1200 }}>
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 28 }}
      >
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text-1)", margin: 0 }}>
            QA Knowledge Platform
          </h1>
          <p style={{ fontSize: 13, color: "var(--text-3)", marginTop: 4 }}>
            Multi-format ingestion · Hybrid Dense+BM25 search · {agentCount} AI agents
          </p>
        </div>
        <Link href="/upload" className="btn btn-primary" style={{ textDecoration: "none" }}>
          + Upload Document
        </Link>
      </motion.div>

      {/* Stat Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 14, marginBottom: 24 }}>
        {STAT_DEFS.map(({ key, label, icon, accent }, i) => (
          <StatCard key={key} label={label} value={(statValues as any)[key]} icon={icon} accent={accent} delay={0.05 * i} />
        ))}
      </div>

      {/* LLM Status + Quick Launch */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.6fr", gap: 16, marginBottom: 24 }}>
        <LLMStatusWidget />
        <QuickLaunchWidget agentCount={agentCount} />
      </div>

      {/* Charts Row */}
      {(typeData.length > 0 || moduleData.length > 0) && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: 16, marginBottom: 24 }}>
          {typeData.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.45, duration: 0.35 }}
              className="card" style={{ padding: 20 }}
            >
              <p style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 16 }}>
                By Document Type
              </p>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={typeData} dataKey="value" nameKey="name" cx="40%" cy="50%" outerRadius={75} innerRadius={40}>
                    {typeData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} strokeWidth={0} />)}
                  </Pie>
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, color: "var(--text-2)" }} />
                  <Tooltip content={<CustomTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            </motion.div>
          )}

          {moduleData.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5, duration: 0.35 }}
              className="card" style={{ padding: 20 }}
            >
              <p style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 16 }}>
                By Module
              </p>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={moduleData} layout="vertical" barSize={12}>
                  <XAxis type="number" tick={{ fontSize: 10, fill: "var(--text-3)" }} axisLine={false} tickLine={false} />
                  <YAxis dataKey="name" type="category" tick={{ fontSize: 11, fill: "var(--text-2)" }} width={90} axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(124,58,237,0.05)" }} />
                  <Bar dataKey="value" fill="url(#barGrad)" radius={[0, 6, 6, 0]} />
                  <defs>
                    <linearGradient id="barGrad" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#7c3aed" />
                      <stop offset="100%" stopColor="#a78bfa" />
                    </linearGradient>
                  </defs>
                </BarChart>
              </ResponsiveContainer>
            </motion.div>
          )}
        </div>
      )}

      {/* Recent Documents */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.55, duration: 0.35 }}
        className="card"
      >
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: "var(--text-1)", margin: 0 }}>Recent Documents</p>
          <Link href="/documents" style={{ fontSize: 12, color: "var(--accent-light)", textDecoration: "none" }}>View all →</Link>
        </div>

        {!stats?.recent_documents?.length ? (
          <div style={{ padding: "48px 20px", textAlign: "center" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📂</div>
            <p style={{ fontSize: 14, fontWeight: 600, color: "var(--text-1)", margin: "0 0 6px" }}>No documents yet</p>
            <p style={{ fontSize: 12, color: "var(--text-3)", margin: "0 0 20px" }}>
              Upload PDFs, Excel sheets, test cases, Playwright scripts, API specs — anything.
            </p>
            <Link href="/upload" className="btn btn-primary" style={{ textDecoration: "none" }}>
              Upload First Document
            </Link>
          </div>
        ) : (
          <div>
            {stats.recent_documents.map((doc, i) => (
              <DocRow key={doc.id} doc={doc} i={i} total={stats.recent_documents.length} />
            ))}
          </div>
        )}
      </motion.div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
