"use client";
import { useState, useCallback } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { aiApi } from "@/lib/api";
import { AIAction } from "@/types";
import {
  TestTube, Copy, Target, Search, FileCheck, AlertCircle, Zap,
  Code, Database, ChevronRight, X, FileSpreadsheet, FileText,
  FileJson, CheckSquare, Square, Play, Download,
} from "lucide-react";
import { downloadCSV, downloadXLSX, downloadXLS, downloadDOCX, downloadJSON, downloadScript, downloadJIRA, downloadADO } from "@/lib/export";

// ── Constants ─────────────────────────────────────────────────────────────────

const ICON_MAP: Record<string, any> = { TestTube, Copy, Target, Search, FileCheck, AlertCircle, Zap, Code, Database };

const FRAMEWORKS = [
  { id: "Playwright TypeScript",    label: "Playwright",      lang: "TypeScript", ext: "spec.ts",   color: "#45ba4b", group: "E2E" },
  { id: "Playwright JavaScript",    label: "Playwright",      lang: "JavaScript", ext: "spec.js",   color: "#45ba4b", group: "E2E" },
  { id: "Cypress JavaScript",       label: "Cypress",         lang: "JavaScript", ext: "cy.js",     color: "#04c38e", group: "E2E" },
  { id: "WebdriverIO TypeScript",   label: "WebdriverIO",     lang: "TypeScript", ext: "test.ts",   color: "#ea5906", group: "E2E" },
  { id: "Selenium Java",            label: "Selenium",        lang: "Java",       ext: "Test.java", color: "#b07219", group: "E2E" },
  { id: "Selenium Python",          label: "Selenium",        lang: "Python",     ext: "test.py",   color: "#3572a5", group: "E2E" },
  { id: "REST Assured Java",        label: "REST Assured",    lang: "Java",       ext: "Test.java", color: "#b07219", group: "API" },
  { id: "Axios Jest TypeScript",    label: "Axios + Jest",    lang: "TypeScript", ext: "api.test.ts", color: "#99425b", group: "API" },
  { id: "Supertest JavaScript",     label: "Supertest",       lang: "JavaScript", ext: "api.test.js", color: "#f7df1e", group: "API" },
  { id: "Postman Collection",       label: "Postman",         lang: "JSON",       ext: "postman_collection.json", color: "#ff6c37", group: "API" },
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
  const isTestData = actionId === "test_data" && Array.isArray(result?.test_cases) && result.test_cases.length > 0;
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
  const groups = ["E2E", "API"];
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

// ── Action card grid ──────────────────────────────────────────────────────────

function ActionCard({ action, onSelect }: { action: AIAction; onSelect: (a: AIAction) => void }) {
  const Icon = ICON_MAP[action.icon] ?? Zap;
  return (
    <button onClick={() => onSelect(action)} className="card" style={{
      padding: 16, textAlign: "left", cursor: "pointer", border: "1px solid var(--border)",
      borderRadius: 12, background: "var(--surface-1)", transition: "all 0.15s",
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 10, background: "rgba(124,58,237,0.2)",
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        }}>
          <Icon size={15} color="#a78bfa" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: "var(--text-1)", margin: "0 0 3px" }}>{action.label}</p>
          <p style={{ fontSize: 11, color: "var(--text-3)", margin: 0, lineHeight: 1.5 }}>{action.description}</p>
        </div>
        <ChevronRight size={13} color="var(--text-3)" style={{ marginTop: 2, flexShrink: 0 }} />
      </div>
    </button>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AIPage() {
  const [selected, setSelected] = useState<AIAction | null>(null);
  const [content, setContent] = useState("");
  const [options, setOptions] = useState<Record<string, unknown>>({});

  const { data: actionsData } = useQuery({ queryKey: ["ai-actions"], queryFn: aiApi.actions });
  const actions: AIAction[] = actionsData?.actions ?? [];

  const runMut = useMutation({
    mutationFn: ({ action, content, options }: { action: string; content: string; options: Record<string, unknown> }) =>
      aiApi.run(action, content, options),
  });

  const handleRun = () => {
    if (!selected || !content.trim()) return;
    runMut.mutate({ action: selected.id, content, options });
  };

  const handleClose = () => {
    setSelected(null); setContent(""); setOptions({}); runMut.reset();
  };

  const isScriptAction = selected?.id === "generate_script";

  return (
    <div style={{ padding: "28px 32px", maxWidth: 900 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text-1)", margin: "0 0 4px" }}>AI Actions</h1>
        <p style={{ fontSize: 13, color: "var(--text-3)", margin: 0 }}>9 specialized QA agents · Groq llama-3.3-70b-versatile</p>
      </div>

      {!selected ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
          {actions.map(a => <ActionCard key={a.id} action={a} onSelect={setSelected} />)}
        </div>
      ) : (
        <div style={{ maxWidth: 820, display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              {(() => { const Icon = ICON_MAP[selected.icon] ?? Zap; return (
                <div style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(124,58,237,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Icon size={15} color="#a78bfa" />
                </div>
              ); })()}
              <div>
                <h2 style={{ fontSize: 15, fontWeight: 700, color: "var(--text-1)", margin: 0 }}>{selected.label}</h2>
                <p style={{ fontSize: 11, color: "var(--text-3)", margin: 0 }}>{selected.description}</p>
              </div>
            </div>
            <button onClick={handleClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-3)", padding: 4 }}>
              <X size={17} />
            </button>
          </div>

          {/* Content textarea (always shown) */}
          <div>
            <label style={{ fontSize: 11, color: "var(--text-3)", display: "block", marginBottom: 6, fontWeight: 600 }}>
              {CONTENT_LABEL[selected.id] ?? "Input"}
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

          {/* ── All other actions: test_data count + single run ── */}
          {!isScriptAction && (
            <>
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

              <button
                onClick={handleRun}
                disabled={!content.trim() || runMut.isPending}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  padding: "12px 24px", borderRadius: 10, fontSize: 14, fontWeight: 700,
                  background: "linear-gradient(135deg, #7c3aed, #a78bfa)",
                  color: "white", border: "none",
                  cursor: !content.trim() || runMut.isPending ? "not-allowed" : "pointer",
                  opacity: !content.trim() || runMut.isPending ? 0.6 : 1,
                }}
              >
                <Play size={15} />
                {runMut.isPending ? "Running AI agent…" : `Run — ${selected.label}`}
              </button>

              {runMut.data && selected.id === "test_data" && (() => {
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

              {runMut.data && (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
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
                </div>
              )}

              {runMut.error && (
                <div className="card" style={{ padding: 14, borderColor: "rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.05)" }}>
                  <p style={{ fontSize: 12, color: "#ef4444", margin: 0 }}>
                    {(runMut.error as any)?.response?.data?.detail ?? "Request failed"}
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
