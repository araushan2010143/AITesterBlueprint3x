"use client";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle, AlertTriangle, Info, Copy, Download,
  ChevronDown, ChevronRight, Layers, GitBranch, Code2,
  FileCode, Zap, Shield,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

interface SourceAnalysis {
  language: string;
  framework: string;
  patterns: string[];
  build_tool: string;
  test_count: number;
  complexity: "low" | "medium" | "high";
  challenges: string[];
  confidence: number;
}

interface BusinessFlow {
  test_name: string;
  intent: string;
  business_impact: "critical" | "high" | "medium" | "low";
  type: string;
  user_journey: string;
}

interface PageObject {
  filename: string;
  class_name: string;
  content: string;
}

interface Issue {
  severity: "error" | "warning" | "info";
  message: string;
}

interface MigrationResult {
  source_analysis: SourceAnalysis;
  ir: { pages: any[]; tests: any[] };
  business_flows: { business_flows: BusinessFlow[]; coverage_gaps: string[]; migration_notes: string[] };
  page_objects: { base_page: string; page_objects: PageObject[] };
  spec_ts: string;
  confidence_score: number;
  issues: Issue[];
  migration_summary: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const IMPACT_COLOR: Record<string, string> = {
  critical: "#ef4444", high: "#f97316", medium: "#f59e0b", low: "#22c55e",
};

const SEV_COLOR: Record<string, string> = {
  error: "#ef4444", warning: "#f59e0b", info: "#3b82f6",
};

const SEV_BG: Record<string, string> = {
  error: "rgba(239,68,68,0.08)", warning: "rgba(245,158,11,0.08)", info: "rgba(59,130,246,0.08)",
};

const COMPLEXITY_COLOR: Record<string, string> = {
  low: "#22c55e", medium: "#f59e0b", high: "#ef4444",
};

function copy(text: string) {
  navigator.clipboard.writeText(text).catch(() => {});
}

function download(content: string, filename: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([content], { type: "text/plain" }));
  a.download = filename;
  a.click();
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function ConfidenceDial({ score }: { score: number }) {
  const color = score >= 80 ? "#22c55e" : score >= 60 ? "#f59e0b" : "#ef4444";
  const label = score >= 80 ? "High" : score >= 60 ? "Medium" : "Low";
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
      <div style={{
        width: 64, height: 64, borderRadius: "50%",
        background: `conic-gradient(${color} ${score * 3.6}deg, rgba(255,255,255,0.06) 0deg)`,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <div style={{
          width: 50, height: 50, borderRadius: "50%",
          background: "var(--surface-1)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 15, fontWeight: 800, color, fontVariantNumeric: "tabular-nums",
        }}>{score}</div>
      </div>
      <span style={{ fontSize: 10, fontWeight: 700, color, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</span>
    </div>
  );
}

function SourceAnalysisCard({ sa }: { sa: SourceAnalysis }) {
  return (
    <div style={{
      padding: 16, borderRadius: 12,
      background: "rgba(124,58,237,0.06)", border: "1px solid rgba(124,58,237,0.2)",
    }}>
      <p style={{ fontSize: 11, fontWeight: 700, color: "#a78bfa", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 12px" }}>
        Source Analysis
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {[
          ["Language",   sa.language    || "—"],
          ["Framework",  sa.framework   || "—"],
          ["Build Tool", sa.build_tool  || "—"],
          ["Tests",      String(sa.test_count ?? 0)],
        ].map(([k, v]) => (
          <div key={k}>
            <p style={{ fontSize: 10, color: "var(--text-3)", margin: "0 0 2px", fontWeight: 600 }}>{k}</p>
            <p style={{ fontSize: 13, color: "var(--text-1)", margin: 0, fontWeight: 700 }}>{v}</p>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 6 }}>
        {sa.patterns?.map(p => (
          <span key={p} style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20, background: "rgba(124,58,237,0.15)", color: "#a78bfa", border: "1px solid rgba(124,58,237,0.3)" }}>{p}</span>
        ))}
        <span style={{
          fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20,
          background: `${COMPLEXITY_COLOR[sa.complexity] ?? "#f59e0b"}18`,
          color: COMPLEXITY_COLOR[sa.complexity] ?? "#f59e0b",
          border: `1px solid ${COMPLEXITY_COLOR[sa.complexity] ?? "#f59e0b"}33`,
        }}>
          {sa.complexity} complexity
        </span>
      </div>

      {sa.challenges?.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <p style={{ fontSize: 10, fontWeight: 700, color: "#f59e0b", margin: "0 0 6px" }}>Migration Challenges</p>
          {sa.challenges.map((c, i) => (
            <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 6, marginBottom: 4 }}>
              <AlertTriangle size={11} color="#f59e0b" style={{ flexShrink: 0, marginTop: 1 }} />
              <span style={{ fontSize: 11, color: "var(--text-2)", lineHeight: 1.5 }}>{c}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function BusinessFlowCard({ flow }: { flow: BusinessFlow }) {
  const [open, setOpen] = useState(false);
  const color = IMPACT_COLOR[flow.business_impact] ?? "#f59e0b";
  return (
    <div style={{ borderRadius: 10, border: "1px solid var(--border)", overflow: "hidden" }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: "100%", display: "flex", alignItems: "center", gap: 10,
          padding: "10px 14px", background: "var(--surface-1)",
          border: "none", cursor: "pointer", textAlign: "left",
        }}
      >
        <div style={{ width: 6, height: 6, borderRadius: "50%", background: color, flexShrink: 0 }} />
        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-1)", flex: 1 }}>{flow.test_name}</span>
        <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 20, background: `${color}18`, color }}>{flow.business_impact}</span>
        <span style={{ fontSize: 10, color: "var(--text-3)", marginLeft: 4 }}>{flow.type}</span>
        {open ? <ChevronDown size={13} color="var(--text-3)" /> : <ChevronRight size={13} color="var(--text-3)" />}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            style={{ overflow: "hidden" }}
          >
            <div style={{ padding: "10px 14px 12px", borderTop: "1px solid var(--border)", background: "var(--surface-2)" }}>
              <p style={{ fontSize: 11, color: "var(--text-2)", margin: "0 0 6px", lineHeight: 1.6 }}>{flow.intent}</p>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Zap size={10} color="var(--text-3)" />
                <span style={{ fontSize: 10, color: "var(--text-3)" }}>{flow.user_journey}</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function CodePanel({ label, content, filename }: { label: string; content: string; filename: string }) {
  if (!content) return (
    <div style={{ padding: 24, textAlign: "center", color: "var(--text-3)", fontSize: 12 }}>
      No content generated for this file.
    </div>
  );
  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", background: "rgba(124,58,237,0.08)", borderBottom: "1px solid var(--border)" }}>
        <FileCode size={13} color="#a78bfa" />
        <span style={{ fontSize: 11, fontWeight: 700, color: "#a78bfa", flex: 1 }}>{label}</span>
        <button onClick={() => copy(content)} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: "var(--text-3)", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 5, padding: "3px 8px", cursor: "pointer" }}>
          <Copy size={10} /> Copy
        </button>
        <button onClick={() => download(content, filename)} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: "#a78bfa", background: "rgba(124,58,237,0.12)", border: "1px solid rgba(124,58,237,0.3)", borderRadius: 5, padding: "3px 8px", cursor: "pointer" }}>
          <Download size={10} /> .ts
        </button>
      </div>
      <pre style={{ margin: 0, padding: "16px 18px", fontSize: 12, lineHeight: 1.65, color: "#e6edf3", background: "#0d1117", overflowX: "auto", maxHeight: 420, whiteSpace: "pre" }}>
        {content}
      </pre>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

type Tab = "spec" | "base_page" | `page_${number}` | "flows" | "report";

export default function MigrationResultViewer({ result }: { result: MigrationResult }) {
  const [tab, setTab] = useState<Tab>("spec");

  const sa   = result.source_analysis ?? {};
  const pom  = result.page_objects ?? { base_page: "", page_objects: [] };
  const biz  = result.business_flows ?? { business_flows: [], coverage_gaps: [], migration_notes: [] };
  const issues = result.issues ?? [];
  const pageObjects: PageObject[] = pom.page_objects ?? [];

  const tabs: { id: Tab; label: string; icon: any }[] = [
    { id: "spec",      label: "spec.ts",        icon: Code2 },
    { id: "base_page", label: "BasePage.ts",    icon: Layers },
    ...pageObjects.map((p, i) => ({ id: `page_${i}` as Tab, label: p.filename, icon: FileCode })),
    { id: "flows",  label: "Business Flows", icon: GitBranch },
    { id: "report", label: "Report",         icon: Shield },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      style={{ display: "flex", flexDirection: "column", gap: 16 }}
    >
      {/* Header row: source analysis + confidence */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 16, alignItems: "start" }}>
        <SourceAnalysisCard sa={sa as SourceAnalysis} />
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: "16px 20px", borderRadius: 12, background: "var(--surface-1)", border: "1px solid var(--border)" }}>
          <p style={{ fontSize: 10, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.08em", margin: 0 }}>Confidence</p>
          <ConfidenceDial score={result.confidence_score ?? 0} />
          <div style={{ textAlign: "center" }}>
            <p style={{ fontSize: 11, color: "var(--text-3)", margin: 0 }}>{sa.test_count ?? 0} tests</p>
            <p style={{ fontSize: 11, color: "var(--text-3)", margin: 0 }}>{pageObjects.length + 1} POM files</p>
          </div>
        </div>
      </div>

      {/* Issues */}
      {issues.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {issues.map((iss, i) => (
            <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "8px 12px", borderRadius: 8, background: SEV_BG[iss.severity] ?? SEV_BG.info, border: `1px solid ${SEV_COLOR[iss.severity] ?? "#3b82f6"}33` }}>
              {iss.severity === "error"   && <AlertTriangle size={13} color="#ef4444" style={{ flexShrink: 0, marginTop: 1 }} />}
              {iss.severity === "warning" && <AlertTriangle size={13} color="#f59e0b" style={{ flexShrink: 0, marginTop: 1 }} />}
              {iss.severity === "info"    && <Info          size={13} color="#3b82f6" style={{ flexShrink: 0, marginTop: 1 }} />}
              <span style={{ fontSize: 11, color: "var(--text-2)", lineHeight: 1.5 }}>{iss.message}</span>
            </div>
          ))}
        </div>
      )}

      {/* Tab bar */}
      <div style={{ display: "flex", gap: 4, overflowX: "auto", paddingBottom: 2 }}>
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "6px 12px", borderRadius: 8, fontSize: 12, fontWeight: tab === id ? 700 : 500,
              cursor: "pointer", whiteSpace: "nowrap", border: "none",
              background: tab === id ? "rgba(124,58,237,0.2)" : "rgba(255,255,255,0.04)",
              color: tab === id ? "#a78bfa" : "var(--text-3)",
              outline: tab === id ? "1px solid rgba(124,58,237,0.3)" : "none",
            }}
          >
            <Icon size={12} />
            {label}
          </button>
        ))}
      </div>

      {/* Tab panels */}
      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.15 }}
        >
          {tab === "spec" && (
            <CodePanel label="spec.ts — Playwright TypeScript" content={result.spec_ts ?? ""} filename="migration.spec.ts" />
          )}

          {tab === "base_page" && (
            <CodePanel label="BasePage.ts" content={pom.base_page ?? ""} filename="BasePage.ts" />
          )}

          {tab.startsWith("page_") && (() => {
            const idx = parseInt(tab.replace("page_", ""), 10);
            const p = pageObjects[idx];
            return p ? <CodePanel label={p.filename} content={p.content} filename={p.filename} /> : null;
          })()}

          {tab === "flows" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {biz.business_flows?.length > 0 ? (
                biz.business_flows.map((f: BusinessFlow, i: number) => (
                  <BusinessFlowCard key={i} flow={f} />
                ))
              ) : (
                <p style={{ fontSize: 12, color: "var(--text-3)", padding: 16 }}>No business flows extracted.</p>
              )}
              {biz.coverage_gaps?.length > 0 && (
                <div style={{ marginTop: 8, padding: "12px 14px", borderRadius: 10, background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.2)" }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: "#ef4444", margin: "0 0 8px" }}>Coverage Gaps Identified</p>
                  {biz.coverage_gaps.map((g: string, i: number) => (
                    <div key={i} style={{ display: "flex", gap: 6, marginBottom: 4 }}>
                      <AlertTriangle size={11} color="#ef4444" style={{ flexShrink: 0, marginTop: 2 }} />
                      <span style={{ fontSize: 11, color: "var(--text-2)", lineHeight: 1.5 }}>{g}</span>
                    </div>
                  ))}
                </div>
              )}
              {biz.migration_notes?.length > 0 && (
                <div style={{ padding: "12px 14px", borderRadius: 10, background: "rgba(59,130,246,0.06)", border: "1px solid rgba(59,130,246,0.2)" }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: "#3b82f6", margin: "0 0 8px" }}>Migration Notes</p>
                  {biz.migration_notes.map((n: string, i: number) => (
                    <div key={i} style={{ display: "flex", gap: 6, marginBottom: 4 }}>
                      <Info size={11} color="#3b82f6" style={{ flexShrink: 0, marginTop: 2 }} />
                      <span style={{ fontSize: 11, color: "var(--text-2)", lineHeight: 1.5 }}>{n}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === "report" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ padding: 16, borderRadius: 12, background: "var(--surface-1)", border: "1px solid var(--border)" }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 10px" }}>Migration Summary</p>
                <p style={{ fontSize: 13, color: "var(--text-1)", lineHeight: 1.7, margin: 0 }}>{result.migration_summary}</p>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
                {[
                  ["Tests Migrated",  String(sa.test_count ?? 0),        "#22c55e"],
                  ["POM Files",       String(pageObjects.length + 1),     "#7c3aed"],
                  ["Issues",          String(issues.length),              issues.length > 0 ? "#f59e0b" : "#22c55e"],
                ].map(([label, val, color]) => (
                  <div key={label} style={{ padding: "14px 16px", borderRadius: 10, background: "var(--surface-1)", border: "1px solid var(--border)", textAlign: "center" }}>
                    <p style={{ fontSize: 22, fontWeight: 800, color, margin: "0 0 4px", fontVariantNumeric: "tabular-nums" }}>{val}</p>
                    <p style={{ fontSize: 11, color: "var(--text-3)", margin: 0 }}>{label}</p>
                  </div>
                ))}
              </div>

              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={() => {
                    const all = [
                      `// ── BasePage.ts\n${pom.base_page ?? ""}`,
                      ...pageObjects.map(p => `\n// ── ${p.filename}\n${p.content}`),
                      `\n// ── spec.ts\n${result.spec_ts ?? ""}`,
                    ].join("\n");
                    download(all, "migration_output.ts");
                  }}
                  style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 16px", borderRadius: 8, fontSize: 12, fontWeight: 700, background: "linear-gradient(135deg, #7c3aed, #a78bfa)", color: "white", border: "none", cursor: "pointer" }}
                >
                  <Download size={13} /> Download All Files
                </button>
                <button
                  onClick={() => {
                    const report = `Migration Report\n${"=".repeat(40)}\n\nLanguage: ${sa.language}\nFramework: ${sa.framework}\nTests: ${sa.test_count}\nConfidence: ${result.confidence_score}%\n\nSummary:\n${result.migration_summary}\n\nIssues:\n${issues.map(i => `[${i.severity.toUpperCase()}] ${i.message}`).join("\n")}`;
                    download(report, "migration_report.txt");
                  }}
                  style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 16px", borderRadius: 8, fontSize: 12, fontWeight: 700, background: "rgba(255,255,255,0.06)", color: "var(--text-2)", border: "1px solid var(--border)", cursor: "pointer" }}
                >
                  <Shield size={13} /> Download Report
                </button>
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </motion.div>
  );
}
