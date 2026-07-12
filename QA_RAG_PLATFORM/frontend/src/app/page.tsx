"use client";
import { useQuery } from "@tanstack/react-query";
import { statsApi } from "@/lib/api";
import { Stats } from "@/types";
import Link from "next/link";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";

const COLORS = ["#7c3aed", "#10b981", "#3b82f6", "#f59e0b", "#ef4444", "#06b6d4"];

const STATS = [
  { key: "total_documents", label: "Documents",   color: "stat-purple", icon: "📄" },
  { key: "total_chunks",    label: "Chunks",      color: "stat-green",  icon: "🔷" },
  { key: "total_vectors",   label: "Vectors",     color: "stat-blue",   icon: "🧠" },
  { key: "ready",           label: "Ready",       color: "stat-teal",   icon: "✅" },
  { key: "processing",      label: "Processing",  color: "stat-amber",  icon: "⏳" },
] as const;

function StatCard({ label, value, icon, colorClass }: { label: string; value: number; icon: string; colorClass: string }) {
  return (
    <div className={`card ${colorClass}`} style={{ padding: "20px 22px" }}>
      <div style={{ fontSize: 26, marginBottom: 8 }}>{icon}</div>
      <div style={{ fontSize: 28, fontWeight: 800, color: "var(--text-1)", lineHeight: 1 }}>
        {value?.toLocaleString() ?? 0}
      </div>
      <div style={{ fontSize: 12, color: "var(--text-2)", marginTop: 4, fontWeight: 500 }}>{label}</div>
    </div>
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

export default function Dashboard() {
  const { data: stats, isLoading } = useQuery<Stats>({
    queryKey: ["stats"],
    queryFn: statsApi.get,
    refetchInterval: 8000,
  });

  const typeData = Object.entries(stats?.by_type ?? {}).map(([name, value]) => ({
    name: name.replace("_", " "),
    value,
  }));
  const moduleData = Object.entries(stats?.by_module ?? {})
    .sort(([, a], [, b]) => b - a)
    .slice(0, 7)
    .map(([name, value]) => ({ name, value }));

  const statValues = {
    total_documents: stats?.total_documents ?? 0,
    total_chunks: stats?.total_chunks ?? 0,
    total_vectors: stats?.total_vectors ?? 0,
    ready: stats?.by_status?.ready ?? 0,
    processing: stats?.by_status?.processing ?? 0,
  };

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
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text-1)", margin: 0 }}>
            QA Knowledge Platform
          </h1>
          <p style={{ fontSize: 13, color: "var(--text-3)", marginTop: 4 }}>
            Multi-format ingestion · Hybrid Dense+BM25 search · 9 AI agents
          </p>
        </div>
        <Link href="/upload" className="btn btn-primary" style={{ textDecoration: "none" }}>
          + Upload Document
        </Link>
      </div>

      {/* Stat Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 14, marginBottom: 24 }}>
        {STATS.map(({ key, label, color, icon }) => (
          <StatCard key={key} label={label} value={(statValues as any)[key]} icon={icon} colorClass={color} />
        ))}
      </div>

      {/* Charts Row */}
      {(typeData.length > 0 || moduleData.length > 0) && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: 16, marginBottom: 24 }}>
          {typeData.length > 0 && (
            <div className="card" style={{ padding: 20 }}>
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
            </div>
          )}

          {moduleData.length > 0 && (
            <div className="card" style={{ padding: 20 }}>
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
            </div>
          )}
        </div>
      )}

      {/* Recent Documents */}
      <div className="card">
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
              <div key={doc.id} style={{
                display: "flex", alignItems: "center", gap: 14,
                padding: "14px 20px",
                borderBottom: i < (stats.recent_documents.length - 1) ? "1px solid var(--border)" : "none",
              }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 8,
                  background: "var(--surface-2)", border: "1px solid var(--border)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 16, flexShrink: 0,
                }}>
                  {doc.file_type === "pdf" ? "📄" : doc.file_type === "xlsx" || doc.file_type === "csv" ? "📊" : doc.file_type === "docx" ? "📝" : doc.file_type === "ts" || doc.file_type === "js" ? "⚡" : "📋"}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {doc.filename}
                    </span>
                    {doc.module && <span className="badge badge-purple" style={{ fontSize: 10 }}>{doc.module}</span>}
                    {doc.document_type && <span className="badge badge-slate" style={{ fontSize: 10 }}>{doc.document_type}</span>}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>
                    {doc.total_chunks} chunks · {doc.total_vectors} vectors
                    {doc.author && ` · ${doc.author}`}
                  </div>
                </div>
                <span className={`badge ${doc.status === "ready" ? "badge-green" : doc.status === "error" ? "badge-red" : "badge-amber"}`} style={{ fontSize: 10, flexShrink: 0 }}>
                  {doc.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
