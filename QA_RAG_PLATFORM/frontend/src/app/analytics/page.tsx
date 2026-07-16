"use client";
import { useEffect, useState } from "react";
import {
  BarChart2, CheckCircle, XCircle, Clock, Zap,
  TrendingUp, FileText, RefreshCw, Award,
} from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL || "";

interface Summary {
  total_jobs: number;
  total_files: number;
  completed_files: number;
  failed_files: number;
  success_rate: number;
  avg_confidence: number;
  hours_saved: number;
  job_status: { done: number; partial: number; failed: number; running: number };
  framework_distribution: Record<string, number>;
  language_distribution: Record<string, number>;
  source_distribution: Record<string, number>;
  timeline: Record<string, number>;
}

interface Job {
  id: string;
  status: string;
  source_type: string;
  source_name: string;
  file_count: number;
  completed_files: number;
  failed_files: number;
  avg_confidence: number;
  created_at: string;
}

function StatCard({ label, value, sub, icon: Icon, color }:
  { label: string; value: string | number; sub?: string; icon: any; color: string }) {
  return (
    <div style={{ background: "#111827", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: "18px 20px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <span style={{ fontSize: 11, color: "#6B7280", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</span>
        <Icon size={14} color={color} />
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, color: "#F9FAFB", fontFamily: "monospace", lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "#4B5563", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function HBar({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const pct = total > 0 ? (value / total) * 100 : 0;
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontSize: 12, color: "#9CA3AF" }}>{label}</span>
        <span style={{ fontSize: 12, color: "#6B7280", fontFamily: "monospace" }}>{value}</span>
      </div>
      <div style={{ height: 6, background: "rgba(255,255,255,0.05)", borderRadius: 3 }}>
        <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 3, transition: "width 0.7s ease" }} />
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, [string, string]> = {
    done:    ["#10b981", "rgba(16,185,129,0.1)"],
    partial: ["#f59e0b", "rgba(245,158,11,0.1)"],
    failed:  ["#f43f5e", "rgba(244,63,94,0.1)"],
    running: ["#3b82f6", "rgba(59,130,246,0.1)"],
    pending: ["#6B7280", "rgba(107,114,128,0.1)"],
  };
  const [color, bg] = map[status] || map["pending"];
  return (
    <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, background: bg, color, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>
      {status}
    </span>
  );
}

function TimelineChart({ data }: { data: Record<string, number> }) {
  const entries = Object.entries(data);
  if (entries.length === 0) return <p style={{ color: "#4B5563", fontSize: 12 }}>No data yet</p>;
  const max = Math.max(...entries.map(([, v]) => v), 1);
  const H = 80;
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: H + 24, padding: "0 4px" }}>
      {entries.slice(-30).map(([date, count]) => {
        const barH = Math.max(4, (count / max) * H);
        return (
          <div key={date} title={`${date}: ${count} jobs`} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
            <div style={{ width: "100%", height: barH, background: "rgba(124,58,237,0.6)", borderRadius: "3px 3px 0 0", transition: "height 0.5s ease" }} />
            {entries.slice(-30).indexOf(entries.find(([d]) => d === date)!) % 7 === 0 && (
              <span style={{ fontSize: 8, color: "#4B5563", transform: "rotate(-45deg)", whiteSpace: "nowrap", transformOrigin: "left top" }}>
                {date.slice(5)}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function AnalyticsPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const [sRes, jRes] = await Promise.all([
        fetch(`${API}/api/analytics/summary`),
        fetch(`${API}/api/analytics/recent-jobs?limit=10`),
      ]);
      const s = await sRes.json();
      const j = await jRes.json();
      setSummary(s);
      setJobs(j.jobs || []);
    } catch {
      // silently show empty state
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const fwEntries = summary ? Object.entries(summary.framework_distribution) : [];
  const fwTotal = fwEntries.reduce((a, [, v]) => a + v, 0);
  const langEntries = summary ? Object.entries(summary.language_distribution) : [];
  const langTotal = langEntries.reduce((a, [, v]) => a + v, 0);

  return (
    <div style={{ padding: "28px 32px", maxWidth: 1100, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <div style={{ width: 32, height: 32, borderRadius: 9, background: "linear-gradient(135deg,#7C3AED,#A78BFA)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <BarChart2 size={16} color="white" />
            </div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: "#F9FAFB", margin: 0 }}>Migration Analytics</h1>
          </div>
          <p style={{ fontSize: 13, color: "#6B7280", margin: 0 }}>Real-time stats across all migration jobs</p>
        </div>
        <button onClick={load} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 8, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#9CA3AF", fontSize: 12, cursor: "pointer" }}>
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 60, color: "#4B5563" }}>Loading analytics...</div>
      ) : summary ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {/* KPI row */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(160px,1fr))", gap: 12 }}>
            <StatCard label="Total Jobs" value={summary.total_jobs} icon={RefreshCw} color="#7C3AED" />
            <StatCard label="Files Migrated" value={summary.completed_files} sub={`of ${summary.total_files} total`} icon={FileText} color="#3b82f6" />
            <StatCard label="Success Rate" value={`${summary.success_rate}%`} sub={`${summary.failed_files} failed`} icon={CheckCircle} color="#10b981" />
            <StatCard label="Avg Confidence" value={`${summary.avg_confidence}%`} icon={Award} color="#f59e0b" />
            <StatCard label="Hours Saved" value={`${summary.hours_saved}h`} sub="~2h/file manual estimate" icon={Clock} color="#A78BFA" />
          </div>

          {/* Job status donut row */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 18 }}>
            {/* Status breakdown */}
            <div style={{ background: "#111827", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: 18 }}>
              <p style={{ fontSize: 10, fontWeight: 700, color: "#4B5563", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 14 }}>Job Status</p>
              {Object.entries(summary.job_status).map(([st, count]) => (
                <div key={st} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                  <StatusPill status={st} />
                  <span style={{ fontFamily: "monospace", fontSize: 13, color: "#F9FAFB", fontWeight: 700 }}>{count}</span>
                </div>
              ))}
            </div>

            {/* Framework distribution */}
            <div style={{ background: "#111827", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: 18 }}>
              <p style={{ fontSize: 10, fontWeight: 700, color: "#4B5563", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 14 }}>Framework Distribution</p>
              {fwEntries.length === 0
                ? <p style={{ fontSize: 12, color: "#4B5563" }}>No data yet — run your first migration</p>
                : fwEntries.map(([fw, count]) => (
                    <HBar key={fw} label={fw} value={count} total={fwTotal} color="#7C3AED" />
                  ))
              }
            </div>

            {/* Language distribution */}
            <div style={{ background: "#111827", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: 18 }}>
              <p style={{ fontSize: 10, fontWeight: 700, color: "#4B5563", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 14 }}>Language Distribution</p>
              {langEntries.length === 0
                ? <p style={{ fontSize: 12, color: "#4B5563" }}>No completed migrations yet</p>
                : langEntries.map(([lang, count]) => (
                    <HBar key={lang} label={lang} value={count} total={langTotal} color="#3b82f6" />
                  ))
              }
            </div>
          </div>

          {/* Timeline */}
          <div style={{ background: "#111827", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: 18 }}>
            <p style={{ fontSize: 10, fontWeight: 700, color: "#4B5563", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 14 }}>Migration Activity (Last 30 Days)</p>
            <TimelineChart data={summary.timeline} />
          </div>

          {/* Recent jobs table */}
          <div style={{ background: "#111827", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, overflow: "hidden" }}>
            <div style={{ padding: "12px 18px", borderBottom: "1px solid rgba(255,255,255,0.05)", display: "flex", alignItems: "center", gap: 8 }}>
              <TrendingUp size={13} color="#7C3AED" />
              <span style={{ fontSize: 12, fontWeight: 600, color: "#F9FAFB" }}>Recent Jobs</span>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr>
                    {["Source", "Type", "Files", "Success", "Confidence", "Status", "Date"].map(h => (
                      <th key={h} style={{ padding: "9px 14px", textAlign: "left", fontSize: 10, fontWeight: 700, color: "#4B5563", textTransform: "uppercase", letterSpacing: "0.08em", borderBottom: "1px solid rgba(255,255,255,0.05)", background: "#0D1117", whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {jobs.length === 0 ? (
                    <tr><td colSpan={7} style={{ padding: 24, textAlign: "center", color: "#4B5563" }}>No migration jobs yet</td></tr>
                  ) : jobs.map(j => (
                    <tr key={j.id}
                      onClick={() => window.open(`/migration?job=${j.id}`, "_self")}
                      style={{ cursor: "pointer" }}
                      onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.02)")}
                      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                    >
                      <td style={{ padding: "10px 14px", color: "#9CA3AF", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{j.source_name}</td>
                      <td style={{ padding: "10px 14px" }}>
                        <span style={{ fontFamily: "monospace", fontSize: 10, color: "#7C3AED" }}>{j.source_type}</span>
                      </td>
                      <td style={{ padding: "10px 14px", fontFamily: "monospace", color: "#F9FAFB" }}>
                        {j.completed_files}/{j.file_count}
                      </td>
                      <td style={{ padding: "10px 14px" }}>
                        <span style={{ color: j.failed_files === 0 ? "#10b981" : "#f59e0b", fontFamily: "monospace" }}>
                          {j.file_count > 0 ? Math.round((j.completed_files / j.file_count) * 100) : 0}%
                        </span>
                      </td>
                      <td style={{ padding: "10px 14px", fontFamily: "monospace", color: j.avg_confidence >= 80 ? "#10b981" : j.avg_confidence >= 60 ? "#f59e0b" : "#f43f5e" }}>
                        {j.avg_confidence > 0 ? `${j.avg_confidence}%` : "—"}
                      </td>
                      <td style={{ padding: "10px 14px" }}><StatusPill status={j.status} /></td>
                      <td style={{ padding: "10px 14px", color: "#6B7280", whiteSpace: "nowrap" }}>
                        {j.created_at ? new Date(j.created_at).toLocaleDateString() : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ textAlign: "center", padding: 60, color: "#4B5563" }}>
          <BarChart2 size={40} color="#374151" style={{ marginBottom: 12 }} />
          <p>Could not load analytics. Make sure the backend is running.</p>
        </div>
      )}
    </div>
  );
}
