"use client";
import { useQuery } from "@tanstack/react-query";
import { statsApi } from "@/lib/api";
import { Stats } from "@/types";
import { FileText, Database, Cpu, Bug, BarChart2, Clock } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import Link from "next/link";

const COLORS = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4"];

function StatCard({ label, value, icon: Icon, color }: { label: string; value: number | string; icon: any; color: string }) {
  return (
    <div className="card p-4 flex items-center gap-4">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color}`}>
        <Icon size={18} className="text-white" />
      </div>
      <div>
        <p className="text-2xl font-bold text-white">{value?.toLocaleString?.() ?? value}</p>
        <p className="text-xs text-[var(--text-muted)]">{label}</p>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { data: stats, isLoading } = useQuery<Stats>({
    queryKey: ["stats"],
    queryFn: statsApi.get,
    refetchInterval: 10000,
  });

  if (isLoading) return (
    <div className="p-8 flex items-center justify-center min-h-[60vh]">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-sm text-[var(--text-muted)]">Loading platform stats…</p>
      </div>
    </div>
  );

  const typeData = Object.entries(stats?.by_type ?? {}).map(([name, value]) => ({ name, value }));
  const moduleData = Object.entries(stats?.by_module ?? {}).slice(0, 8).map(([name, value]) => ({ name, value }));

  return (
    <div className="p-6 space-y-6 max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">QA Knowledge Platform</h1>
          <p className="text-sm text-[var(--text-muted)]">Enterprise RAG — Multi-format ingestion · Hybrid search · 9 AI agents</p>
        </div>
        <Link href="/upload" className="btn-primary flex items-center gap-2 text-sm">
          + Upload Document
        </Link>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <StatCard label="Total Documents" value={stats?.total_documents ?? 0} icon={FileText} color="bg-indigo-600" />
        <StatCard label="Total Chunks" value={stats?.total_chunks ?? 0} icon={BarChart2} color="bg-emerald-600" />
        <StatCard label="Total Vectors" value={stats?.total_vectors ?? 0} icon={Cpu} color="bg-violet-600" />
        <StatCard label="Ready" value={stats?.by_status?.ready ?? 0} icon={Database} color="bg-teal-600" />
        <StatCard label="Processing" value={stats?.by_status?.processing ?? 0} icon={Clock} color="bg-amber-600" />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-2 gap-4">
        {/* By Document Type */}
        {typeData.length > 0 && (
          <div className="card p-4">
            <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">By Document Type</p>
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie data={typeData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false} fontSize={10}>
                  {typeData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* By Module */}
        {moduleData.length > 0 && (
          <div className="card p-4">
            <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">By Module</p>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={moduleData} layout="vertical">
                <XAxis type="number" tick={{ fontSize: 10 }} />
                <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} width={80} />
                <Tooltip />
                <Bar dataKey="value" fill="#6366f1" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Recent Documents */}
      {stats?.recent_documents?.length ? (
        <div className="card p-4">
          <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">Recent Documents</p>
          <div className="space-y-2">
            {stats.recent_documents.map((doc) => (
              <div key={doc.id} className="flex items-center justify-between py-2 border-b border-[var(--border)] last:border-0">
                <div className="flex items-center gap-3">
                  <span className={`badge text-[10px] ${
                    doc.status === "ready" ? "bg-emerald-900/40 text-emerald-400" :
                    doc.status === "error" ? "bg-red-900/40 text-red-400" :
                    "bg-amber-900/40 text-amber-400"
                  }`}>{doc.status}</span>
                  <span className="text-sm text-white">{doc.filename}</span>
                  {doc.module && <span className="badge bg-indigo-900/40 text-indigo-400">{doc.module}</span>}
                </div>
                <div className="flex items-center gap-4 text-[11px] text-[var(--text-muted)]">
                  <span>{doc.total_chunks} chunks</span>
                  <span>{doc.document_type ?? "general"}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="card p-12 text-center">
          <FileText size={40} className="mx-auto mb-3 text-[var(--text-muted)]" />
          <p className="text-sm text-white font-semibold">No documents yet</p>
          <p className="text-xs text-[var(--text-muted)] mt-1">Upload PDFs, Excel files, test cases, Playwright scripts, API specs — anything.</p>
          <Link href="/upload" className="btn-primary mt-4 inline-flex">Upload First Document</Link>
        </div>
      )}
    </div>
  );
}
