"use client";
import { useState, useRef, useCallback } from "react";
import {
  Search, Upload, GitBranch, Zap, FileText, Code2, Settings,
  AlertTriangle, CheckCircle, Clock, ChevronRight, BarChart2,
  FolderOpen, File, Layers, ArrowRight, Sparkles, X,
  TrendingUp, Shield, AlertCircle, ChevronDown,
} from "lucide-react";
import { toast } from "sonner";

const API = process.env.NEXT_PUBLIC_API_URL || "";

// ── Types ─────────────────────────────────────────────────────────────────────

interface FileDetail {
  name: string;
  language: string;
  type: "test" | "page_object" | "utility" | "other";
  tests: number;
  complexity: "simple" | "medium" | "complex";
  frameworks: string[];
  content_preview?: string;
}

interface ScanResult {
  total_files: number;
  test_files: number;
  page_objects: number;
  utility_files: number;
  other_files: number;
  total_tests: number;
  language: string;
  language_breakdown: Record<string, number>;
  framework: string;
  framework_breakdown: Record<string, number>;
  locator_breakdown: Record<string, number>;
  complexity_breakdown: { simple: number; medium: number; complex: number };
  readiness_score: number;
  readiness_breakdown: {
    score: number;
    auto_migrate_pct: number;
    manual_review_pct: number;
    good: string[];
    needs_attention: string[];
  };
  estimated_review_hours: number;
  file_details: FileDetail[];
  source_name?: string;
}

interface FileAnalysis {
  summary: string;
  test_flow: string[];
  dependencies: string[];
  migration_confidence: "high" | "medium" | "low";
  migration_confidence_score: number;
  risks: string[];
  quick_wins: string[];
  strategy: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function scoreColor(s: number) {
  if (s >= 80) return { text: "#10b981", bg: "rgba(16,185,129,0.08)", stroke: "#10b981" };
  if (s >= 60) return { text: "#f59e0b", bg: "rgba(245,158,11,0.08)", stroke: "#f59e0b" };
  return { text: "#f43f5e", bg: "rgba(244,63,94,0.08)", stroke: "#f43f5e" };
}

const CONF_COLOR = { high: "#10b981", medium: "#f59e0b", low: "#f43f5e" };

function ScoreGauge({ score }: { score: number }) {
  const r = 54, circ = 2 * Math.PI * r, filled = (score / 100) * circ;
  const { text, stroke } = scoreColor(score);
  return (
    <svg width="140" height="140" viewBox="0 0 140 140">
      <circle cx="70" cy="70" r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="10" />
      <circle cx="70" cy="70" r={r} fill="none" stroke={stroke} strokeWidth="10"
        strokeLinecap="round" strokeDasharray={`${filled} ${circ}`}
        transform="rotate(-90 70 70)" style={{ transition: "stroke-dasharray 0.8s ease" }} />
      <text x="70" y="66" textAnchor="middle" fill={text} fontSize="28" fontWeight="700"
        fontFamily="'SF Mono','Cascadia Code',monospace">{score}</text>
      <text x="70" y="84" textAnchor="middle" fill="#6B7280" fontSize="10"
        fontFamily="sans-serif" letterSpacing="0.05em">READINESS</text>
    </svg>
  );
}

function MiniGauge({ score }: { score: number }) {
  const r = 20, circ = 2 * Math.PI * r, filled = (score / 100) * circ;
  const col = CONF_COLOR[score >= 75 ? "high" : score >= 50 ? "medium" : "low"];
  return (
    <svg width="52" height="52" viewBox="0 0 52 52">
      <circle cx="26" cy="26" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="5" />
      <circle cx="26" cy="26" r={r} fill="none" stroke={col} strokeWidth="5"
        strokeLinecap="round" strokeDasharray={`${filled} ${circ}`}
        transform="rotate(-90 26 26)" style={{ transition: "stroke-dasharray 0.5s ease" }} />
      <text x="26" y="30" textAnchor="middle" fill={col} fontSize="11" fontWeight="700"
        fontFamily="monospace">{score}</text>
    </svg>
  );
}

function Bar({ label, value, color, total }: { label: string; value: number; color: string; total: number }) {
  const pct = total ? (value / total) * 100 : 0;
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
        <span style={{ fontSize: 11, color: "#9CA3AF", fontFamily: "monospace" }}>{label}</span>
        <span style={{ fontSize: 11, color: "#6B7280", fontFamily: "monospace" }}>{pct.toFixed(0)}%</span>
      </div>
      <div style={{ height: 5, background: "rgba(255,255,255,0.06)", borderRadius: 3 }}>
        <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 3, transition: "width 0.6s ease" }} />
      </div>
    </div>
  );
}

const COMPLEXITY_COLORS = { simple: "#10b981", medium: "#f59e0b", complex: "#f43f5e" };
const FILE_TYPE_COLORS: Record<string, string> = { test: "#7C3AED", page_object: "#3b82f6", utility: "#f59e0b", other: "#6B7280" };

// ── AI Analysis Drawer ────────────────────────────────────────────────────────

function AnalysisDrawer({
  file,
  analysis,
  loading,
  onClose,
}: {
  file: FileDetail;
  analysis: FileAnalysis | null;
  loading: boolean;
  onClose: () => void;
}) {
  const conf = analysis?.migration_confidence || "medium";
  const confScore = analysis?.migration_confidence_score || 50;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 99, backdropFilter: "blur(2px)" }}
      />
      {/* Drawer */}
      <div style={{
        position: "fixed", right: 0, top: 0, bottom: 0, width: 460, maxWidth: "90vw",
        background: "#0f1521", borderLeft: "1px solid #1d2640",
        zIndex: 100, display: "flex", flexDirection: "column",
        animation: "slideIn 0.22s ease",
      }}>
        {/* Header */}
        <div style={{ padding: "18px 20px 14px", borderBottom: "1px solid #1d2640", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
            <div style={{ flex: 1, overflow: "hidden" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 4 }}>
                <Sparkles size={14} color="#A78BFA" />
                <span style={{ fontSize: 11, fontWeight: 700, color: "#A78BFA", textTransform: "uppercase", letterSpacing: "0.08em" }}>AI File Analysis</span>
              </div>
              <div style={{ fontSize: 12, color: "#F9FAFB", fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {file.name.split("/").pop()}
              </div>
              <div style={{ fontSize: 10, color: "#4B5563", marginTop: 2, fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {file.name}
              </div>
            </div>
            <button onClick={onClose} style={{ background: "rgba(255,255,255,0.05)", border: "1px solid #1d2640", borderRadius: 7, padding: "5px 7px", cursor: "pointer", color: "#6B7280", display: "flex", flexShrink: 0 }}>
              <X size={13} />
            </button>
          </div>

          {/* Quick pills */}
          <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
            {[
              { label: file.language, color: "#3b82f6" },
              { label: file.type.replace("_", " "), color: FILE_TYPE_COLORS[file.type] },
              { label: file.complexity, color: COMPLEXITY_COLORS[file.complexity] },
              ...(file.tests > 0 ? [{ label: `${file.tests} tests`, color: "#A78BFA" }] : []),
            ].map(({ label, color }) => (
              <span key={label} style={{ fontSize: 9, padding: "2px 7px", borderRadius: 4, background: `${color}18`, color, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", border: `1px solid ${color}30` }}>
                {label}
              </span>
            ))}
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px", display: "flex", flexDirection: "column", gap: 16 }}>
          {loading ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 240, gap: 14 }}>
              <div style={{ fontSize: 28, animation: "spin 1.5s linear infinite" }}>✦</div>
              <p style={{ color: "#6B7280", fontSize: 13, margin: 0 }}>Analysing file...</p>
              <p style={{ color: "#374151", fontSize: 11, margin: 0 }}>Reading test flow · Assessing locators · Estimating confidence</p>
            </div>
          ) : analysis ? (
            <>
              {/* Confidence score */}
              <div style={{ background: "#151c2e", border: `1px solid ${CONF_COLOR[conf]}33`, borderRadius: 10, padding: "14px 16px", display: "flex", alignItems: "center", gap: 14 }}>
                <MiniGauge score={confScore} />
                <div>
                  <div style={{ fontSize: 11, color: "#6B7280", marginBottom: 3 }}>Migration Confidence</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: CONF_COLOR[conf], textTransform: "uppercase", letterSpacing: "0.05em" }}>{conf}</div>
                </div>
              </div>

              {/* Summary */}
              {analysis.summary && (
                <Section icon={FileText} title="Summary" color="#3b82f6">
                  <p style={{ fontSize: 12, color: "#9CA3AF", lineHeight: 1.7, margin: 0 }}>{analysis.summary}</p>
                </Section>
              )}

              {/* Test flow */}
              {analysis.test_flow.length > 0 && (
                <Section icon={ChevronDown} title="Test Flow" color="#A78BFA">
                  <ol style={{ margin: 0, padding: "0 0 0 18px", display: "flex", flexDirection: "column", gap: 5 }}>
                    {analysis.test_flow.map((step, i) => (
                      <li key={i} style={{ fontSize: 11, color: "#9CA3AF", lineHeight: 1.5 }}>{step}</li>
                    ))}
                  </ol>
                </Section>
              )}

              {/* Risks */}
              {analysis.risks.length > 0 && (
                <Section icon={AlertTriangle} title="Migration Risks" color="#f43f5e">
                  {analysis.risks.map((r, i) => (
                    <div key={i} style={{ display: "flex", gap: 8, marginBottom: 7 }}>
                      <AlertCircle size={11} color="#f43f5e" style={{ marginTop: 1, flexShrink: 0 }} />
                      <span style={{ fontSize: 11, color: "#9CA3AF", lineHeight: 1.5 }}>{r}</span>
                    </div>
                  ))}
                </Section>
              )}

              {/* Quick wins */}
              {analysis.quick_wins.length > 0 && (
                <Section icon={CheckCircle} title="Quick Wins" color="#10b981">
                  {analysis.quick_wins.map((w, i) => (
                    <div key={i} style={{ display: "flex", gap: 8, marginBottom: 7 }}>
                      <CheckCircle size={11} color="#10b981" style={{ marginTop: 1, flexShrink: 0 }} />
                      <span style={{ fontSize: 11, color: "#9CA3AF", lineHeight: 1.5 }}>{w}</span>
                    </div>
                  ))}
                </Section>
              )}

              {/* Dependencies */}
              {analysis.dependencies.length > 0 && (
                <Section icon={Layers} title="Dependencies" color="#f59e0b">
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                    {analysis.dependencies.map((d, i) => (
                      <span key={i} style={{ fontSize: 10, padding: "2px 8px", borderRadius: 5, background: "rgba(245,158,11,0.1)", color: "#f59e0b", border: "1px solid rgba(245,158,11,0.2)", fontFamily: "monospace" }}>{d}</span>
                    ))}
                  </div>
                </Section>
              )}

              {/* Strategy */}
              {analysis.strategy && (
                <Section icon={TrendingUp} title="Migration Strategy" color="#22d3ee">
                  <p style={{ fontSize: 12, color: "#9CA3AF", lineHeight: 1.7, margin: 0 }}>{analysis.strategy}</p>
                </Section>
              )}
            </>
          ) : null}
        </div>
      </div>
    </>
  );
}

function Section({ icon: Icon, title, color, children }: {
  icon: any; title: string; color: string; children: React.ReactNode;
}) {
  return (
    <div style={{ background: "#0d1117", border: "1px solid #1d2640", borderRadius: 9, overflow: "hidden" }}>
      <div style={{ padding: "8px 14px", borderBottom: "1px solid #1d2640", display: "flex", alignItems: "center", gap: 7, background: "#151c2e" }}>
        <Icon size={11} color={color} />
        <span style={{ fontSize: 10, fontWeight: 700, color, textTransform: "uppercase", letterSpacing: "0.08em" }}>{title}</span>
      </div>
      <div style={{ padding: "10px 14px" }}>{children}</div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function ScannerPage() {
  const [mode, setMode] = useState<"url" | "file">("url");
  const [repoUrl, setRepoUrl] = useState("");
  const [token, setToken] = useState("");
  const [branch, setBranch] = useState("");
  const [pathFilter, setPathFilter] = useState("");
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);

  // File analysis state
  const [selectedFile, setSelectedFile] = useState<FileDetail | null>(null);
  const [fileAnalyses, setFileAnalyses] = useState<Record<string, FileAnalysis>>({});
  const [analyzingFile, setAnalyzingFile] = useState<string | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);

  async function scanUrl(e: React.FormEvent) {
    e.preventDefault();
    if (!repoUrl.trim()) return;
    setScanning(true);
    setResult(null);
    setSelectedFile(null);
    try {
      const fd = new FormData();
      fd.append("repo_url", repoUrl.trim());
      fd.append("repo_token", token);
      fd.append("repo_branch", branch);
      fd.append("path_filter", pathFilter);
      const res = await fetch(`${API}/api/scanner/scan-url`, { method: "POST", body: fd });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail || "Scan failed");
      }
      setResult(await res.json());
      toast.success("Project scan complete");
    } catch (err: any) {
      toast.error(err.message || "Scan failed");
    } finally {
      setScanning(false);
    }
  }

  async function scanFiles(files: FileList) {
    setScanning(true);
    setResult(null);
    setSelectedFile(null);
    try {
      const fd = new FormData();
      Array.from(files).forEach(f => fd.append("files", f));
      const res = await fetch(`${API}/api/scanner/scan`, { method: "POST", body: fd });
      if (!res.ok) throw new Error((await res.json()).detail || "Scan failed");
      setResult(await res.json());
      toast.success("File scan complete");
    } catch (err: any) {
      toast.error(err.message || "Scan failed");
    } finally {
      setScanning(false);
    }
  }

  const openAnalysis = useCallback(async (fd: FileDetail) => {
    setSelectedFile(fd);

    // Already cached
    if (fileAnalyses[fd.name]) return;

    if (!fd.content_preview) {
      setFileAnalyses(prev => ({
        ...prev,
        [fd.name]: {
          summary: "Content preview not available — rescan to enable AI analysis.",
          test_flow: [], dependencies: [], migration_confidence: "medium",
          migration_confidence_score: 50, risks: [], quick_wins: [], strategy: "",
        },
      }));
      return;
    }

    setAnalyzingFile(fd.name);
    try {
      const res = await fetch(`${API}/api/scanner/analyze-file`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: fd.name,
          content: fd.content_preview,
          language: fd.language,
          file_type: fd.type,
          complexity: fd.complexity,
          tests: fd.tests,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).detail || "Analysis failed");
      const data = await res.json();
      setFileAnalyses(prev => ({ ...prev, [fd.name]: data }));
    } catch (err: any) {
      toast.error(err.message || "AI analysis failed");
      setSelectedFile(null);
    } finally {
      setAnalyzingFile(null);
    }
  }, [fileAnalyses]);

  const sc = result ? scoreColor(result.readiness_score) : null;

  return (
    <div style={{ padding: "28px 32px", maxWidth: 1100, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <div style={{ width: 32, height: 32, borderRadius: 9, background: "linear-gradient(135deg,#7C3AED,#A78BFA)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Search size={16} color="white" />
          </div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "#F9FAFB", margin: 0 }}>Project Scanner</h1>
          <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 4, background: "rgba(124,58,237,0.15)", color: "#A78BFA", border: "1px solid rgba(124,58,237,0.25)", letterSpacing: "0.08em" }}>PRE-MIGRATION</span>
        </div>
        <p style={{ fontSize: 13, color: "#6B7280", margin: 0 }}>
          Analyse your automation project — framework detection, locator quality, AI readiness score, and per-file deep analysis.
        </p>
      </div>

      {/* Input card */}
      <div style={{ background: "#111827", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14, padding: 24, marginBottom: 24 }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          {(["url", "file"] as const).map(m => (
            <button key={m} onClick={() => setMode(m)}
              style={{ padding: "6px 14px", borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: "pointer", border: "1px solid", transition: "all 0.15s",
                background: mode === m ? "rgba(124,58,237,0.15)" : "transparent",
                borderColor: mode === m ? "rgba(124,58,237,0.4)" : "rgba(255,255,255,0.08)",
                color: mode === m ? "#A78BFA" : "#6B7280" }}>
              {m === "url" ? "Repository URL" : "Upload Files"}
            </button>
          ))}
        </div>

        {mode === "url" ? (
          <form onSubmit={scanUrl} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <input value={repoUrl} onChange={e => setRepoUrl(e.target.value)}
              placeholder="https://github.com/org/repo — GitLab / Azure DevOps / Bitbucket supported"
              style={inputStyle} />
            <div style={{ display: "flex", gap: 10 }}>
              <input value={token} onChange={e => setToken(e.target.value)}
                type="password" placeholder="Access token (optional for public repos)"
                style={{ ...inputStyle, flex: 1 }} />
              <div style={{ display: "flex", alignItems: "center", gap: 6, flex: "0 0 150px", ...inputStyle }}>
                <GitBranch size={12} color="#6B7280" />
                <input value={branch} onChange={e => setBranch(e.target.value)}
                  placeholder="branch"
                  style={{ background: "transparent", border: "none", fontSize: 12, color: "#F9FAFB", outline: "none", width: "100%", padding: 0 }} />
              </div>
            </div>
            {/* Monorepo path filter */}
            <input value={pathFilter} onChange={e => setPathFilter(e.target.value)}
              placeholder="Monorepo path filter (optional) — e.g. automation/tests"
              style={{ ...inputStyle, fontSize: 12, color: pathFilter ? "#F9FAFB" : "#6B7280" }} />
            <button type="submit" disabled={scanning || !repoUrl.trim()}
              style={{ alignSelf: "flex-start", display: "flex", alignItems: "center", gap: 8, padding: "10px 20px", borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: scanning ? "not-allowed" : "pointer", background: scanning ? "rgba(124,58,237,0.3)" : "rgba(124,58,237,0.85)", border: "none", color: "white", opacity: !repoUrl.trim() ? 0.5 : 1 }}>
              {scanning ? <><span style={{ animation: "spin 1s linear infinite", display: "inline-block" }}>⟳</span> Scanning...</> : <><Search size={14} /> Scan Project</>}
            </button>
          </form>
        ) : (
          <div>
            <div
              onClick={() => fileRef.current?.click()}
              style={{ border: "2px dashed rgba(124,58,237,0.3)", borderRadius: 12, padding: "32px 24px", textAlign: "center", cursor: "pointer", transition: "border-color 0.15s" }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = "rgba(124,58,237,0.6)")}
              onMouseLeave={e => (e.currentTarget.style.borderColor = "rgba(124,58,237,0.3)")}
            >
              <Upload size={28} color="#7C3AED" style={{ marginBottom: 10 }} />
              <p style={{ margin: 0, color: "#9CA3AF", fontSize: 13 }}>Drop test files here or <span style={{ color: "#A78BFA", fontWeight: 600 }}>click to browse</span></p>
              <p style={{ margin: "6px 0 0", color: "#4B5563", fontSize: 11 }}>.java · .py · .cs · .ts · .feature · .robot</p>
            </div>
            {/* @ts-ignore */}
            <input ref={fileRef} type="file" multiple accept=".java,.py,.cs,.ts,.js,.feature,.robot,.kt,.rb"
              style={{ display: "none" }}
              onChange={e => e.target.files?.length && scanFiles(e.target.files)} />
          </div>
        )}
      </div>

      {scanning && (
        <div style={{ background: "#111827", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14, padding: 40, textAlign: "center" }}>
          <div style={{ fontSize: 32, marginBottom: 12, animation: "pulse 1.5s ease-in-out infinite" }}>🔍</div>
          <p style={{ color: "#9CA3AF", fontSize: 14, margin: 0 }}>Analysing project structure, frameworks, locators...</p>
          <p style={{ color: "#4B5563", fontSize: 12, marginTop: 6 }}>Usually 5–15 seconds</p>
        </div>
      )}

      {result && !scanning && (
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {/* Top row */}
          <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 18 }}>
            <div style={{ background: "#111827", border: `1px solid ${sc!.stroke}33`, borderRadius: 14, padding: 24, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, minWidth: 180 }}>
              <ScoreGauge score={result.readiness_score} />
              <p style={{ margin: 0, fontSize: 12, color: "#9CA3AF", textAlign: "center" }}>
                <strong style={{ color: sc!.text }}>{result.readiness_score}% auto-migratable</strong>
              </p>
              <p style={{ margin: 0, fontSize: 10, color: "#4B5563", textAlign: "center" }}>~{result.estimated_review_hours}h human review</p>
              <a href={`/migration?prefill=${encodeURIComponent(result.source_name || "")}`}
                style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 5, padding: "7px 16px", borderRadius: 8, background: "rgba(124,58,237,0.85)", color: "white", fontSize: 12, fontWeight: 600, textDecoration: "none" }}>
                Migrate Now <ArrowRight size={12} />
              </a>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px,1fr))", gap: 10 }}>
              {[
                { label: "Total Files", value: result.total_files, icon: FileText, color: "#7C3AED" },
                { label: "Test Files",  value: result.test_files,  icon: Code2,     color: "#3b82f6" },
                { label: "Page Objects",value: result.page_objects, icon: Layers,    color: "#10b981" },
                { label: "Utilities",   value: result.utility_files,icon: Settings,  color: "#f59e0b" },
                { label: "Total Tests", value: result.total_tests,  icon: Zap,       color: "#A78BFA" },
                { label: "Review Hours",value: result.estimated_review_hours, icon: Clock, color: "#6B7280" },
              ].map(({ label, value, icon: Icon, color }) => (
                <div key={label} style={{ background: "#0D1117", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, padding: "14px 16px" }}>
                  <Icon size={14} color={color} style={{ marginBottom: 6 }} />
                  <div style={{ fontSize: 22, fontWeight: 700, color: "#F9FAFB", fontFamily: "monospace", lineHeight: 1 }}>{value}</div>
                  <div style={{ fontSize: 10, color: "#6B7280", marginTop: 3 }}>{label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Framework + Language + Locators */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 18 }}>
            <div style={{ background: "#111827", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: 18 }}>
              <p style={{ fontSize: 10, fontWeight: 700, color: "#4B5563", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12 }}>Framework</p>
              <p style={{ fontSize: 15, fontWeight: 700, color: "#A78BFA", marginBottom: 12 }}>{result.framework}</p>
              {Object.entries(result.framework_breakdown).slice(0, 5).map(([fw, count]) => (
                <Bar key={fw} label={fw} value={count} color="#7C3AED" total={Math.max(...Object.values(result.framework_breakdown))} />
              ))}
            </div>
            <div style={{ background: "#111827", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: 18 }}>
              <p style={{ fontSize: 10, fontWeight: 700, color: "#4B5563", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12 }}>Languages</p>
              <p style={{ fontSize: 15, fontWeight: 700, color: "#F9FAFB", marginBottom: 12 }}>{result.language}</p>
              {Object.entries(result.language_breakdown).map(([lang, count]) => (
                <Bar key={lang} label={lang} value={count} color="#3b82f6" total={result.total_files} />
              ))}
            </div>
            <div style={{ background: "#111827", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: 18 }}>
              <p style={{ fontSize: 10, fontWeight: 700, color: "#4B5563", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12 }}>Locator Quality</p>
              {Object.entries(result.locator_breakdown).length === 0
                ? <p style={{ fontSize: 12, color: "#4B5563" }}>No locators detected</p>
                : Object.entries(result.locator_breakdown).map(([k, pct]) => (
                    <Bar key={k} label={k} value={pct} color={k === "xpath" ? "#f43f5e" : k === "modern" ? "#10b981" : "#f59e0b"} total={100} />
                  ))
              }
            </div>
          </div>

          {/* Complexity + Readiness */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
            <div style={{ background: "#111827", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: 18 }}>
              <p style={{ fontSize: 10, fontWeight: 700, color: "#4B5563", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 14 }}>File Complexity</p>
              <div style={{ display: "flex", gap: 12 }}>
                {(["simple", "medium", "complex"] as const).map(cx => {
                  const count = result.complexity_breakdown[cx];
                  const pct = Math.round(count / result.total_files * 100) || 0;
                  return (
                    <div key={cx} style={{ flex: 1, background: "rgba(255,255,255,0.03)", borderRadius: 9, padding: "12px 10px", textAlign: "center", border: `1px solid ${COMPLEXITY_COLORS[cx]}22` }}>
                      <div style={{ fontSize: 20, fontWeight: 700, color: COMPLEXITY_COLORS[cx], fontFamily: "monospace" }}>{count}</div>
                      <div style={{ fontSize: 10, color: "#6B7280", textTransform: "capitalize", marginTop: 2 }}>{cx}</div>
                      <div style={{ fontSize: 9, color: "#4B5563", marginTop: 2 }}>{pct}%</div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div style={{ background: "#111827", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: 18 }}>
              <p style={{ fontSize: 10, fontWeight: 700, color: "#4B5563", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12 }}>Readiness Analysis</p>
              {result.readiness_breakdown.good.map((g, i) => (
                <div key={i} style={{ display: "flex", gap: 7, alignItems: "flex-start", marginBottom: 6 }}>
                  <CheckCircle size={11} color="#10b981" style={{ marginTop: 1, flexShrink: 0 }} />
                  <span style={{ fontSize: 11, color: "#9CA3AF", lineHeight: 1.4 }}>{g}</span>
                </div>
              ))}
              {result.readiness_breakdown.needs_attention.map((w, i) => (
                <div key={i} style={{ display: "flex", gap: 7, alignItems: "flex-start", marginBottom: 6 }}>
                  <AlertTriangle size={11} color="#f59e0b" style={{ marginTop: 1, flexShrink: 0 }} />
                  <span style={{ fontSize: 11, color: "#9CA3AF", lineHeight: 1.4 }}>{w}</span>
                </div>
              ))}
            </div>
          </div>

          {/* File tree with AI Analyze button */}
          <div style={{ background: "#111827", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, overflow: "hidden" }}>
            <div style={{ padding: "12px 18px", borderBottom: "1px solid rgba(255,255,255,0.05)", display: "flex", alignItems: "center", gap: 8 }}>
              <FolderOpen size={13} color="#7C3AED" />
              <span style={{ fontSize: 12, fontWeight: 600, color: "#F9FAFB" }}>File Details ({result.file_details.length} files)</span>
              <span style={{ marginLeft: "auto", fontSize: 10, color: "#4B5563", display: "flex", alignItems: "center", gap: 5 }}>
                <Sparkles size={10} color="#A78BFA" /> Click a file to run AI analysis
              </span>
            </div>
            <div style={{ maxHeight: 400, overflowY: "auto" }}>
              {result.file_details.map((fd) => {
                const hasAnalysis = !!fileAnalyses[fd.name];
                const isAnalyzing = analyzingFile === fd.name;
                const confScore = fileAnalyses[fd.name]?.migration_confidence_score;
                const conf = fileAnalyses[fd.name]?.migration_confidence;

                return (
                  <div key={fd.name}
                    style={{ padding: "9px 18px", borderBottom: "1px solid rgba(255,255,255,0.04)", display: "flex", alignItems: "center", gap: 10, cursor: "pointer", transition: "background 0.1s" }}
                    onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.02)")}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                  >
                    <File size={11} color={FILE_TYPE_COLORS[fd.type] || "#6B7280"} style={{ flexShrink: 0 }} />
                    <span
                      onClick={() => openAnalysis(fd)}
                      style={{ flex: 1, fontSize: 11, color: "#9CA3AF", fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                    >
                      {fd.name}
                    </span>
                    <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 4, background: `${FILE_TYPE_COLORS[fd.type] || "#6B7280"}22`, color: FILE_TYPE_COLORS[fd.type] || "#6B7280", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", flexShrink: 0 }}>
                      {fd.type.replace("_", " ")}
                    </span>
                    {fd.tests > 0 && <span style={{ fontSize: 9, color: "#7C3AED", fontFamily: "monospace", flexShrink: 0 }}>{fd.tests}t</span>}
                    <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 4, background: `${COMPLEXITY_COLORS[fd.complexity]}18`, color: COMPLEXITY_COLORS[fd.complexity], flexShrink: 0, textTransform: "capitalize" }}>
                      {fd.complexity}
                    </span>

                    {/* Confidence badge if already analysed */}
                    {hasAnalysis && conf && (
                      <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 4, background: `${CONF_COLOR[conf]}12`, color: CONF_COLOR[conf], border: `1px solid ${CONF_COLOR[conf]}30`, fontWeight: 700, textTransform: "uppercase", flexShrink: 0 }}>
                        {confScore}%
                      </span>
                    )}

                    {/* Analyse button */}
                    <button
                      onClick={e => { e.stopPropagation(); openAnalysis(fd); }}
                      disabled={isAnalyzing}
                      title="AI deep analysis"
                      style={{
                        display: "flex", alignItems: "center", gap: 4, padding: "3px 8px", borderRadius: 5, border: "1px solid",
                        borderColor: hasAnalysis ? "rgba(16,185,129,0.3)" : "rgba(167,139,250,0.3)",
                        background: hasAnalysis ? "rgba(16,185,129,0.08)" : "rgba(167,139,250,0.08)",
                        color: hasAnalysis ? "#10b981" : "#A78BFA",
                        fontSize: 9, fontWeight: 700, cursor: isAnalyzing ? "default" : "pointer", flexShrink: 0,
                        opacity: isAnalyzing ? 0.5 : 1,
                      }}
                    >
                      <Sparkles size={9} />
                      {isAnalyzing ? "..." : hasAnalysis ? "Done" : "Analyse"}
                    </button>

                    <ChevronRight size={10} color="#374151" style={{ flexShrink: 0 }} />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* AI Analysis Drawer */}
      {selectedFile && (
        <AnalysisDrawer
          file={selectedFile}
          analysis={fileAnalyses[selectedFile.name] || null}
          loading={analyzingFile === selectedFile.name}
          onClose={() => setSelectedFile(null)}
        />
      )}

      <style>{`
        @keyframes spin    { from { transform: rotate(0deg)  } to { transform: rotate(360deg) } }
        @keyframes pulse   { 0%,100% { opacity:1 } 50% { opacity:0.4 } }
        @keyframes slideIn { from { transform: translateX(100%) } to { transform: translateX(0) } }
      `}</style>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  padding: "10px 14px", borderRadius: 9, fontSize: 13,
  background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)",
  color: "#F9FAFB", outline: "none", width: "100%", boxSizing: "border-box",
};
