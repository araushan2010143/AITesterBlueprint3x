"use client";
import { Component, useState, useCallback, useRef, useEffect, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useMutation, useQuery } from "@tanstack/react-query";
import { aiApi } from "@/lib/api";
import { AIAction } from "@/types";
import {
  TestTube, Copy, Target, Search, FileCheck, AlertCircle, Zap,
  Code, Database, ChevronRight, X, FileSpreadsheet, FileText,
  FileJson, CheckSquare, Square, Play, Download, Flame, GitBranch,
  CheckCircle, XCircle, AlertTriangle, ChevronDown, Activity,
  TrendingUp, Bug,
} from "lucide-react";
import { downloadCSV, downloadXLSX, downloadXLS, downloadDOCX, downloadJSON, downloadScript, downloadJIRA, downloadADO } from "@/lib/export";

// ── Constants ─────────────────────────────────────────────────────────────────

const ICON_MAP: Record<string, any> = { TestTube, Copy, Target, Search, FileCheck, AlertCircle, Zap, Code, Database, Flame, GitBranch };

type Complexity = "low" | "med" | "high";
const ACTION_META: Record<string, { category: string; complexity: Complexity; time: string; accent: string }> = {
  generate_test_cases: { category: "Test Design",   complexity: "med",  time: "~10s", accent: "#7c3aed" },
  find_duplicates:     { category: "Analysis",      complexity: "low",  time: "~5s",  accent: "#10b981" },
  coverage_analysis:   { category: "Analysis",      complexity: "med",  time: "~8s",  accent: "#3b82f6" },
  rca:                 { category: "Reporting",     complexity: "med",  time: "~8s",  accent: "#f59e0b" },
  release_summary:     { category: "Reporting",     complexity: "low",  time: "~6s",  accent: "#06b6d4" },
  explain_failure:     { category: "Analysis",      complexity: "low",  time: "~5s",  accent: "#ef4444" },
  automate:            { category: "Automation",    complexity: "med",  time: "~10s", accent: "#8b5cf6" },
  generate_script:     { category: "Automation",    complexity: "high", time: "~20s", accent: "#a855f7" },
  test_data:           { category: "Test Design",   complexity: "med",  time: "~8s",  accent: "#22c55e" },
  flaky_analyzer:      { category: "Analysis",      complexity: "high", time: "~25s", accent: "#f97316" },
  automation_pipeline: { category: "Automation",    complexity: "high", time: "~30s", accent: "#ec4899" },
};

const COMPLEXITY_COLORS: Record<Complexity, string> = { low: "#22c55e", med: "#f59e0b", high: "#ef4444" };

const FRAMEWORKS = [
  // ── E2E ──────────────────────────────────────────────────────────────────
  { id: "Playwright TypeScript",      label: "Playwright",    lang: "TypeScript",    ext: "spec.ts",     color: "#45ba4b", group: "E2E" },
  { id: "Playwright JavaScript",      label: "Playwright",    lang: "JavaScript",    ext: "spec.js",     color: "#45ba4b", group: "E2E" },
  { id: "Cypress JavaScript",         label: "Cypress",       lang: "JavaScript",    ext: "cy.js",       color: "#04c38e", group: "E2E" },
  { id: "Cypress TypeScript",         label: "Cypress",       lang: "TypeScript",    ext: "cy.ts",       color: "#04c38e", group: "E2E" },
  { id: "WebdriverIO TypeScript",     label: "WebdriverIO",   lang: "TypeScript",    ext: "test.ts",     color: "#ea5906", group: "E2E" },
  { id: "Selenium Java",              label: "Selenium",      lang: "Java",          ext: "Test.java",   color: "#b07219", group: "E2E" },
  { id: "Selenium Python",            label: "Selenium",      lang: "Python",        ext: "test.py",     color: "#3572a5", group: "E2E" },
  { id: "Selenium C#",                label: "Selenium",      lang: "C#",            ext: "Tests.cs",    color: "#9b59b6", group: "E2E" },
  // ── BDD ──────────────────────────────────────────────────────────────────
  { id: "Playwright Python Behave",   label: "Playwright",    lang: "Python · Behave",    ext: "_steps.py",   color: "#f59e0b", group: "BDD" },
  { id: "Playwright TS Cucumber",     label: "Playwright",    lang: "TS · Cucumber",      ext: "steps.ts",    color: "#22d3ee", group: "BDD" },
  { id: "WebdriverIO Cucumber Java",  label: "WebdriverIO",   lang: "Java · Cucumber",    ext: "Steps.java",  color: "#ea5906", group: "BDD" },
  { id: "Cypress Cucumber",           label: "Cypress",       lang: "JS · Cucumber",      ext: ".cy.js",      color: "#04c38e", group: "BDD" },
  // ── API ──────────────────────────────────────────────────────────────────
  { id: "REST Assured Java",          label: "REST Assured",  lang: "Java",          ext: "Test.java",   color: "#b07219", group: "API" },
  { id: "Axios Jest TypeScript",      label: "Axios + Jest",  lang: "TypeScript",    ext: "api.test.ts", color: "#99425b", group: "API" },
  { id: "Supertest JavaScript",       label: "Supertest",     lang: "JavaScript",    ext: "api.test.js", color: "#f7df1e", group: "API" },
  { id: "Pytest Requests Python",     label: "Pytest",        lang: "Python",        ext: "api_test.py", color: "#3572a5", group: "API" },
  { id: "Postman Collection",         label: "Postman",       lang: "JSON",          ext: "postman_collection.json", color: "#ff6c37", group: "API" },
];

const CONTENT_LABEL: Record<string, string> = {
  generate_test_cases: "Requirement / Feature description",
  find_duplicates:     "Paste test cases (text or JSON)",
  coverage_analysis:   "Paste requirements + existing test cases",
  rca:                 "Paste test execution report",
  release_summary:     "Paste sprint / release execution data",
  explain_failure:     "Paste failure log or stack trace",
  automate:            "Paste manual test cases to evaluate",
  generate_script:     "Paste the test case(s) to automate",
  test_data:           "Describe the feature / fields you need data for",
  flaky_analyzer:      "Paste test execution results from multiple runs (JSON, CSV, or plain text log)",
  automation_pipeline: "Paste test case from JIRA, ADO, Xray, Zephyr, or plain text (title + steps + expected result)",
};

// ── Shared download-file button ───────────────────────────────────────────────

function DlBtn({ label, icon, onClick, accent = false }: { label: string; icon: React.ReactNode; onClick: () => void; accent?: boolean }) {
  return (
    <button onClick={onClick} style={{
      display: "flex", alignItems: "center", gap: 5,
      padding: "6px 12px", borderRadius: 7, fontSize: 11, fontWeight: 600,
      cursor: "pointer", border: "1px solid",
      background: accent ? "rgba(124,58,237,0.15)" : "var(--surface-2)",
      borderColor: accent ? "rgba(124,58,237,0.4)" : "var(--border)",
      color: accent ? "var(--accent-light)" : "var(--text-2)",
    }}>
      {icon}{label}
    </button>
  );
}

// ── Export bar (non-script actions) ──────────────────────────────────────────

function ExportBar({ actionId, result }: { actionId: string; result: any }) {
  const isTestData = (actionId === "test_data" || actionId === "generate_test_cases") && Array.isArray(result?.test_cases) && result.test_cases.length > 0;
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
      padding: "10px 14px", background: "var(--surface-1)",
      border: "1px solid var(--border)", borderRadius: 10, marginBottom: 12,
    }}>
      <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.08em", marginRight: 4 }}>
        Export as
      </span>
      <DlBtn label="CSV"  icon={<FileText size={12} />}        onClick={() => downloadCSV(actionId, result)} />
      <DlBtn label="XLSX" icon={<FileSpreadsheet size={12} />} onClick={() => downloadXLSX(actionId, result)} accent />
      <DlBtn label="XLS"  icon={<FileSpreadsheet size={12} />} onClick={() => downloadXLS(actionId, result)} />
      <DlBtn label="DOCX" icon={<FileText size={12} />}        onClick={() => downloadDOCX(actionId, result)} />
      <DlBtn label="JSON" icon={<FileJson size={12} />}        onClick={() => downloadJSON(actionId, result)} />

      {isTestData && (
        <>
          <span style={{ width: 1, height: 20, background: "var(--border)", margin: "0 4px" }} />
          <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
            Import to
          </span>
          <DlBtn
            label="JIRA (Zephyr)"
            icon={
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                <path d="M11.75 2L2 12.25l4.5 4.5L11.75 11.5l5.25 5.25L21.5 12.25 11.75 2z" fill="#0052CC"/>
                <path d="M11.75 12.5l-5.25 5.25 4.5 4.5 9.75-9.75-4.5-4.5-4.5 4.5z" fill="#2684FF"/>
              </svg>
            }
            onClick={() => downloadJIRA(result)}
            accent
          />
          <DlBtn
            label="Azure DevOps"
            icon={
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                <path d="M0 5.88L3.84 0l9.12 4.56V21.6L3.84 24 0 18.48V5.88z" fill="#0078D4"/>
                <path d="M3.84 0L24 6v12l-11.04 2.4V4.56L3.84 0z" fill="#0078D4" opacity="0.7"/>
              </svg>
            }
            onClick={() => downloadADO(result)}
            accent
          />
        </>
      )}
    </div>
  );
}

// ── Multi-framework script generator ─────────────────────────────────────────

type ScriptResult = { status: "idle" | "loading" | "done" | "error"; data?: any; error?: string };

function StatusDot({ status }: { status: ScriptResult["status"] }) {
  if (status === "loading") return (
    <div style={{
      width: 14, height: 14, borderRadius: "50%", border: "2px solid var(--accent)",
      borderTopColor: "transparent", animation: "spin 0.8s linear infinite", flexShrink: 0,
    }} />
  );
  if (status === "done")    return <span style={{ fontSize: 13, lineHeight: 1 }}>✅</span>;
  if (status === "error")   return <span style={{ fontSize: 13, lineHeight: 1 }}>❌</span>;
  return <span style={{ width: 14, height: 14, borderRadius: "50%", background: "var(--border)", display: "inline-block", flexShrink: 0 }} />;
}

function MultiScriptGenerator({ content }: { content: string }) {
  const [selected, setSelected] = useState<Set<string>>(new Set(["Playwright TypeScript"]));
  const [results, setResults] = useState<Record<string, ScriptResult>>({});
  const [activefw, setActivefw] = useState<string>("");
  const [running, setRunning] = useState(false);

  const toggle = (id: string) => setSelected(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
  const selectAll   = () => setSelected(new Set(FRAMEWORKS.map(f => f.id)));
  const selectGroup = (g: string) => setSelected(prev => {
    const next = new Set(prev);
    FRAMEWORKS.filter(f => f.group === g).forEach(f => next.add(f.id));
    return next;
  });
  const clearAll = () => setSelected(new Set());

  const runAll = useCallback(async () => {
    if (!content.trim() || selected.size === 0) return;
    setRunning(true);

    const ordered = FRAMEWORKS.filter(f => selected.has(f.id)).map(f => f.id);
    const init: Record<string, ScriptResult> = {};
    ordered.forEach(id => { init[id] = { status: "loading" }; });
    setResults(init);
    setActivefw(ordered[0]);

    // Process in batches of 3 to avoid Groq rate limits
    const CONCURRENCY = 3;
    for (let i = 0; i < ordered.length; i += CONCURRENCY) {
      const batch = ordered.slice(i, i + CONCURRENCY);
      await Promise.allSettled(
        batch.map(async (fw) => {
          try {
            const res = await aiApi.run("generate_script", content, { framework: fw });
            setResults(prev => ({ ...prev, [fw]: { status: "done", data: res } }));
          } catch (e: any) {
            const msg = (e?.response?.data?.detail ?? e?.message ?? "Failed");
            setResults(prev => ({ ...prev, [fw]: { status: "error", error: msg } }));
          }
        })
      );
      // Small gap between batches so the backend retry timers don't stack
      if (i + CONCURRENCY < ordered.length) await new Promise(r => setTimeout(r, 1000));
    }
    setRunning(false);
  }, [content, selected]);

  const doneCount = Object.values(results).filter(r => r.status === "done").length;
  const totalCount = Object.keys(results).length;
  const groups = ["E2E", "BDD", "API"];
  const hasBDD = [...selected].some(id => FRAMEWORKS.find(f => f.id === id)?.group === "BDD");
  const hasResults = totalCount > 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {/* ── Framework picker ── */}
      <div className="card" style={{ padding: 14 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-2)" }}>
            Select Frameworks
            {selected.size > 0 && (
              <span style={{ marginLeft: 8, fontSize: 10, background: "rgba(124,58,237,0.2)", color: "var(--accent-light)", padding: "2px 7px", borderRadius: 10, fontWeight: 700 }}>
                {selected.size} selected
              </span>
            )}
          </span>
          <div style={{ display: "flex", gap: 5 }}>
            {groups.map(g => (
              <button key={g} onClick={() => selectGroup(g)} style={{
                fontSize: 10, padding: "3px 8px", borderRadius: 6, border: "1px solid var(--border)",
                background: "var(--surface-2)", color: "var(--text-3)", cursor: "pointer", fontWeight: 600,
              }}>{g}</button>
            ))}
            <button onClick={selectAll} style={{
              fontSize: 10, padding: "3px 8px", borderRadius: 6, border: "1px solid var(--accent)",
              background: "rgba(124,58,237,0.12)", color: "var(--accent-light)", cursor: "pointer", fontWeight: 700,
            }}>All</button>
            <button onClick={clearAll} style={{
              fontSize: 10, padding: "3px 8px", borderRadius: 6, border: "1px solid var(--border)",
              background: "var(--surface-2)", color: "var(--text-3)", cursor: "pointer",
            }}>Clear</button>
          </div>
        </div>

        {groups.map(g => (
          <div key={g} style={{ marginBottom: 10 }}>
            <p style={{ fontSize: 9, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>{g} Testing</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {FRAMEWORKS.filter(f => f.group === g).map(fw => {
                const on = selected.has(fw.id);
                return (
                  <button key={fw.id} onClick={() => toggle(fw.id)} style={{
                    display: "flex", alignItems: "center", gap: 5, padding: "5px 10px",
                    borderRadius: 7, border: `1px solid ${on ? fw.color + "70" : "var(--border)"}`,
                    background: on ? fw.color + "18" : "var(--surface-2)",
                    cursor: "pointer", transition: "all 0.12s",
                  }}>
                    {on ? <CheckSquare size={11} color={fw.color} /> : <Square size={11} color="var(--text-3)" />}
                    <span style={{ fontSize: 11, fontWeight: 600, color: on ? fw.color : "var(--text-2)" }}>{fw.label}</span>
                    <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 4, background: fw.color + "22", color: fw.color, fontWeight: 700 }}>{fw.lang}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* ── Generate button ── */}
      <button onClick={runAll} disabled={running || selected.size === 0 || !content.trim()} style={{
        display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
        padding: "11px 24px", borderRadius: 10, fontSize: 14, fontWeight: 700,
        background: "linear-gradient(135deg, #7c3aed, #a78bfa)",
        color: "white", border: "none",
        cursor: running || selected.size === 0 ? "not-allowed" : "pointer",
        opacity: running || selected.size === 0 ? 0.55 : 1,
      }}>
        <Play size={15} />
        {running
          ? `Generating… ${doneCount} / ${totalCount} done`
          : `Generate ${selected.size} Script${selected.size !== 1 ? "s" : ""}`}
      </button>

      {/* ── BDD tip banner ── */}
      {hasBDD && (
        <div style={{
          display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 14px", borderRadius: 8,
          background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)",
        }}>
          <span style={{ fontSize: 14, lineHeight: 1, flexShrink: 0, marginTop: 1 }}>💡</span>
          <p style={{ fontSize: 11, color: "#f59e0b", margin: 0, lineHeight: 1.6 }}>
            <strong>BDD frameworks</strong> generate a bundled script showing all layers (Steps · Page Object · Locators · Assertions) in one file.
            For the full <strong>6-file enterprise structure</strong> (separate files per layer + Base Page), use the <strong>Automation Pipeline</strong> action with <em>🐍 Python + Behave</em> or <em>⚡ TS + Cucumber</em> selected.
          </p>
        </div>
      )}

      {/* ── Results: vertical sidebar + code panel ── */}
      {hasResults && (
        <div style={{
          display: "grid", gridTemplateColumns: "200px 1fr",
          border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden",
          minHeight: 420,
        }}>

          {/* LEFT: framework list — always fully visible, no scroll needed */}
          <div style={{
            background: "var(--surface-2)", borderRight: "1px solid var(--border)",
            display: "flex", flexDirection: "column",
          }}>
            <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--border)" }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                Scripts ({doneCount}/{totalCount})
              </span>
            </div>
            {/* Progress bar */}
            {running && (
              <div style={{ height: 3, background: "var(--border)", margin: "0 0 0 0" }}>
                <div style={{
                  height: "100%", background: "linear-gradient(90deg,#7c3aed,#a78bfa)",
                  width: `${totalCount > 0 ? (doneCount / totalCount) * 100 : 0}%`,
                  transition: "width 0.4s ease",
                }} />
              </div>
            )}
            <div style={{ flex: 1, overflowY: "auto" }}>
              {FRAMEWORKS.filter(f => results[f.id]).map(fw => {
                const r = results[fw.id];
                const isActive = activefw === fw.id;
                return (
                  <button key={fw.id} onClick={() => setActivefw(fw.id)} style={{
                    display: "flex", alignItems: "center", gap: 8,
                    width: "100%", padding: "10px 12px", border: "none",
                    borderLeft: isActive ? `3px solid ${fw.color}` : "3px solid transparent",
                    background: isActive ? fw.color + "12" : "transparent",
                    cursor: "pointer", textAlign: "left", transition: "all 0.12s",
                  }}>
                    <StatusDot status={r.status} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 11, fontWeight: isActive ? 700 : 500, color: isActive ? fw.color : "var(--text-2)", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {fw.label}
                      </p>
                      <p style={{ fontSize: 9, color: fw.color, fontWeight: 600, margin: 0 }}>{fw.lang} · {fw.group}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* RIGHT: code viewer */}
          <div style={{ background: "#0d1117", display: "flex", flexDirection: "column", minWidth: 0 }}>
            {!activefw || !results[activefw] ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flex: 1, color: "var(--text-3)", fontSize: 13 }}>
                Select a framework from the list
              </div>
            ) : results[activefw].status === "loading" ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flex: 1, gap: 12, color: "var(--text-3)" }}>
                <div style={{ width: 20, height: 20, border: "2px solid var(--accent)", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                <span style={{ fontSize: 13 }}>Generating {activefw}…</span>
              </div>
            ) : results[activefw].status === "error" ? (
              <div style={{ padding: 20, color: "#ef4444", fontSize: 12 }}>{results[activefw].error}</div>
            ) : (() => {
              const fw   = FRAMEWORKS.find(f => f.id === activefw)!;
              const data = results[activefw].data!;
              const script = data.result?.script ?? JSON.stringify(data.result, null, 2);
              const fname  = data.result?.filename ?? `test.${fw.ext}`;
              return (
                <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
                  {/* code toolbar */}
                  <div style={{
                    display: "flex", alignItems: "center", gap: 8, padding: "8px 14px",
                    background: fw.color + "18", borderBottom: `1px solid ${fw.color}30`, flexShrink: 0,
                  }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: fw.color, flex: 1 }}>{fname}</span>
                    {data.result?.provider && (
                      <span style={{ fontSize: 9, color: "var(--accent-light)", background: "rgba(124,58,237,0.15)", padding: "2px 6px", borderRadius: 4, fontWeight: 700 }}>
                        {data.result.provider}
                      </span>
                    )}
                    <span style={{ fontSize: 10, color: "var(--text-3)" }}>{data.tokens_used}t · {data.latency_ms?.toFixed(0)}ms</span>
                    <button onClick={() => navigator.clipboard.writeText(script)} style={{
                      display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: "var(--text-3)",
                      background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: 5, padding: "3px 8px", cursor: "pointer",
                    }}>
                      <Copy size={10} /> Copy
                    </button>
                    <DlBtn
                      label={`.${fw.ext}`}
                      icon={<Download size={10} />}
                      onClick={() => downloadScript({ ...data.result, filename: fname })}
                      accent
                    />
                  </div>
                  {/* code */}
                  <pre style={{
                    flex: 1, margin: 0, padding: "16px 18px",
                    fontSize: 12, lineHeight: 1.65, color: "#e6edf3",
                    overflowX: "auto", overflowY: "auto", whiteSpace: "pre",
                  }}>
                    {script}
                  </pre>
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Automation Pipeline UI ────────────────────────────────────────────────────

type PipelineTab = "bdd" | "feature" | "steps" | "pom" | "base_page" | "locators" | "assertions" | "validation";

function getPipelineTabs(fw: string): { id: PipelineTab; label: string; color: string; ext: string }[] {
  const py = fw === "py_behave";
  return [
    { id: "bdd",        label: "BDD Analysis",    color: "#f59e0b", ext: ""                      },
    { id: "feature",    label: "Feature File",     color: "#22c55e", ext: ".feature"               },
    { id: "steps",      label: "Step Definitions", color: "#a78bfa", ext: py ? "_steps.py" : ".steps.ts" },
    { id: "pom",        label: "Page Object",      color: "#38bdf8", ext: py ? "_page.py"  : ".ts" },
    ...(py ? [{ id: "base_page"  as PipelineTab, label: "Base Page",  color: "#06b6d4", ext: ".py" }] : []),
    { id: "locators",   label: "Locators",         color: "#fb923c", ext: py ? "_locators.py" : ".ts" },
    ...(py ? [{ id: "assertions" as PipelineTab, label: "Assertions", color: "#ec4899", ext: ".py" }] : []),
    { id: "validation", label: "Validation",       color: "#f43f5e", ext: ""                      },
  ];
}

const FRAMEWORK_OPTIONS = [
  { id: "ts_cucumber", label: "TS + Cucumber", desc: "TypeScript · Playwright · POM", color: "#60a5fa", badge: "TS" },
  { id: "py_behave",   label: "Python + Behave", desc: "Python · Playwright · POM + Assertions", color: "#f59e0b", badge: "PY" },
];

const QUALITY_LEVELS = [
  { id: "L1", label: "L1 Skeleton",   desc: "Empty shells + TODOs",                color: "#71717a" },
  { id: "L2", label: "L2 Functional", desc: "Working Playwright code + assertions", color: "#a78bfa" },
  { id: "L3", label: "L3 Enterprise", desc: "Logger, WaitHelper, retry, API hooks", color: "#f59e0b" },
];

function _triggerFileDownload(content: string, filename: string) {
  const a = document.createElement("a");
  a.href = "data:text/plain;charset=utf-8," + encodeURIComponent(content);
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => document.body.removeChild(a), 100);
}

// ── Report file upload zone (Phase 2) ────────────────────────────────────────

type LoadedBuild = { name: string; format: string; label: string };

function ReportUploadZone({
  onAppend,
  onClear,
}: {
  onAppend: (text: string) => void;
  onClear: () => void;
}) {
  const [dragging,  setDragging]  = useState(false);
  const [loading,   setLoading]   = useState(false);
  const [loadingN,  setLoadingN]  = useState(0);  // files currently being parsed
  const [builds,    setBuilds]    = useState<LoadedBuild[]>([]);
  const [error,     setError]     = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const nextBuild = useRef(1);

  const uploadOne = async (file: File): Promise<void> => {
    const label = `Build-${nextBuild.current++}`;
    const fd = new FormData();
    fd.append("file", file);
    fd.append("build_label", label);
    const res = await fetch("/api/ai/parse-report", { method: "POST", body: fd });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail ?? `HTTP ${res.status}`);
    }
    const data = await res.json();
    setBuilds(prev => [...prev, { name: file.name, format: data.format, label }]);
    onAppend(data.text);
  };

  const uploadFiles = async (files: File[]) => {
    if (!files.length) return;
    setLoading(true); setError(null); setLoadingN(files.length);
    try {
      for (const file of files) {
        await uploadOne(file);
        setLoadingN(n => n - 1);
      }
    } catch (e: any) {
      setError(e.message ?? "Upload failed");
    } finally {
      setLoading(false); setLoadingN(0);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    uploadFiles(Array.from(e.dataTransfer.files));
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    setBuilds([]); setError(null);
    nextBuild.current = 1;
    onClear();
  };

  const hasBuilds = builds.length > 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => !loading && inputRef.current?.click()}
        style={{
          border: `2px dashed ${dragging ? "#a78bfa" : hasBuilds ? "#22c55e55" : "var(--border)"}`,
          borderRadius: 10, padding: "12px 16px",
          background: dragging ? "rgba(124,58,237,0.06)" : hasBuilds ? "rgba(34,197,94,0.04)" : "var(--surface-1)",
          cursor: loading ? "wait" : "pointer",
          display: "flex", alignItems: "center", gap: 12,
          transition: "all 0.15s",
        }}
      >
        <input
          ref={inputRef} type="file" multiple
          accept=".xml,.json,.txt,.log"
          style={{ display: "none" }}
          onChange={e => { const fs = Array.from(e.target.files ?? []); if (fs.length) uploadFiles(fs); e.target.value = ""; }}
        />
        {loading ? (
          <div style={{ width: 18, height: 18, border: "2px solid var(--accent)", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite", flexShrink: 0 }} />
        ) : (
          <Download size={16} color={hasBuilds ? "#22c55e" : "var(--text-3)"} style={{ flexShrink: 0 }} />
        )}

        <div style={{ flex: 1, minWidth: 0 }}>
          {loading ? (
            <span style={{ fontSize: 12, color: "var(--text-3)" }}>
              Parsing {loadingN > 0 ? `${loadingN} file${loadingN > 1 ? "s" : ""}` : ""}…
            </span>
          ) : hasBuilds ? (
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              {builds.map((b, i) => (
                <span key={i} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, padding: "2px 7px", borderRadius: 5, background: "#22c55e18", border: "1px solid #22c55e44", color: "#22c55e", fontWeight: 600 }}>
                  <span style={{ fontSize: 9, fontWeight: 800, opacity: 0.7 }}>{b.label}</span>
                  {b.name}
                  <span style={{ fontSize: 9, opacity: 0.6 }}>· {b.format}</span>
                </span>
              ))}
              <span style={{ fontSize: 11, color: "var(--text-3)" }}>+ drop more builds</span>
            </div>
          ) : (
            <span style={{ fontSize: 12, color: "var(--text-3)" }}>
              Drop build reports here (JUnit XML, Playwright JSON) — select multiple for multi-build comparison
            </span>
          )}
          {error && <p style={{ fontSize: 11, color: "#ef4444", margin: "4px 0 0" }}>{error}</p>}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          {hasBuilds ? (
            <button
              onClick={handleClear}
              style={{ fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 5, cursor: "pointer",
                background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", color: "#ef4444" }}
            >
              Clear all
            </button>
          ) : (
            <div style={{ display: "flex", gap: 4 }}>
              {[".xml", ".json", ".txt"].map(ext => (
                <span key={ext} style={{ fontSize: 9, padding: "2px 5px", borderRadius: 3, background: "var(--surface-2)", color: "var(--text-3)", border: "1px solid var(--border)", fontFamily: "ui-monospace,'SF Mono',monospace" }}>{ext}</span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Error boundary — catches any React render error in child components ──────

interface EBProps { children: ReactNode; fallback?: ReactNode }
interface EBState { error: Error | null }
class ErrorBoundary extends Component<EBProps, EBState> {
  state: EBState = { error: null };
  static getDerivedStateFromError(e: Error): EBState { return { error: e }; }
  render() {
    if (this.state.error) {
      return this.props.fallback ?? (
        <div style={{ padding: 14, borderRadius: 8, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>
          <p style={{ fontSize: 12, color: "#ef4444", margin: "0 0 6px", fontWeight: 700 }}>
            Display error — result data has unexpected shape
          </p>
          <p style={{ fontSize: 11, color: "var(--text-2)", margin: 0 }}>{this.state.error.message}</p>
        </div>
      );
    }
    return this.props.children;
  }
}

// Safely convert any value to a renderable string (handles object returns from LLM)
function toStr(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (typeof v === "object") {
    return Object.entries(v as Record<string, unknown>)
      .filter(([, n]) => n !== 0 && n !== null && n !== undefined)
      .map(([k, n]) => `${n} ${k.replace(/_/g, " ")}`)
      .join(", ") || JSON.stringify(v);
  }
  return String(v);
}

// ── Enterprise Flaky / Test Intelligence Result Viewer ────────────────────────

const CAT_COLORS: Record<string, string> = {
  "Product Bug":    "#ef4444",
  "Automation Bug": "#f97316",
  "Timing Issue":   "#f59e0b",
  "Test Data":      "#8b5cf6",
  "Infrastructure": "#06b6d4",
  "Environment":    "#3b82f6",
  "Network":        "#14b8a6",
  "State Leakage":  "#ec4899",
  "Flaky":          "#eab308",
  "Unknown":        "#6b7280",
};

const ACTION_COLORS: Record<string, string> = {
  "Fix Now":    "#ef4444",
  "Quarantine": "#f59e0b",
  "Monitor":    "#3b82f6",
  "Stable":     "#22c55e",
};

function FlakyScoreBar({ score }: { score: number }) {
  const color = score >= 80 ? "#ef4444" : score >= 50 ? "#f59e0b" : score >= 20 ? "#3b82f6" : "#22c55e";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{ flex: 1, height: 4, background: "var(--border)", borderRadius: 2, overflow: "hidden" }}>
        <div style={{ width: `${score}%`, height: "100%", background: color, borderRadius: 2, transition: "width 0.4s ease" }} />
      </div>
      <span style={{ fontFamily: "ui-monospace,'SF Mono',monospace", fontSize: 11, fontWeight: 700, color, minWidth: 28, textAlign: "right" }}>
        {score}
      </span>
    </div>
  );
}

function ConfidenceBar({ value }: { value: number }) {
  const color = value >= 80 ? "#22c55e" : value >= 60 ? "#f59e0b" : "#6b7280";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
      <div style={{ width: 60, height: 3, background: "var(--border)", borderRadius: 2, overflow: "hidden" }}>
        <div style={{ width: `${value}%`, height: "100%", background: color, borderRadius: 2 }} />
      </div>
      <span style={{ fontFamily: "ui-monospace,'SF Mono',monospace", fontSize: 9, color, fontWeight: 700 }}>{value}%</span>
    </div>
  );
}

function FlakyResultViewer({ result }: { result: any }) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set([0]));

  const tests: any[]      = result?.tests ?? [];
  const summary: any      = result?.summary ?? {};
  const gate: any         = result?.release_gate ?? {};
  const aiReport: any     = result?.ai_report ?? {};

  const totalTests        = summary.total_tests ?? tests.length;
  const categories: Record<string, number> = summary.categories ?? {};
  const prodScore: number = summary.prod_readiness_score ?? 0;
  const mostCommon: string = summary.most_common_category ?? "";

  const sortedTests = [...tests].sort((a, b) => (b.flaky_score ?? 0) - (a.flaky_score ?? 0));

  const gateDecision: string = gate.decision ?? "Conditional";
  const gateColor = gateDecision === "Block" ? "#ef4444" : gateDecision === "Proceed" ? "#22c55e" : "#f59e0b";
  const GateIcon  = gateDecision === "Block" ? XCircle : gateDecision === "Proceed" ? CheckCircle : AlertTriangle;

  const prodColor = prodScore >= 80 ? "#22c55e" : prodScore >= 60 ? "#f59e0b" : "#ef4444";

  const toggle = (i: number) => setExpanded(prev => {
    const next = new Set(prev);
    next.has(i) ? next.delete(i) : next.add(i);
    return next;
  });

  const catEntries = Object.entries(categories).filter(([, v]) => (v as number) > 0);
  const totalCatCount = catEntries.reduce((s, [, v]) => s + (v as number), 0) || 1;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

      {/* ── Summary header ── */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10,
        padding: "14px 16px", borderRadius: 10,
        background: "var(--surface-1)", border: "1px solid var(--border)",
      }}>
        {[
          { label: "Tests Analyzed",   value: totalTests,              color: "var(--text-1)" },
          { label: "Builds Compared",  value: summary.builds_analyzed ?? "—", color: "var(--text-1)" },
          { label: "Most Common Issue", value: mostCommon || "—",      color: CAT_COLORS[mostCommon] ?? "var(--text-2)" },
          { label: "Prod Readiness",   value: `${prodScore}/100`,      color: prodColor },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ textAlign: "center" }}>
            <p style={{ fontSize: 18, fontWeight: 800, color, margin: "0 0 2px", fontFamily: "ui-monospace,'SF Mono',monospace" }}>{value}</p>
            <p style={{ fontSize: 10, color: "var(--text-3)", margin: 0, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</p>
          </div>
        ))}
      </div>

      {/* ── Release gate ── */}
      <div style={{
        display: "flex", alignItems: "center", gap: 12, padding: "12px 16px",
        borderRadius: 10, border: `1px solid ${gateColor}40`,
        background: `${gateColor}0d`,
      }}>
        <GateIcon size={18} color={gateColor} style={{ flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: 12, fontWeight: 800, color: gateColor, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Release Gate: {gateDecision}
          </span>
          <p style={{ fontSize: 12, color: "var(--text-2)", margin: "2px 0 0" }}>{gate.reason}</p>
        </div>
      </div>

      {/* ── Category distribution ── */}
      {catEntries.length > 0 && (
        <div style={{ padding: "12px 14px", borderRadius: 10, background: "var(--surface-1)", border: "1px solid var(--border)" }}>
          <p style={{ fontSize: 10, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 10px" }}>
            Failure Classification
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {catEntries.sort(([, a], [, b]) => (b as number) - (a as number)).map(([cat, count]) => {
              const pct = Math.round(((count as number) / totalCatCount) * 100);
              const col = CAT_COLORS[cat] ?? "#6b7280";
              return (
                <div key={cat} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 11, color: "var(--text-2)", width: 130, flexShrink: 0 }}>{cat}</span>
                  <div style={{ flex: 1, height: 6, background: "var(--border)", borderRadius: 3, overflow: "hidden" }}>
                    <div style={{ width: `${pct}%`, height: "100%", background: col, borderRadius: 3, transition: "width 0.5s ease" }} />
                  </div>
                  <span style={{ fontFamily: "ui-monospace,'SF Mono',monospace", fontSize: 10, color: col, fontWeight: 700, width: 20, textAlign: "right" }}>
                    {count as number}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Per-test intelligence cards ── */}
      {sortedTests.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <p style={{ fontSize: 10, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.08em", margin: 0 }}>
            Test Analysis ({sortedTests.length} tests · sorted by flaky score)
          </p>

          {sortedTests.map((t: any, i: number) => {
            const isOpen    = expanded.has(i);
            const catColor  = CAT_COLORS[t.failure_category] ?? "#6b7280";
            const actColor  = ACTION_COLORS[t.action] ?? "#6b7280";
            const fix       = t.suggested_fix ?? {};
            const hasFix    = fix.before || fix.after;
            const rootCauses: any[] = t.root_causes ?? [];

            return (
              <div key={i} style={{ border: `1px solid var(--border)`, borderRadius: 10, overflow: "hidden", background: "var(--surface-1)" }}>

                {/* Card header — always visible */}
                <button
                  onClick={() => toggle(i)}
                  style={{
                    display: "flex", alignItems: "center", gap: 10,
                    width: "100%", padding: "11px 14px",
                    background: "none", border: "none", cursor: "pointer", textAlign: "left",
                  }}
                >
                  {/* Category pill */}
                  <span style={{
                    fontSize: 9, fontWeight: 800, padding: "2px 7px", borderRadius: 4,
                    background: catColor + "22", color: catColor, flexShrink: 0,
                    textTransform: "uppercase", letterSpacing: "0.06em",
                  }}>
                    {t.failure_category ?? "Unknown"}
                  </span>

                  {/* Test name */}
                  <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-1)", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {t.name}
                  </span>

                  {/* Pass rate */}
                  <span style={{ fontSize: 10, color: "var(--text-3)", flexShrink: 0, marginRight: 4 }}>{t.pass_rate}</span>

                  {/* Action badge */}
                  <span style={{
                    fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 4,
                    background: actColor + "18", color: actColor, flexShrink: 0,
                    border: `1px solid ${actColor}44`,
                  }}>
                    {t.action ?? "Monitor"}
                  </span>

                  <ChevronDown size={13} color="var(--text-3)" style={{ flexShrink: 0, transform: isOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }} />
                </button>

                {/* Flaky score bar — always visible */}
                <div style={{ padding: "0 14px 10px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 10, color: "var(--text-3)", width: 76, flexShrink: 0 }}>Flaky Score</span>
                    <FlakyScoreBar score={t.flaky_score ?? 0} />
                    <span style={{ fontSize: 10, color: "var(--text-3)", flexShrink: 0, marginLeft: 4 }}>
                      Confidence <ConfidenceBar value={t.confidence ?? 0} />
                    </span>
                  </div>
                </div>

                {/* Expanded detail */}
                {isOpen && (
                  <div style={{ borderTop: "1px solid var(--border)", padding: "12px 14px", display: "flex", flexDirection: "column", gap: 12 }}>

                    {/* Run history pills */}
                    {t.run_history && t.run_history.length > 0 && (
                      <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 10, color: "var(--text-3)", marginRight: 4 }}>Run history:</span>
                        {(t.run_history as string[]).map((r: string, j: number) => (
                          <span key={j} style={{
                            fontSize: 9, fontWeight: 700, padding: "2px 5px", borderRadius: 3,
                            background: r === "PASS" ? "#22c55e18" : "#ef444418",
                            color: r === "PASS" ? "#22c55e" : "#ef4444",
                          }}>{r}</span>
                        ))}
                      </div>
                    )}

                    {/* RCA hypotheses */}
                    {rootCauses.length > 0 && (
                      <div>
                        <p style={{ fontSize: 10, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.07em", margin: "0 0 6px" }}>
                          Root Cause Analysis
                        </p>
                        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                          {rootCauses.map((rc: any, j: number) => {
                            const rcColor = CAT_COLORS[rc.cause] ?? "#6b7280";
                            return (
                              <div key={j} style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "8px 10px", borderRadius: 7, background: "var(--surface-2)", border: "1px solid var(--border)" }}>
                                <span style={{ fontFamily: "ui-monospace,'SF Mono',monospace", fontSize: 12, fontWeight: 800, color: rcColor, minWidth: 36, flexShrink: 0 }}>
                                  {rc.probability}%
                                </span>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <p style={{ fontSize: 11, fontWeight: 700, color: rcColor, margin: "0 0 2px" }}>{rc.cause}</p>
                                  <p style={{ fontSize: 11, color: "var(--text-2)", margin: 0, lineHeight: 1.45 }}>{rc.evidence}</p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Code fix */}
                    <div>
                      <p style={{ fontSize: 10, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.07em", margin: "0 0 6px" }}>
                        Suggested Fix
                      </p>
                      <p style={{ fontSize: 11, color: "var(--text-2)", margin: "0 0 8px", lineHeight: 1.5 }}>{fix.description}</p>
                      {hasFix && (
                        <div style={{ borderRadius: 7, overflow: "hidden", border: "1px solid var(--border)" }}>
                          {fix.before && (
                            <pre style={{
                              margin: 0, padding: "8px 12px", fontSize: 11, lineHeight: 1.6,
                              background: "#2d0a0a", color: "#fca5a5", borderLeft: "3px solid #ef4444",
                              overflowX: "auto", whiteSpace: "pre-wrap", wordBreak: "break-all",
                            }}>
                              {"// Before (problematic)\n" + fix.before}
                            </pre>
                          )}
                          {fix.after && (
                            <pre style={{
                              margin: 0, padding: "8px 12px", fontSize: 11, lineHeight: 1.6,
                              background: "#0a2d14", color: "#86efac", borderLeft: "3px solid #22c55e",
                              overflowX: "auto", whiteSpace: "pre-wrap", wordBreak: "break-all",
                            }}>
                              {"// After (stable)\n" + fix.after}
                            </pre>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Fix metadata */}
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                      {t.priority && (
                        <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, fontWeight: 700, background: actColor + "18", color: actColor, border: `1px solid ${actColor}44` }}>
                          Priority: {t.priority}
                        </span>
                      )}
                      {t.estimated_fix_time && (
                        <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, fontWeight: 600, background: "var(--surface-2)", color: "var(--text-2)", border: "1px solid var(--border)" }}>
                          Est. fix time: {t.estimated_fix_time}
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Historical RAG Matches (Phase 2) ── */}
      {(() => {
        const matches: string[] = result?.history_matches ?? [];
        if (matches.length === 0) return null;
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <p style={{ fontSize: 10, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.08em", margin: 0 }}>
              RAG Memory — Similar Past Failures
            </p>
            <div style={{ padding: "12px 14px", borderRadius: 10, background: "rgba(34,211,238,0.05)", border: "1px solid rgba(34,211,238,0.2)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <Activity size={13} color="#22d3ee" />
                <span style={{ fontSize: 11, fontWeight: 700, color: "#22d3ee" }}>
                  {matches.length} similar failure pattern{matches.length !== 1 ? "s" : ""} found in history
                </span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {matches.map((m, i) => (
                  <p key={i} style={{ fontSize: 11, color: "var(--text-2)", margin: 0, lineHeight: 1.6, padding: "6px 10px", background: "var(--surface-2)", borderRadius: 6, border: "1px solid var(--border)" }}>
                    {m}
                  </p>
                ))}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── AI Report ── */}
      {(aiReport.executive_summary || aiReport.top_recommendation || aiReport.defect_breakdown) && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <p style={{ fontSize: 10, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.08em", margin: 0 }}>
            AI Intelligence Report
          </p>
          {[
            { icon: <Activity size={13} color="#a78bfa" />, label: "Executive Summary",    text: toStr(aiReport.executive_summary),  bg: "rgba(124,58,237,0.06)", border: "rgba(124,58,237,0.2)" },
            { icon: <TrendingUp size={13} color="#22c55e" />, label: "Top Recommendation", text: toStr(aiReport.top_recommendation), bg: "rgba(34,197,94,0.06)",  border: "rgba(34,197,94,0.2)" },
            { icon: <Bug size={13} color="#f59e0b" />,       label: "Defect Breakdown",    text: toStr(aiReport.defect_breakdown),   bg: "rgba(245,158,11,0.06)", border: "rgba(245,158,11,0.2)" },
          ].filter(c => c.text).map(({ icon, label, text, bg, border }) => (
            <div key={label} style={{ display: "flex", gap: 10, padding: "12px 14px", borderRadius: 8, background: bg, border: `1px solid ${border}` }}>
              <div style={{ flexShrink: 0, marginTop: 2 }}>{icon}</div>
              <div>
                <p style={{ fontSize: 10, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.07em", margin: "0 0 4px" }}>{label}</p>
                <p style={{ fontSize: 12, color: "var(--text-1)", margin: 0, lineHeight: 1.6 }}>{text}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Export */}
      <ExportBar actionId="flaky_analyzer" result={result} />
    </div>
  );
}

// ── Automation Pipeline UI ────────────────────────────────────────────────────

function AutomationResultViewer({ result }: { result: any }) {
  const [activeTab, setActiveTab] = useState<PipelineTab>("bdd");
  const [featureFileIdx, setFeatureFileIdx] = useState(0);

  const framework    = result?.framework ?? "ts_cucumber";
  const isPy         = framework === "py_behave";
  const PIPELINE_TABS = getPipelineTabs(framework);

  const intent      = result?.intent ?? {};
  const featureFile = result?.feature_file ?? {};
  const featureFiles: any[] = result?.feature_files ?? [featureFile];
  const bddAnalysis = result?.bdd_analysis ?? {};
  const stepDefs    = result?.step_definitions ?? {};
  const pageObj     = result?.page_object ?? {};
  const basePage    = result?.base_page ?? {};
  const locators    = result?.locators ?? {};
  const assertions  = result?.assertions ?? {};
  const validation  = result?.validation ?? {};
  const qualityLevel = result?.quality_level ?? "L2";

  const primaryFeature = featureFiles[featureFileIdx] ?? featureFile;

  const tabContent: Record<PipelineTab, { content: string; filename: string; path: string }> = {
    bdd:        { content: "", filename: "", path: "" },
    feature:    { content: primaryFeature.content ?? "",  filename: primaryFeature.filename ?? "feature.feature",      path: primaryFeature.path ?? "" },
    steps:      { content: stepDefs.content ?? "",        filename: stepDefs.filename ?? "feature.steps.ts",           path: stepDefs.path ?? "" },
    pom:        { content: pageObj.content ?? "",         filename: pageObj.filename ?? "FeaturePage.ts",              path: pageObj.path ?? "" },
    base_page:  { content: basePage.content ?? "",        filename: basePage.filename ?? "base_page.py",               path: basePage.path ?? "" },
    locators:   { content: locators.content ?? "",        filename: locators.filename ?? "feature.locators.ts",        path: locators.path ?? "" },
    assertions: { content: assertions.content ?? "",      filename: assertions.filename ?? "login_assertions.py",      path: assertions.path ?? "" },
    validation: { content: "", filename: "", path: "" },
  };

  const qlColor    = QUALITY_LEVELS.find(q => q.id === qualityLevel)?.color ?? "#a78bfa";
  const allIssues: any[] = validation.issues ?? [];
  const _issueCard = (iss: any, borderColor: string, bgColor: string, badgeColor: string, icon: React.ReactNode, showBlocksBadge?: boolean) => (
    <div style={{ borderRadius: 8, border: `1px solid ${borderColor}`, background: bgColor, overflow: "hidden" }}>
      <div style={{ display: "flex", gap: 10, padding: "10px 12px", alignItems: "flex-start" }}>
        {icon}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
            <span style={{ fontSize: 10, fontWeight: 800, color: badgeColor, textTransform: "uppercase", letterSpacing: "0.07em" }}>
              {iss.type?.replace(/_/g, " ")}
            </span>
            {showBlocksBadge && (
              <span style={{ fontSize: 9, fontWeight: 700, background: "#ef444422", color: "#ef4444", borderRadius: 4, padding: "1px 5px" }}>
                BLOCKS PASS
              </span>
            )}
          </div>
          <p style={{ fontSize: 12, color: "var(--text-2)", margin: 0, lineHeight: 1.5 }}>{iss.detail}</p>
        </div>
      </div>
      {iss.fix && (
        <div style={{ padding: "8px 12px 8px 36px", borderTop: `1px solid ${borderColor}`, background: "rgba(34,197,94,0.04)" }}>
          <p style={{ fontSize: 10, fontWeight: 700, color: "#22c55e", textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 3px" }}>Fix</p>
          <p style={{ fontSize: 11, color: "var(--text-2)", margin: 0, lineHeight: 1.5 }}>{iss.fix}</p>
        </div>
      )}
      {iss.lines && iss.lines.length > 0 && (
        <div style={{ padding: "8px 12px 10px 36px", borderTop: `1px solid ${borderColor}` }}>
          <p style={{ fontSize: 10, fontWeight: 700, color: badgeColor, textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 6px" }}>
            Violating lines ({iss.lines.length})
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {(iss.lines as string[]).map((line: string, j: number) => (
              <pre key={j} style={{
                margin: 0, fontSize: 10, lineHeight: 1.5, color: "#e6edf3", background: "#0d1117",
                padding: "4px 8px", borderRadius: 5, borderLeft: `3px solid ${badgeColor}`,
                overflowX: "auto", whiteSpace: "pre-wrap", wordBreak: "break-all",
              }}>{line}</pre>
            ))}
          </div>
        </div>
      )}
    </div>
  );
  const validPassed = validation.passed ?? true;
  const bddTags: string[]     = bddAnalysis.tags ?? [];
  const bddDecisions: string[] = bddAnalysis.decisions ?? [];
  const scenarioType: string   = bddAnalysis.scenario_type ?? "";
  const hasBackground: boolean = bddAnalysis.has_background ?? false;

  // Separate issues by severity so the UI communicates clearly
  const CRITICAL_TYPES  = new Set(["pom_violation", "hardcoded_data"]);
  const WARNING_TYPES   = new Set(["flaky_wait", "brittle_locator", "business_language", "gherkin_quality", "duplicate_method"]);
  const SUGGESTION_TYPES = new Set(["locator_suggestion"]);
  const criticalIssues   = allIssues.filter(i => CRITICAL_TYPES.has(i.type));
  const warningIssues    = allIssues.filter(i => WARNING_TYPES.has(i.type));
  const suggestionIssues = allIssues.filter(i => SUGGESTION_TYPES.has(i.type));
  const blockingCount    = criticalIssues.length;
  const warningCount     = warningIssues.length;
  const suggestionCount  = suggestionIssues.length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Intent banner */}
      <div style={{
        display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center",
        padding: "10px 14px", borderRadius: 10,
        background: "rgba(124,58,237,0.08)", border: "1px solid rgba(124,58,237,0.2)",
      }}>
        <GitBranch size={13} color="#a78bfa" />
        <span style={{ fontSize: 11, fontWeight: 700, color: "#a78bfa" }}>
          {intent.module ?? "Module"} / {intent.feature ?? "Feature"}
        </span>
        <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 8, background: qlColor + "22", color: qlColor, fontWeight: 700, border: `1px solid ${qlColor}44` }}>
          {qualityLevel}
        </span>
        <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 8, fontWeight: 700,
          background: isPy ? "rgba(245,158,11,0.12)" : "rgba(96,165,250,0.12)",
          color: isPy ? "#f59e0b" : "#60a5fa",
          border: isPy ? "1px solid rgba(245,158,11,0.3)" : "1px solid rgba(96,165,250,0.3)",
        }}>
          {isPy ? "🐍 Python + Behave" : "⚡ TS + Cucumber"}
        </span>
        {/* BDD construct badges */}
        {scenarioType && (
          <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 6, fontWeight: 700, background: "rgba(34,197,94,0.12)", color: "#22c55e", border: "1px solid rgba(34,197,94,0.25)" }}>
            {scenarioType}
          </span>
        )}
        {hasBackground && (
          <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 6, fontWeight: 700, background: "rgba(96,165,250,0.12)", color: "#60a5fa", border: "1px solid rgba(96,165,250,0.25)" }}>
            Background
          </span>
        )}
        {featureFiles.length > 1 && (
          <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 6, fontWeight: 700, background: "rgba(251,146,60,0.12)", color: "#fb923c", border: "1px solid rgba(251,146,60,0.25)" }}>
            {featureFiles.length} feature files
          </span>
        )}
        {[
          { label: intent.page_class, title: "PageObject" },
          { label: intent.steps_file, title: "Steps" },
        ].filter(x => x.label).map(x => (
          <span key={x.title} style={{ fontSize: 10, color: "var(--text-3)", padding: "2px 7px", borderRadius: 6, background: "var(--surface-2)", border: "1px solid var(--border)" }}>
            {x.title}: <code style={{ color: "var(--text-2)" }}>{x.label}</code>
          </span>
        ))}
        {pageObj.methods && pageObj.methods.length > 0 && (
          <span style={{ fontSize: 10, color: "var(--text-3)" }}>{pageObj.methods.length} POM methods</span>
        )}
        <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 5, fontSize: 10, fontWeight: 700, color: validPassed ? "#22c55e" : "#ef4444" }}>
          {validPassed
            ? <>
                <CheckCircle size={11} /> Validation passed
                {suggestionCount > 0 && (
                  <span style={{ marginLeft: 4, fontSize: 9, fontWeight: 700, background: "rgba(96,165,250,0.15)", color: "#60a5fa", borderRadius: 4, padding: "1px 5px" }}>
                    {suggestionCount} tip{suggestionCount !== 1 ? "s" : ""}
                  </span>
                )}
              </>
            : <><XCircle size={11} /> {blockingCount} critical · {warningCount} warning{warningCount !== 1 ? "s" : ""}</>
          }
        </span>
      </div>

      {/* BDD Tags row */}
      {bddTags.length > 0 && (
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: 9, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.08em", marginRight: 2 }}>Tags</span>
          {bddTags.map((tag: string) => (
            <span key={tag} style={{
              fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 10,
              background: "rgba(245,158,11,0.1)", color: "#f59e0b", border: "1px solid rgba(245,158,11,0.25)",
            }}>{tag}</span>
          ))}
        </div>
      )}

      {/* Tab bar */}
      <div style={{ display: "flex", gap: 4, borderBottom: "1px solid var(--border)", flexWrap: "wrap" }}>
        {PIPELINE_TABS.map(tab => {
          const isActive = activeTab === tab.id;
          const hasBddBadge = tab.id === "bdd" && bddDecisions.length > 0;

          // Validation badge: red for blocking, amber for warnings, blue for suggestions only
          let valBadgeColor = "";
          let valBadgeCount = 0;
          if (tab.id === "validation") {
            if (blockingCount > 0)       { valBadgeColor = "#ef4444"; valBadgeCount = blockingCount; }
            else if (warningCount > 0)   { valBadgeColor = "#f59e0b"; valBadgeCount = warningCount; }
            else if (suggestionCount > 0){ valBadgeColor = "#60a5fa"; valBadgeCount = suggestionCount; }
          }

          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
              display: "flex", alignItems: "center", gap: 5,
              padding: "7px 12px", fontSize: 11, fontWeight: isActive ? 700 : 500,
              borderRadius: "8px 8px 0 0", border: "1px solid",
              borderBottom: isActive ? "1px solid var(--surface-1)" : "1px solid var(--border)",
              background: isActive ? "var(--surface-1)" : "transparent",
              borderColor: isActive ? tab.color + "55" : "var(--border)",
              color: isActive ? tab.color : "var(--text-3)",
              cursor: "pointer", transition: "all 0.1s", marginBottom: "-1px",
            }}>
              {tab.id === "validation" && blockingCount > 0 && <XCircle size={10} color="#ef4444" />}
              {tab.id === "validation" && blockingCount === 0 && warningCount > 0 && <AlertTriangle size={10} color="#f59e0b" />}
              {tab.label}
              {hasBddBadge && (
                <span style={{ background: "#f59e0b22", color: "#f59e0b", borderRadius: 8, padding: "1px 5px", fontSize: 9, fontWeight: 700 }}>
                  {bddDecisions.length}
                </span>
              )}
              {valBadgeCount > 0 && (
                <span style={{ background: valBadgeColor + "22", color: valBadgeColor, borderRadius: 8, padding: "1px 5px", fontSize: 9, fontWeight: 700 }}>
                  {valBadgeCount}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div style={{ border: "1px solid var(--border)", borderRadius: "0 8px 8px 8px", overflow: "hidden" }}>
        {/* ── BDD Analysis tab ── */}
        {activeTab === "bdd" ? (
          <div style={{ padding: 16, background: "var(--surface-1)", display: "flex", flexDirection: "column", gap: 14 }}>
            {/* Decision engine header */}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <AlertTriangle size={15} color="#f59e0b" />
              <span style={{ fontSize: 13, fontWeight: 700, color: "#f59e0b" }}>Enterprise BDD Decision Engine</span>
              <span style={{ fontSize: 10, color: "var(--text-3)", background: "var(--surface-2)", border: "1px solid var(--border)", padding: "2px 7px", borderRadius: 6 }}>
                10 Rules Applied
              </span>
            </div>

            {/* Construct summary chips */}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {[
                { label: `Construct: ${scenarioType || "Scenario"}`, color: "#22c55e" },
                { label: hasBackground ? "Background: extracted" : "Background: not needed", color: hasBackground ? "#60a5fa" : "var(--text-3)" },
                { label: bddAnalysis.has_examples ? "Examples table: yes" : "Examples: no", color: bddAnalysis.has_examples ? "#a78bfa" : "var(--text-3)" },
                { label: bddAnalysis.has_datatables ? "DataTable: yes" : "DataTable: no", color: bddAnalysis.has_datatables ? "#fb923c" : "var(--text-3)" },
                { label: `${featureFiles.length} feature file${featureFiles.length !== 1 ? "s" : ""}`, color: "#f59e0b" },
              ].map(c => (
                <span key={c.label} style={{ fontSize: 10, fontWeight: 600, padding: "3px 9px", borderRadius: 8, background: c.color + "18", color: c.color, border: `1px solid ${c.color}33` }}>
                  {c.label}
                </span>
              ))}
            </div>

            {/* Design decisions */}
            {bddDecisions.length > 0 && (
              <div>
                <p style={{ fontSize: 10, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 8px" }}>
                  Design Decisions ({bddDecisions.length})
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {bddDecisions.map((d: string, i: number) => {
                    const ruleMatch = d.match(/^([A-Z _]+):/);
                    const ruleName = ruleMatch?.[1] ?? "";
                    const rest = ruleMatch ? d.slice(ruleMatch[0].length).trim() : d;
                    return (
                      <div key={i} style={{ display: "flex", gap: 10, padding: "8px 12px", borderRadius: 7, background: "rgba(245,158,11,0.05)", border: "1px solid rgba(245,158,11,0.15)" }}>
                        <span style={{ fontSize: 9, fontWeight: 800, color: "#f59e0b", background: "#f59e0b1a", padding: "2px 6px", borderRadius: 4, whiteSpace: "nowrap", alignSelf: "flex-start", marginTop: 1 }}>
                          {ruleName || `#${i + 1}`}
                        </span>
                        <span style={{ fontSize: 11, color: "var(--text-2)", lineHeight: 1.5 }}>{rest}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Quality checks */}
            {(bddAnalysis.quality_checks ?? []).length > 0 && (
              <div>
                <p style={{ fontSize: 10, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 8px" }}>
                  Gherkin Quality Checks
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  {(bddAnalysis.quality_checks as string[]).map((qc: string, i: number) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: "var(--text-2)" }}>
                      <CheckCircle size={11} color="#22c55e" />
                      {qc}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Multiple feature files */}
            {featureFiles.length > 1 && (
              <div>
                <p style={{ fontSize: 10, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 8px" }}>
                  Generated Feature Files ({featureFiles.length})
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {featureFiles.map((ff: any, idx: number) => (
                    <div key={idx} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: 7, background: featureFileIdx === idx ? "rgba(34,197,94,0.08)" : "var(--surface-2)", border: `1px solid ${featureFileIdx === idx ? "rgba(34,197,94,0.3)" : "var(--border)"}` }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: "#22c55e", fontFamily: "monospace" }}>{ff.path ?? ff.filename}</span>
                      <button onClick={() => { setFeatureFileIdx(idx); setActiveTab("feature"); }} style={{ marginLeft: "auto", fontSize: 9, fontWeight: 700, padding: "2px 8px", borderRadius: 5, cursor: "pointer", background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.25)", color: "#22c55e" }}>
                        View →
                      </button>
                      <button onClick={() => _triggerFileDownload(ff.content ?? "", ff.filename ?? "feature.feature")} style={{ fontSize: 9, fontWeight: 700, padding: "2px 8px", borderRadius: 5, cursor: "pointer", background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text-3)" }}>
                        <Download size={9} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {bddDecisions.length === 0 && (
              <p style={{ fontSize: 12, color: "var(--text-3)", margin: 0 }}>No design decisions available for this run.</p>
            )}
          </div>
        ) : activeTab === "validation" ? (
          <div style={{ padding: 16, background: "var(--surface-1)", display: "flex", flexDirection: "column", gap: 14 }}>

            {/* ── Status banner ── */}
            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "10px 14px", borderRadius: 8,
              background: validPassed ? "rgba(34,197,94,0.07)" : "rgba(239,68,68,0.07)",
              border: `1px solid ${validPassed ? "rgba(34,197,94,0.25)" : "rgba(239,68,68,0.25)"}`,
            }}>
              {validPassed
                ? <CheckCircle size={16} color="#22c55e" />
                : <XCircle size={16} color="#ef4444" />}
              <span style={{ fontSize: 13, fontWeight: 700, color: validPassed ? "#22c55e" : "#ef4444" }}>
                {validPassed ? "All checks passed" : `${blockingCount} critical issue${blockingCount !== 1 ? "s" : ""} detected`}
              </span>
              {validPassed && warningCount > 0 && (
                <span style={{ fontSize: 10, fontWeight: 700, background: "rgba(245,158,11,0.15)", color: "#f59e0b", borderRadius: 5, padding: "2px 7px" }}>
                  {warningCount} warning{warningCount !== 1 ? "s" : ""}
                </span>
              )}
              {suggestionCount > 0 && (
                <span style={{ fontSize: 10, fontWeight: 700, background: "rgba(96,165,250,0.15)", color: "#60a5fa", borderRadius: 5, padding: "2px 7px" }}>
                  {suggestionCount} tip{suggestionCount !== 1 ? "s" : ""}
                </span>
              )}
            </div>

            {/* ── Empty pass checklist ── */}
            {allIssues.length === 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {[
                  "No duplicate POM methods detected",
                  "No hard-coded waits (waitForTimeout) found",
                  "No XPath selectors detected",
                  "Step definitions delegate to Page Object correctly",
                  "Locators use stable selectors (getByTestId / getByRole)",
                ].map(msg => (
                  <div key={msg} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--text-2)" }}>
                    <CheckCircle size={12} color="#22c55e" /> {msg}
                  </div>
                ))}
              </div>
            )}

            {/* ── Critical issues (red, BLOCKS PASS) ── */}
            {criticalIssues.length > 0 && (
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                  <XCircle size={12} color="#ef4444" />
                  <span style={{ fontSize: 10, fontWeight: 800, color: "#ef4444", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                    Critical — Blocks Pass ({criticalIssues.length})
                  </span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {criticalIssues.map((iss: any, i: number) =>
                    <div key={i}>{_issueCard(iss, "rgba(239,68,68,0.3)", "rgba(239,68,68,0.05)", "#ef4444",
                      <XCircle size={14} color="#ef4444" style={{ flexShrink: 0, marginTop: 1 }} />, true)}</div>
                  )}
                </div>
              </div>
            )}

            {/* ── Warnings (amber) ── */}
            {warningIssues.length > 0 && (
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                  <AlertTriangle size={12} color="#f59e0b" />
                  <span style={{ fontSize: 10, fontWeight: 800, color: "#f59e0b", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                    Warnings ({warningIssues.length})
                  </span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {warningIssues.map((iss: any, i: number) =>
                    <div key={i}>{_issueCard(iss, "rgba(245,158,11,0.3)", "rgba(245,158,11,0.05)", "#f59e0b",
                      <AlertTriangle size={14} color="#f59e0b" style={{ flexShrink: 0, marginTop: 1 }} />)}</div>
                  )}
                </div>
              </div>
            )}

            {/* ── Suggestions (blue, non-blocking) ── */}
            {suggestionIssues.length > 0 && (
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                  <span style={{ fontSize: 14, lineHeight: 1 }}>💡</span>
                  <span style={{ fontSize: 10, fontWeight: 800, color: "#60a5fa", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                    Suggestions — Non-blocking ({suggestionIssues.length})
                  </span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {suggestionIssues.map((iss: any, i: number) =>
                    <div key={i}>{_issueCard(iss, "rgba(96,165,250,0.25)", "rgba(96,165,250,0.05)", "#60a5fa",
                      <span style={{ fontSize: 14, lineHeight: 1, flexShrink: 0 }}>💡</span>)}</div>
                  )}
                </div>
              </div>
            )}
          </div>
        ) : (() => {
          const { content, filename, path } = tabContent[activeTab];
          const tab = PIPELINE_TABS.find(t => t.id === activeTab)!;
          return (
            <div style={{ display: "flex", flexDirection: "column", background: "#0d1117" }}>
              {/* Feature file switcher (multi-file) */}
              {activeTab === "feature" && featureFiles.length > 1 && (
                <div style={{ display: "flex", gap: 4, padding: "6px 10px", background: "rgba(34,197,94,0.06)", borderBottom: "1px solid rgba(34,197,94,0.2)", flexWrap: "wrap" }}>
                  {featureFiles.map((ff: any, idx: number) => (
                    <button key={idx} onClick={() => setFeatureFileIdx(idx)} style={{
                      fontSize: 10, fontWeight: featureFileIdx === idx ? 700 : 500, padding: "2px 9px", borderRadius: 6, cursor: "pointer",
                      background: featureFileIdx === idx ? "rgba(34,197,94,0.2)" : "transparent",
                      border: `1px solid ${featureFileIdx === idx ? "rgba(34,197,94,0.4)" : "rgba(34,197,94,0.15)"}`,
                      color: featureFileIdx === idx ? "#22c55e" : "#6b7280",
                    }}>{ff.filename ?? `file-${idx + 1}.feature`}</button>
                  ))}
                </div>
              )}
              {/* File toolbar */}
              <div style={{
                display: "flex", alignItems: "center", gap: 8, padding: "8px 14px",
                background: tab.color + "14", borderBottom: `1px solid ${tab.color}30`,
              }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: tab.color }}>{path || filename}</span>
                <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                  <button onClick={() => navigator.clipboard.writeText(content)} style={{
                    display: "flex", alignItems: "center", gap: 4, fontSize: 10,
                    background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)",
                    borderRadius: 5, padding: "3px 8px", color: "var(--text-3)", cursor: "pointer",
                  }}>
                    <Copy size={10} /> Copy
                  </button>
                  <button onClick={() => _triggerFileDownload(content, filename)} style={{
                    display: "flex", alignItems: "center", gap: 4, fontSize: 10,
                    background: tab.color + "22", border: `1px solid ${tab.color}44`,
                    borderRadius: 5, padding: "3px 8px", color: tab.color, cursor: "pointer", fontWeight: 700,
                  }}>
                    <Download size={10} /> {filename}
                  </button>
                </span>
              </div>
              {/* Code */}
              <pre style={{
                margin: 0, padding: "14px 16px", fontSize: 12, lineHeight: 1.65,
                color: "#e6edf3", overflowX: "auto", overflowY: "auto",
                maxHeight: 480, whiteSpace: "pre", minHeight: 120,
              }}>
                {content || "// No content generated for this file"}
              </pre>
            </div>
          );
        })()}
      </div>

      {/* Download all files */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
        padding: "8px 12px", background: "var(--surface-2)",
        borderRadius: 8, border: "1px solid var(--border)",
      }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
          Download files
        </span>
        {/* All generated feature files */}
        {featureFiles.map((ff: any, idx: number) => ff.content ? (
          <button key={`ff-${idx}`} onClick={() => _triggerFileDownload(ff.content, ff.filename ?? "feature.feature")} style={{
            display: "flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 600,
            padding: "4px 10px", borderRadius: 6, cursor: "pointer",
            background: "#22c55e18", border: "1px solid #22c55e44", color: "#22c55e",
          }}>
            <Download size={10} /> {ff.filename ?? "feature.feature"}
          </button>
        ) : null)}
        {/* Steps, POM, Locators */}
        {PIPELINE_TABS.filter(t => !["bdd", "feature", "validation"].includes(t.id)).map(tab => {
          const { content, filename } = tabContent[tab.id];
          return content ? (
            <button key={tab.id} onClick={() => _triggerFileDownload(content, filename)} style={{
              display: "flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 600,
              padding: "4px 10px", borderRadius: 6, cursor: "pointer",
              background: tab.color + "18", border: `1px solid ${tab.color}44`, color: tab.color,
            }}>
              <Download size={10} /> {filename}
            </button>
          ) : null;
        })}
      </div>
    </div>
  );
}

// ── Automation Pipeline options bar ───────────────────────────────────────────

function PipelineOptionsBar({ options, onChange }: {
  options: Record<string, unknown>;
  onChange: (o: Record<string, unknown>) => void;
}) {
  const currentQl = (options.quality_level as string) ?? "L2";
  const currentFw = (options.framework as string) ?? "ts_cucumber";
  const isPy      = currentFw === "py_behave";

  const tsFiles = "Feature File + Step Definitions + Page Object + Locators";
  const pyFiles = "Feature File + Steps (.py) + Page Object + Base Page + Locators + Assertions";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {/* Framework selector */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)" }}>Framework</span>
        {FRAMEWORK_OPTIONS.map(fw => {
          const isActive = currentFw === fw.id;
          return (
            <button key={fw.id} onClick={() => onChange({ ...options, framework: fw.id })} style={{
              display: "flex", alignItems: "center", gap: 7,
              padding: "5px 12px", borderRadius: 8, cursor: "pointer",
              border: `1px solid ${isActive ? fw.color : "var(--border)"}`,
              background: isActive ? fw.color + "18" : "var(--surface-2)",
              transition: "all 0.12s",
            }}>
              <span style={{ fontSize: 10, fontWeight: 800, padding: "1px 5px", borderRadius: 4,
                background: isActive ? fw.color + "33" : "var(--surface-3)",
                color: isActive ? fw.color : "var(--text-3)",
              }}>{fw.badge}</span>
              <div style={{ textAlign: "left" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: isActive ? fw.color : "var(--text-2)" }}>{fw.label}</div>
                <div style={{ fontSize: 9, color: isActive ? fw.color + "bb" : "var(--text-3)", marginTop: 1 }}>{fw.desc}</div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Quality selector */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)" }}>Output quality</span>
        {QUALITY_LEVELS.map(q => {
          const isActive = currentQl === q.id;
          return (
            <button key={q.id} onClick={() => onChange({ ...options, quality_level: q.id })} style={{
              display: "flex", flexDirection: "column", alignItems: "flex-start",
              padding: "6px 12px", borderRadius: 8, cursor: "pointer",
              border: `1px solid ${isActive ? q.color : "var(--border)"}`,
              background: isActive ? q.color + "18" : "var(--surface-2)",
              transition: "all 0.12s",
            }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: isActive ? q.color : "var(--text-2)" }}>{q.label}</span>
              <span style={{ fontSize: 9, color: isActive ? q.color + "cc" : "var(--text-3)", marginTop: 1 }}>{q.desc}</span>
            </button>
          );
        })}
      </div>

      <p style={{ fontSize: 10, color: "var(--text-3)", margin: 0 }}>
        💡 Generates: <strong style={{ color: "var(--text-2)" }}>{isPy ? pyFiles : tsFiles}</strong> (3 AI calls chained · ~30–45s)
      </p>
    </div>
  );
}

// ── Single action result + export ─────────────────────────────────────────────

function ResultDisplay({ result }: { result: any }) {
  return (
    <pre style={{
      fontSize: 11, color: "var(--text-2)", overflow: "auto", maxHeight: 380,
      background: "#0d1117", borderRadius: 8, padding: 14, lineHeight: 1.6, margin: 0,
      whiteSpace: "pre-wrap", border: "1px solid var(--border)",
    }}>
      {JSON.stringify(result, null, 2)}
    </pre>
  );
}

// ── Skeleton card ─────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div style={{
      padding: 16, borderRadius: 12,
      background: "var(--surface-1)", border: "1px solid var(--border)",
    }}>
      <style>{`@keyframes shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}`}</style>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 10, flexShrink: 0,
          background: "linear-gradient(90deg, rgba(255,255,255,0.04) 25%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.04) 75%)",
          backgroundSize: "200% 100%", animation: "shimmer 1.4s ease infinite",
        }} />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ height: 13, width: "60%", borderRadius: 6, background: "linear-gradient(90deg, rgba(255,255,255,0.04) 25%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.04) 75%)", backgroundSize: "200% 100%", animation: "shimmer 1.4s ease infinite" }} />
          <div style={{ height: 10, width: "90%", borderRadius: 6, background: "linear-gradient(90deg, rgba(255,255,255,0.04) 25%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.04) 75%)", backgroundSize: "200% 100%", animation: "shimmer 1.4s ease 0.1s infinite" }} />
          <div style={{ height: 10, width: "70%", borderRadius: 6, background: "linear-gradient(90deg, rgba(255,255,255,0.04) 25%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.04) 75%)", backgroundSize: "200% 100%", animation: "shimmer 1.4s ease 0.2s infinite" }} />
        </div>
      </div>
      <div style={{ marginTop: 14, display: "flex", gap: 6 }}>
        <div style={{ height: 18, width: 64, borderRadius: 20, background: "linear-gradient(90deg, rgba(255,255,255,0.04) 25%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.04) 75%)", backgroundSize: "200% 100%", animation: "shimmer 1.4s ease 0.15s infinite" }} />
        <div style={{ height: 18, width: 32, borderRadius: 20, background: "linear-gradient(90deg, rgba(255,255,255,0.04) 25%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.04) 75%)", backgroundSize: "200% 100%", animation: "shimmer 1.4s ease 0.25s infinite" }} />
      </div>
    </div>
  );
}

// ── Action card grid ──────────────────────────────────────────────────────────

function ComplexityDots({ level }: { level: Complexity }) {
  const filled = level === "low" ? 1 : level === "med" ? 2 : 3;
  return (
    <div style={{ display: "flex", gap: 3, alignItems: "center" }}>
      {[1, 2, 3].map(i => (
        <div key={i} style={{
          width: 5, height: 5, borderRadius: "50%",
          background: i <= filled ? COMPLEXITY_COLORS[level] : "rgba(255,255,255,0.1)",
        }} />
      ))}
    </div>
  );
}

function ActionCard({ action, onSelect }: { action: AIAction; onSelect: (a: AIAction) => void }) {
  const Icon = ICON_MAP[action.icon] ?? Zap;
  const meta = ACTION_META[action.id];
  const accent = meta?.accent ?? "#7c3aed";
  return (
    <motion.button
      onClick={() => onSelect(action)}
      className="card"
      initial={false}
      whileHover={{
        y: -2,
        borderColor: `${accent}66`,
        boxShadow: `0 8px 32px rgba(0,0,0,0.3), 0 0 0 1px ${accent}1a`,
      }}
      whileTap={{ scale: 0.98 }}
      transition={{ duration: 0.15 }}
      style={{
        padding: 16, textAlign: "left", cursor: "pointer",
        border: "1px solid var(--border)",
        borderRadius: 12, background: "var(--surface-1)",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <motion.div
          whileHover={{ scale: 1.1 }}
          transition={{ duration: 0.15 }}
          style={{
            width: 36, height: 36, borderRadius: 10,
            background: `${accent}22`,
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}
        >
          <Icon size={15} color={accent} />
        </motion.div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: "var(--text-1)", margin: "0 0 3px" }}>{action.label}</p>
          <p style={{ fontSize: 11, color: "var(--text-3)", margin: 0, lineHeight: 1.5 }}>{action.description}</p>
        </div>
        <ChevronRight size={13} color="var(--text-3)" style={{ marginTop: 2, flexShrink: 0 }} />
      </div>

      {/* Metadata footer */}
      {meta && (
        <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{
            fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 20,
            background: `${accent}18`, color: accent,
            border: `1px solid ${accent}33`, letterSpacing: "0.04em", textTransform: "uppercase",
          }}>{meta.category}</span>
          <ComplexityDots level={meta.complexity} />
          <span style={{ fontSize: 10, color: "var(--text-3)", marginLeft: "auto" }}>{meta.time}</span>
        </div>
      )}
    </motion.button>
  );
}

// ── Elapsed timer hook ────────────────────────────────────────────────────────

function useElapsedTime(running: boolean) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!running) { setElapsed(0); return; }
    const id = setInterval(() => setElapsed(s => s + 1), 1000);
    return () => clearInterval(id);
  }, [running]);
  return elapsed;
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AIPage() {
  const [selected, setSelected] = useState<AIAction | null>(null);
  const [content, setContent] = useState("");
  const [options, setOptions] = useState<Record<string, unknown>>({});

  const { data: actionsData } = useQuery({ queryKey: ["ai-actions"], queryFn: aiApi.actions });
  const actions: AIAction[] = actionsData?.actions ?? [];

  const runMut = useMutation({
    mutationFn: async ({ action, content, options }: { action: string; content: string; options: Record<string, unknown> }) => {
      try {
        return await aiApi.run(action, content, options);
      } catch (err: any) {
        const status = err?.response?.status;
        // Auto-retry once on server/transient errors (500, 502, 503, 504)
        if (status && status >= 500) {
          await new Promise(r => setTimeout(r, 2000));
          return await aiApi.run(action, content, options);
        }
        throw err;
      }
    },
  });

  const handleRun = () => {
    if (!selected || !content.trim()) return;
    runMut.mutate({ action: selected.id, content, options });
  };

  const handleClose = () => {
    setSelected(null); setContent(""); setOptions({}); runMut.reset();
  };

  const isScriptAction   = selected?.id === "generate_script";
  const isPipelineAction = selected?.id === "automation_pipeline";
  const isFlakyAction    = selected?.id === "flaky_analyzer";
  const elapsed          = useElapsedTime(runMut.isPending);
  const isActionsLoading = !actionsData;

  return (
    <div style={{ padding: "28px 32px", maxWidth: 900 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text-1)", margin: "0 0 4px" }}>AI Actions</h1>
        <p style={{ fontSize: 13, color: "var(--text-3)", margin: 0 }}>{actions?.length ?? 11} specialized QA agents · Groq llama-3.3-70b-versatile</p>
      </div>

      <AnimatePresence mode="wait">
      {!selected ? (
        <motion.div
          key="grid"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2 }}
          style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}
        >
          {isActionsLoading
            ? Array.from({ length: 9 }).map((_, i) => <SkeletonCard key={i} />)
            : actions.map((a, i) => (
                <motion.div
                  key={a.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04, duration: 0.25 }}
                >
                  <ActionCard action={a} onSelect={setSelected} />
                </motion.div>
              ))
          }
        </motion.div>
      ) : (
        <motion.div
          key="detail"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.22 }}
          style={{ maxWidth: 820, display: "flex", flexDirection: "column", gap: 16 }}
        >

          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              {(() => {
                const Icon = ICON_MAP[selected.icon] ?? Zap;
                const accent = ACTION_META[selected.id]?.accent ?? "#7c3aed";
                return (
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: `${accent}22`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Icon size={15} color={accent} />
                  </div>
                );
              })()}
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <h2 style={{ fontSize: 15, fontWeight: 700, color: "var(--text-1)", margin: 0 }}>{selected.label}</h2>
                  {ACTION_META[selected.id] && (
                    <span style={{
                      fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 20,
                      background: `${ACTION_META[selected.id].accent}18`,
                      color: ACTION_META[selected.id].accent,
                      border: `1px solid ${ACTION_META[selected.id].accent}33`,
                      letterSpacing: "0.04em", textTransform: "uppercase",
                    }}>{ACTION_META[selected.id].category}</span>
                  )}
                </div>
                <p style={{ fontSize: 11, color: "var(--text-3)", margin: 0 }}>{selected.description}</p>
              </div>
            </div>
            <button onClick={handleClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-3)", padding: 4 }}>
              <X size={17} />
            </button>
          </div>

          {/* ── Flaky: file upload zone (Phase 2) ── */}
          {isFlakyAction && (
            <ReportUploadZone
              onAppend={text => setContent(prev => prev ? prev + "\n\n" + text : text)}
              onClear={() => setContent("")}
            />
          )}

          {/* Content textarea (always shown) */}
          <div>
            <label style={{ fontSize: 11, color: "var(--text-3)", display: "block", marginBottom: 6, fontWeight: 600 }}>
              {isFlakyAction
                ? "Or paste results manually — plain text, JSON, CSV, or use the upload zone above"
                : (CONTENT_LABEL[selected.id] ?? "Input")}
            </label>
            <textarea
              value={content}
              onChange={e => setContent(e.target.value)}
              rows={8}
              placeholder="Paste your content here…"
              style={{
                width: "100%", background: "var(--surface-1)", border: "1px solid var(--border)",
                borderRadius: 10, padding: "12px 14px", fontSize: 13, color: "var(--text-1)",
                fontFamily: "monospace", resize: "vertical", outline: "none", boxSizing: "border-box",
              }}
            />
          </div>

          {/* ── Generate Script: multi-framework mode ── */}
          {isScriptAction && (
            <MultiScriptGenerator content={content} />
          )}

          {/* ── All other actions: options + single run ── */}
          {!isScriptAction && (
            <>
              {/* Per-action option controls */}
              {isPipelineAction && (
                <PipelineOptionsBar
                  options={options}
                  onChange={setOptions}
                />
              )}
              {selected.id === "test_data" && (
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <label style={{ fontSize: 11, color: "var(--text-3)", fontWeight: 600 }}>Records per category</label>
                  <input type="number" defaultValue={10} min={5} max={50}
                    onChange={e => setOptions({ count: +e.target.value })}
                    style={{
                      width: 70, background: "var(--surface-2)", border: "1px solid var(--border)",
                      borderRadius: 8, padding: "6px 10px", fontSize: 13, color: "var(--text-1)",
                    }} />
                </div>
              )}

              <motion.button
                onClick={handleRun}
                disabled={!content.trim() || runMut.isPending}
                whileHover={!content.trim() || runMut.isPending ? {} : { scale: 1.01 }}
                whileTap={!content.trim() || runMut.isPending ? {} : { scale: 0.98 }}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  padding: "12px 24px", borderRadius: 10, fontSize: 14, fontWeight: 700,
                  background: runMut.isPending
                    ? "linear-gradient(135deg, #5b21b6, #7c3aed)"
                    : "linear-gradient(135deg, #7c3aed, #a78bfa)",
                  color: "white", border: "none",
                  cursor: !content.trim() || runMut.isPending ? "not-allowed" : "pointer",
                  opacity: !content.trim() ? 0.5 : 1,
                  position: "relative", overflow: "hidden",
                }}
              >
                {runMut.isPending && (
                  <motion.div
                    animate={{ x: ["−100%", "200%"] }}
                    transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
                    style={{
                      position: "absolute", inset: 0,
                      background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.12), transparent)",
                      pointerEvents: "none",
                    }}
                  />
                )}
                {runMut.isPending ? (
                  <>
                    <div style={{ width: 14, height: 14, border: "2px solid rgba(255,255,255,0.4)", borderTopColor: "white", borderRadius: "50%", animation: "spin 0.8s linear infinite", flexShrink: 0 }} />
                    {isPipelineAction ? "Running pipeline…" : "Running agent…"}
                    <span style={{ fontSize: 12, opacity: 0.7, marginLeft: 2 }}>{elapsed}s</span>
                  </>
                ) : (
                  <>
                    <Play size={15} />
                    {`Run — ${selected.label}`}
                  </>
                )}
              </motion.button>

              {runMut.data && (selected.id === "test_data" || selected.id === "generate_test_cases") && (() => {
                const tc: any[] = runMut.data.result?.test_cases ?? [];
                const summary = runMut.data.result?.summary ?? {};
                return tc.length > 0 ? (
                  <div style={{
                    display: "flex", flexWrap: "wrap", gap: 8,
                    padding: "10px 14px", background: "rgba(34,197,94,0.07)",
                    border: "1px solid rgba(34,197,94,0.25)", borderRadius: 10,
                  }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "#22c55e" }}>
                      {tc.length} test cases generated
                    </span>
                    {(summary.categories_covered as string[] | undefined)?.map((cat: string) => (
                      <span key={cat} style={{
                        fontSize: 10, padding: "2px 7px", borderRadius: 10, fontWeight: 600,
                        background: "rgba(124,58,237,0.15)", color: "var(--accent-light)",
                        border: "1px solid rgba(124,58,237,0.2)",
                      }}>{cat}</span>
                    ))}
                  </div>
                ) : null;
              })()}

              {/* ── Automation Pipeline: loading stages indicator ── */}
              {runMut.isPending && isPipelineAction && (
                <div style={{
                  display: "flex", flexDirection: "column", gap: 10,
                  padding: "16px 18px", borderRadius: 10,
                  background: "rgba(124,58,237,0.06)", border: "1px solid rgba(124,58,237,0.2)",
                }}>
                  <p style={{ fontSize: 12, fontWeight: 700, color: "#a78bfa", margin: 0 }}>
                    Running 3-stage AI pipeline…
                  </p>
                  {[
                    "Stage 1 — Intent extraction + Gherkin feature file",
                    "Stage 2 — Step definitions (Cucumber + Playwright)",
                    "Stage 3 — Page Object Model + Locators",
                  ].map((stage, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{
                        width: 14, height: 14, borderRadius: "50%",
                        border: "2px solid #a78bfa", borderTopColor: "transparent",
                        animation: "spin 0.8s linear infinite", flexShrink: 0,
                      }} />
                      <span style={{ fontSize: 11, color: "var(--text-2)" }}>{stage}</span>
                    </div>
                  ))}
                </div>
              )}

              <AnimatePresence>
              {/* ── Automation Pipeline: rich 4-tab viewer ── */}
              {runMut.data && isPipelineAction && (() => {
                try {
                  return (
                    <motion.div key="pipeline-result" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
                      <AutomationResultViewer result={runMut.data.result} />
                    </motion.div>
                  );
                } catch (e) {
                  return (
                    <div style={{ padding: 14, borderRadius: 8, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>
                      <p style={{ fontSize: 12, color: "#ef4444", margin: 0 }}>Display error — raw result below:</p>
                      <pre style={{ fontSize: 10, color: "var(--text-2)", marginTop: 8, overflow: "auto", maxHeight: 300 }}>
                        {JSON.stringify(runMut.data.result, null, 2)}
                      </pre>
                    </div>
                  );
                }
              })()}

              {/* ── Flaky Test Intelligence: rich viewer ── */}
              {runMut.data && isFlakyAction && (
                <motion.div key="flaky-result" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
                  <ErrorBoundary>
                    <FlakyResultViewer result={runMut.data.result} />
                  </ErrorBoundary>
                </motion.div>
              )}

              {runMut.data && !isPipelineAction && !isFlakyAction && (
                <motion.div key="generic-result" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
                  style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {/* Script action: show code viewer + direct download, not generic ExportBar */}
                  {selected.id === "generate_script" && runMut.data.result?.script ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 0, border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
                      {/* toolbar */}
                      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", background: "rgba(124,58,237,0.1)", borderBottom: "1px solid var(--border)" }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--accent-light)", flex: 1 }}>
                          {runMut.data.result.filename ?? "test_login.spec.ts"}
                        </span>
                        <span style={{ fontSize: 10, color: "var(--text-3)" }}>
                          {runMut.data.tokens_used}t · {runMut.data.latency_ms?.toFixed(0)}ms
                        </span>
                        <button onClick={() => navigator.clipboard.writeText(runMut.data.result.script)} style={{
                          display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: "var(--text-3)",
                          background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
                          borderRadius: 5, padding: "3px 8px", cursor: "pointer",
                        }}>
                          <Copy size={10} /> Copy
                        </button>
                        <DlBtn
                          label={`.${runMut.data.result.filename?.split(".").slice(1).join(".") ?? "spec.ts"}`}
                          icon={<Download size={10} />}
                          onClick={() => downloadScript(runMut.data.result)}
                          accent
                        />
                      </div>
                      {/* code */}
                      <pre style={{
                        margin: 0, padding: "16px 18px", fontSize: 12, lineHeight: 1.65,
                        color: "#e6edf3", background: "#0d1117", overflowX: "auto",
                        maxHeight: 500, whiteSpace: "pre",
                      }}>
                        {runMut.data.result.script}
                      </pre>
                    </div>
                  ) : (
                    <ExportBar actionId={selected.id} result={runMut.data.result} />
                  )}
                  <div className="card" style={{ padding: 14 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: "#22c55e" }}>Result</span>
                        {runMut.data.result?.provider && (
                          <span style={{
                            fontSize: 9, padding: "2px 6px", borderRadius: 4, fontWeight: 700,
                            background: "rgba(124,58,237,0.15)", color: "var(--accent-light)",
                            border: "1px solid rgba(124,58,237,0.25)",
                          }}>
                            via {runMut.data.result.provider}
                          </span>
                        )}
                      </div>
                      <span style={{ fontSize: 10, color: "var(--text-3)" }}>
                        {runMut.data.tokens_used} tokens · {runMut.data.latency_ms?.toFixed(0)}ms
                      </span>
                    </div>
                    <ResultDisplay result={runMut.data.result} />
                  </div>
                </motion.div>
              )}
              </AnimatePresence>

              {/* Error display for ALL actions including pipeline */}
              {runMut.error && (() => {
                const err = runMut.error as any;
                const detail    = err?.response?.data?.detail;
                const httpCode  = err?.response?.status;
                const isNetwork = !err?.response;
                const isServer  = httpCode && httpCode >= 500;
                const msg = detail
                  ?? (isNetwork
                      ? "Could not reach the server — check that the backend is running on port 8000."
                      : isServer
                        ? `The AI provider returned a transient error (HTTP ${httpCode}). This was already retried once — click Retry to try again, or wait a few seconds.`
                        : `Request error (HTTP ${httpCode})`);
                return (
                  <div className="card" style={{ padding: 14, borderColor: "rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.05)" }}>
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
                      <p style={{ fontSize: 12, color: "#ef4444", margin: 0, lineHeight: 1.6 }}>{msg}</p>
                      <button onClick={() => selected && content.trim() && runMut.mutate({ action: selected.id, content, options })} style={{
                        flexShrink: 0, fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 5, cursor: "pointer",
                        background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)", color: "#ef4444",
                      }}>Retry</button>
                    </div>
                  </div>
                );
              })()}
            </>
          )}
        </motion.div>
      )}
      </AnimatePresence>
    </div>
  );
}
