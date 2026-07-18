"use client";
import { useState, useRef, useEffect } from "react";
import { api, type Citation } from "@/lib/api";
import { KNOWLEDGE_BASE } from "@/lib/collections";
import { AppShell } from "@/components/AppShell";
import { showToast } from "@/components/Toast";

// ── Types ──────────────────────────────────────────────────────────────────────
interface RCAResult {
  answer: string;
  citations: Citation[];
  intent: string;
}

interface RCAEntry {
  id: string;
  query: string;
  answer: string;
  citations: Citation[];
  intent: string;
  savedAt: string;
}

// ── Persistence ────────────────────────────────────────────────────────────────
const RCA_KEY = "qa_buddy_rca_history";
const MAX_RCA = 10;

function uid() { return Math.random().toString(36).slice(2, 10); }

function loadRCAHistory(): RCAEntry[] {
  try { return JSON.parse(localStorage.getItem(RCA_KEY) ?? "[]"); }
  catch { return []; }
}

function saveRCAEntry(query: string, result: RCAResult): RCAEntry[] {
  const entry: RCAEntry = {
    id: uid(),
    query: query.slice(0, 80),
    answer: result.answer,
    citations: result.citations,
    intent: result.intent,
    savedAt: new Date().toISOString(),
  };
  const updated = [entry, ...loadRCAHistory()].slice(0, MAX_RCA);
  localStorage.setItem(RCA_KEY, JSON.stringify(updated));
  return updated;
}

// ── Citation row ───────────────────────────────────────────────────────────────
function CitationRow({ citations }: { citations: Citation[] }) {
  const rows = citations.filter(c => c.source || c.filename || c.path || c.jira);
  if (!rows.length) return null;
  const label = (c: Citation) => c.jira || c.filename || c.path || c.source;
  const color = (c: Citation) => KNOWLEDGE_BASE.find(k => k.name === c.source)?.color ?? "#C2391B";
  return (
    <div className="mt-4 pt-4 border-t border-stone-200">
      <p className="text-[10px] tracking-widest uppercase text-stone-400 mb-2"
         style={{ fontFamily: "Courier New, monospace" }}>
        evidence sources
      </p>
      <div className="flex flex-wrap gap-1.5">
        {rows.map((c, i) => (
          <span key={i}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-stone-50 border border-stone-200 text-[11px] text-stone-500 font-mono">
            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: color(c) }} />
            {label(c)}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Context chip ───────────────────────────────────────────────────────────────
function ContextField({
  label, placeholder, value, onChange,
}: { label: string; placeholder: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] tracking-widest uppercase text-stone-400"
             style={{ fontFamily: "Courier New, monospace" }}>
        {label}
      </label>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="bg-stone-50 border rounded-lg px-3 py-1.5 text-[13px] text-stone-700 placeholder-stone-300 focus:outline-none focus:border-stone-400 transition-colors"
        style={{ borderColor: "#D6D1C8" }}
      />
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────────
export default function RCAPage() {
  const [failure,   setFailure]   = useState("");
  const [buildNo,   setBuildNo]   = useState("");
  const [component, setComponent] = useState("");
  const [branch,    setBranch]    = useState("");
  const [result,    setResult]    = useState<RCAResult | null>(null);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState("");
  const [copied,    setCopied]    = useState(false);
  const [history,   setHistory]   = useState<RCAEntry[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setHistory(loadRCAHistory());
  }, []);

  const canRun = failure.trim().length > 10 && !loading;

  async function runRCA() {
    if (!canRun) return;
    setLoading(true);
    setResult(null);
    setError("");

    const parts = [failure.trim()];
    if (buildNo)   parts.push(`Jenkins build: ${buildNo}`);
    if (component) parts.push(`Component: ${component}`);
    if (branch)    parts.push(`Branch: ${branch}`);
    const query = parts.join("\n");

    try {
      const res = await api.chat(query, "rca", undefined, []);
      const newResult = { answer: res.answer, citations: res.citations, intent: res.intent };
      setResult(newResult);
      setHistory(saveRCAEntry(failure.trim(), newResult));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed. Check backend logs.");
    } finally {
      setLoading(false);
    }
  }

  function copyResult() {
    if (!result) return;
    navigator.clipboard.writeText(result.answer).then(() => {
      setCopied(true);
      showToast("Copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function copyAsJira() {
    if (!result) return;
    const sources = result.citations
      .filter(c => c.jira || c.filename || c.source)
      .map(c => `• ${c.jira || c.filename || c.source}`)
      .join("\n");
    const jira = `*Root Cause Analysis*\n\n${result.answer}${sources ? `\n\n*Evidence:*\n${sources}` : ""}`;
    navigator.clipboard.writeText(jira).then(() => {
      showToast("Copied as JIRA comment format");
    });
  }

  function restoreEntry(entry: RCAEntry) {
    setFailure(entry.query);
    setResult({ answer: entry.answer, citations: entry.citations, intent: entry.intent });
    setError("");
  }

  const rcaSidebar = (
    <>
        {/* Pipeline */}
        <div className="px-5 py-5">
          <p className="text-[10px] tracking-widest uppercase text-stone-400 mb-3"
             style={{ fontFamily: "Courier New, monospace" }}>
            RCA Pipeline
          </p>
          <ol className="space-y-3">
            {[
              { n: 1, label: "Logs",     desc: "stack traces, error output" },
              { n: 2, label: "Commits",  desc: "recent code changes" },
              { n: 3, label: "JIRA",     desc: "linked tickets & history" },
              { n: 4, label: "Diagnose", desc: "probable root cause + fix" },
            ].map(({ n, label, desc }) => (
              <li key={n} className="flex gap-3 items-start">
                <span className="w-5 h-5 rounded-full border-2 flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5"
                      style={{ borderColor: "#C2391B", color: "#C2391B" }}>
                  {n}
                </span>
                <div>
                  <p className="text-[12px] font-semibold text-stone-700">{label}</p>
                  <p className="text-[10px] text-stone-400">{desc}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>

        <div className="border-t" style={{ borderColor: "#D6D1C8" }} />

        {/* Relevant collections */}
        <div className="px-5 py-4">
          <p className="text-[10px] tracking-widest uppercase text-stone-400 mb-2"
             style={{ fontFamily: "Courier New, monospace" }}>
            Searches
          </p>
          {["logs", "jira", "selenium", "playwright"].map(name => {
            const kb = KNOWLEDGE_BASE.find(k => k.name === name);
            if (!kb) return null;
            return (
              <div key={name} className="flex items-center gap-2 py-1">
                <span className="w-2 h-2 rounded-full" style={{ background: kb.color }} />
                <span className="text-[12px] text-stone-600">{kb.label}</span>
              </div>
            );
          })}
        </div>

        {/* Recent Diagnoses */}
        {history.length > 0 && (
          <>
            <div className="border-t" style={{ borderColor: "#D6D1C8" }} />
            <div className="px-5 py-4">
              <p className="text-[10px] tracking-widest uppercase text-stone-400 mb-2"
                 style={{ fontFamily: "Courier New, monospace" }}>
                Recent Diagnoses
              </p>
              <ul className="space-y-0.5">
                {history.slice(0, 6).map(entry => (
                  <li key={entry.id}>
                    <button
                      onClick={() => restoreEntry(entry)}
                      title={entry.query}
                      className="w-full text-left px-2 py-1.5 rounded-lg text-[11px] truncate text-stone-500 hover:bg-stone-200 hover:text-stone-800 transition-colors"
                      style={{ fontFamily: "Courier New, monospace" }}>
                      {entry.query}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
    </>
  );

  return (
    <AppShell sidebar={rcaSidebar}>
      {/* ── Main ─────────────────────────────────────────────────────────────── */}
      <div className="flex flex-col flex-1 min-w-0 h-full">

        <header className="flex items-center justify-between px-8 py-3 border-b flex-shrink-0"
                style={{ background: "#F5F3EE", borderColor: "#D6D1C8" }}>
          <p className="text-xs text-stone-400" style={{ fontFamily: "Courier New, monospace" }}>
            logs · commits · JIRA · history
            <span className="mx-1.5" style={{ color: "#C8C3BA" }}>→</span>
            probable root cause + evidence chain
          </p>
          <span className="flex items-center gap-1.5 text-[11px] text-stone-500"
                style={{ fontFamily: "Courier New, monospace" }}>
            <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
            online
          </span>
        </header>

        <main className="flex-1 overflow-y-auto px-8 py-8">
          <div className="max-w-2xl mx-auto">

            {/* Hero */}
            <div className="mb-8">
              <div className="text-3xl mb-3 select-none" style={{ color: "#C2391B" }}>✳</div>
              <h2 className="text-4xl font-bold text-stone-900 mb-2"
                  style={{ fontFamily: "Georgia, 'Times New Roman', serif", letterSpacing: "-0.02em" }}>
                Root Cause Analysis
              </h2>
              <p className="text-[14px] text-stone-500 leading-relaxed max-w-lg">
                Paste a stack trace, describe a failure, or give a Jenkins build number.
                The agent searches logs, JIRA tickets, commit history, and your framework
                code to produce a <span className="font-medium" style={{ color: "#C2391B" }}>cited</span> diagnosis.
              </p>
            </div>

            {/* Input form */}
            <div className="bg-white border rounded-xl p-5 shadow-sm mb-5"
                 style={{ borderColor: "#D6D1C8" }}>
              <p className="text-[10px] tracking-widest uppercase text-stone-400 mb-3"
                 style={{ fontFamily: "Courier New, monospace" }}>
                Failure Description
              </p>
              <textarea
                ref={textareaRef}
                value={failure}
                onChange={e => setFailure(e.target.value)}
                placeholder={`Describe the failure, paste a stack trace, or give a build number…\n\ne.g. "Build #4521 failed — NullPointerException in LoginPage.java:47 after the auth middleware change on Friday"`}
                rows={6}
                className="w-full bg-stone-50 border rounded-lg px-3 py-2.5 text-[13px] text-stone-700 placeholder-stone-300 focus:outline-none focus:border-stone-400 transition-colors resize-none leading-relaxed"
                style={{ borderColor: "#D6D1C8" }}
              />

              {/* Optional context */}
              <div className="grid grid-cols-3 gap-3 mt-3">
                <ContextField label="Build #"   placeholder="e.g. 4521"    value={buildNo}   onChange={setBuildNo} />
                <ContextField label="Component" placeholder="e.g. login"   value={component} onChange={setComponent} />
                <ContextField label="Branch"    placeholder="e.g. main"    value={branch}    onChange={setBranch} />
              </div>

              <div className="flex items-center justify-between mt-4">
                <p className="text-[11px] text-stone-400">
                  {failure.length < 10 ? "Add more detail for a better diagnosis" : `${failure.length} chars`}
                </p>
                <button
                  onClick={runRCA}
                  disabled={!canRun}
                  className="px-5 py-2 rounded-xl text-[13px] font-medium text-white disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
                  style={{ background: "#1C1917" }}>
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Analysing…
                    </span>
                  ) : "Analyse"}
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-start gap-2 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-600 text-[13px] mb-5">
                <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {error}
              </div>
            )}

            {/* Loading */}
            {loading && (
              <div className="bg-white border rounded-xl p-5 shadow-sm animate-pulse"
                   style={{ borderColor: "#D6D1C8" }}>
                <div className="flex gap-2 items-center mb-4">
                  <div className="w-6 h-6 rounded-full bg-stone-100" />
                  <div className="w-40 h-3 bg-stone-100 rounded" />
                </div>
                {[1, 0.85, 0.7, 0.5].map((w, i) => (
                  <div key={i} className="h-3 bg-stone-100 rounded mb-2.5" style={{ width: `${w * 100}%` }} />
                ))}
              </div>
            )}

            {/* Result */}
            {result && !loading && (
              <div className="bg-white border rounded-xl p-5 shadow-sm" style={{ borderColor: "#D6D1C8" }}>
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-[#C2391B] text-lg select-none">✳</span>
                  <p className="text-[10px] tracking-widest uppercase text-stone-400"
                     style={{ fontFamily: "Courier New, monospace" }}>
                    Root Cause
                  </p>
                  {result.intent && (
                    <span className="ml-auto text-[10px] px-2 py-0.5 rounded border text-stone-400"
                          style={{ fontFamily: "Courier New, monospace", borderColor: "#D6D1C8" }}>
                      {result.intent}
                    </span>
                  )}
                </div>
                <div className="text-[14px] text-stone-700 leading-relaxed whitespace-pre-wrap">
                  {result.answer}
                </div>
                <CitationRow citations={result.citations} />
                <div className="mt-4 pt-4 border-t border-stone-100 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-4">
                    <button
                      onClick={copyResult}
                      className="text-[11px] text-stone-400 hover:text-stone-600 transition-colors"
                      style={{ fontFamily: "Courier New, monospace" }}>
                      {copied ? "✓ copied" : "copy"}
                    </button>
                    <button
                      onClick={copyAsJira}
                      className="text-[11px] text-stone-400 hover:text-stone-600 transition-colors"
                      style={{ fontFamily: "Courier New, monospace" }}>
                      copy as JIRA
                    </button>
                  </div>
                  <button
                    onClick={() => { setResult(null); setFailure(""); setCopied(false); textareaRef.current?.focus(); }}
                    className="text-[11px] text-stone-400 hover:text-stone-600 transition-colors"
                    style={{ fontFamily: "Courier New, monospace" }}>
                    clear &amp; start over
                  </button>
                </div>
              </div>
            )}

          </div>
        </main>
      </div>
    </AppShell>
  );
}
