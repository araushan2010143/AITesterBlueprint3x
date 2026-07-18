"use client";
import { useState } from "react";
import Link from "next/link";
import { api, type Citation } from "@/lib/api";
import { KNOWLEDGE_BASE } from "@/lib/collections";
import { AppShell } from "@/components/AppShell";
import { showToast } from "@/components/Toast";

// ── Agent definitions ──────────────────────────────────────────────────────────
const AGENTS = [
  {
    id:          "qa_assistant",
    name:        "QA Assistant",
    tagline:     "General QA knowledge & framework guidance",
    description: "Ask anything about your frameworks, test design, best practices, or automation patterns. Searches Selenium, Playwright, test cases, and company docs.",
    placeholder: "e.g. How do I implement Page Object Model in Playwright?",
    accent:      "#3B82F6",
    collections: ["selenium", "playwright", "testcases", "company_docs"],
    examples:    ["How do I set up Playwright BDD?", "Best retry strategy for flaky tests"],
  },
  {
    id:          "rca",
    name:        "Root Cause Analysis",
    tagline:     "Diagnose failures from logs, commits & history",
    description: "Paste a stack trace, describe a failure, or give a build number. The agent correlates logs, JIRA tickets, and code history to find probable root cause.",
    placeholder: "e.g. Build #4521 failed — NullPointerException in LoginPage after Friday's deploy",
    accent:      "#EF4444",
    collections: ["logs", "jira", "selenium", "playwright"],
    examples:    ["Why did build 4521 fail?", "NullPointerException in checkout flow"],
  },
  {
    id:          "flaky_test",
    name:        "Flaky Test Agent",
    tagline:     "Identify retry patterns & locator instability",
    description: "Describe a test that fails intermittently. The agent analyses retry patterns, timing issues, and locator fragility to surface the root instability.",
    placeholder: "e.g. TC-234 fails 30% of the time on the payment step — passes locally",
    accent:      "#F59E0B",
    collections: ["testcases", "selenium", "playwright", "jira"],
    examples:    ["TC-234 flaky on payment page", "Login test fails on CI but passes locally"],
  },
  {
    id:          "rtm_builder",
    name:        "RTM Builder",
    tagline:     "Requirements → Test Case traceability matrix",
    description: "Give a feature name or requirement ID. The agent maps existing test cases to requirements and flags gaps where no test coverage exists.",
    placeholder: "e.g. Generate RTM for VWO A/B test setup feature",
    accent:      "#10B981",
    collections: ["testcases", "prd", "jira", "company_docs"],
    examples:    ["RTM for A/B test feature", "Map FR-1 requirements to test cases"],
  },
  {
    id:          "coverage_analyzer",
    name:        "Coverage Analyzer",
    tagline:     "Find requirements with no test coverage",
    description: "Name a module, sprint, or feature. The agent cross-references requirements against existing test cases and produces a gap report with priorities.",
    placeholder: "e.g. Review test coverage gaps for the VWO personalization module",
    accent:      "#8B5CF6",
    collections: ["testcases", "prd", "jira"],
    examples:    ["Coverage gaps for personalization module", "Which FR requirements have no tests?"],
  },
];

// ── Citation row ───────────────────────────────────────────────────────────────
function CitationRow({ citations }: { citations: Citation[] }) {
  const rows = citations.filter(c => c.source || c.filename || c.jira);
  if (!rows.length) return null;
  const label = (c: Citation) => c.jira || c.filename || c.path || c.source;
  const color = (c: Citation) => KNOWLEDGE_BASE.find(k => k.name === c.source)?.color ?? "#C2391B";
  return (
    <div className="mt-3 pt-3 border-t border-stone-100">
      <p className="text-[10px] tracking-widest uppercase text-stone-400 mb-1.5"
         style={{ fontFamily: "Courier New, monospace" }}>
        sources
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

// ── Agent card ─────────────────────────────────────────────────────────────────
function AgentCard({ agent }: { agent: typeof AGENTS[0] }) {
  const [input,   setInput]   = useState("");
  const [result,  setResult]  = useState<{ answer: string; citations: Citation[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");
  const [open,    setOpen]    = useState(false);

  async function run(q?: string) {
    const query = (q ?? input).trim();
    if (!query || loading) return;
    setInput(q ?? input);
    setOpen(true);
    setLoading(true);
    setResult(null);
    setError("");
    try {
      const res = await api.chat(query, agent.id, undefined, []);
      setResult({ answer: res.answer, citations: res.citations });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Agent failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-white border rounded-xl shadow-sm overflow-hidden"
         style={{ borderColor: "#D6D1C8" }}>

      {/* Card header */}
      <div className="flex items-start gap-3 p-5 pb-4">
        {/* Accent bar */}
        <div className="w-1 rounded-full self-stretch flex-shrink-0" style={{ background: agent.accent }} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-0.5">
            <h3 className="text-[15px] font-bold text-stone-900"
                style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}>
              {agent.name}
            </h3>
            <span className="text-[10px] px-2 py-0.5 rounded-full border flex-shrink-0"
                  style={{ fontFamily: "Courier New, monospace", borderColor: `${agent.accent}40`, color: agent.accent, background: `${agent.accent}10` }}>
              {agent.id}
            </span>
          </div>
          <p className="text-[12px] text-stone-500 mb-2">{agent.tagline}</p>
          <p className="text-[12px] text-stone-400 leading-relaxed">{agent.description}</p>

          {/* Collections it searches */}
          <div className="flex flex-wrap gap-1 mt-3">
            {agent.collections.map(name => {
              const kb = KNOWLEDGE_BASE.find(k => k.name === name);
              if (!kb) return null;
              return (
                <span key={name}
                  className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border text-stone-400"
                  style={{ borderColor: "#D6D1C8", fontFamily: "Courier New, monospace" }}>
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: kb.color }} />
                  {kb.label}
                </span>
              );
            })}
          </div>
        </div>
      </div>

      {/* Input area */}
      <div className="px-5 pb-4 border-t" style={{ borderColor: "#F0EDE7" }}>
        <div className="flex gap-2 mt-4">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && run()}
            placeholder={agent.placeholder}
            className="flex-1 bg-stone-50 border rounded-lg px-3 py-2 text-[13px] text-stone-700 placeholder-stone-300 focus:outline-none focus:border-stone-400 transition-colors"
            style={{ borderColor: "#D6D1C8" }}
          />
          <button
            onClick={() => run()}
            disabled={!input.trim() || loading}
            className="px-4 py-2 rounded-lg text-[12px] font-medium text-white disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-opacity flex-shrink-0"
            style={{ background: agent.accent }}>
            {loading ? (
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : "Run"}
          </button>
        </div>

        {/* Example prompts */}
        {!result && !loading && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {agent.examples.map(ex => (
              <button key={ex}
                onClick={() => run(ex)}
                className="text-[11px] px-2.5 py-1 rounded-full border text-stone-500 hover:text-stone-700 hover:border-stone-400 transition-colors bg-stone-50"
                style={{ borderColor: "#D6D1C8" }}>
                {ex}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Result */}
      {(loading || result || error) && (
        <div className="px-5 pb-5 border-t" style={{ borderColor: "#F0EDE7" }}>
          <div className="mt-4">
            {loading && (
              <div className="space-y-2.5 animate-pulse">
                {[1, 0.85, 0.7, 0.55].map((w, i) => (
                  <div key={i} className="h-3 bg-stone-100 rounded" style={{ width: `${w * 100}%` }} />
                ))}
              </div>
            )}
            {error && (
              <p className="text-[12px] text-red-500 flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {error}
              </p>
            )}
            {result && !loading && (
              <div>
                <p className="text-[13px] text-stone-700 leading-relaxed whitespace-pre-wrap">
                  {result.answer}
                </p>
                <CitationRow citations={result.citations} />
                <div className="mt-3 flex items-center justify-between">
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(result.answer).then(() => showToast("Copied to clipboard"));
                    }}
                    className="text-[10px] text-stone-400 hover:text-stone-600 transition-colors"
                    style={{ fontFamily: "Courier New, monospace" }}>
                    copy
                  </button>
                  <button
                    onClick={() => { setResult(null); setInput(""); setError(""); }}
                    className="text-[10px] text-stone-400 hover:text-stone-600 transition-colors"
                    style={{ fontFamily: "Courier New, monospace" }}>
                    clear
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function AgentsPage() {
  const agentSidebar = (
    <>
      {/* Agent list */}
      <div className="px-5 pt-4 pb-3">
        <p className="text-[10px] tracking-widest uppercase text-stone-400 mb-3"
           style={{ fontFamily: "Courier New, monospace" }}>
          Available Agents
        </p>
        <ul className="space-y-2.5">
          {AGENTS.map(a => (
            <li key={a.id} className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: a.accent }} />
              <div>
                <p className="text-[13px] text-stone-700 font-medium leading-tight">{a.name}</p>
                <p className="text-[10px] text-stone-400 leading-tight">{a.tagline}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
      <div className="border-t" style={{ borderColor: "#D6D1C8" }} />
      <div className="px-5 py-3">
        <p className="text-[10px]" style={{ fontFamily: "Courier New, monospace", color: "#A8A29E" }}>
          <span style={{ color: "#78716C" }}>llm</span> groq llama-3.3-70b
        </p>
      </div>
    </>
  );

  return (
    <AppShell sidebar={agentSidebar}>
      {/* ── Main ─────────────────────────────────────────────────────────────── */}
      <div className="flex flex-col flex-1 min-w-0 h-full">

        <header className="flex items-center justify-between px-8 py-3 border-b flex-shrink-0"
                style={{ background: "#F5F3EE", borderColor: "#D6D1C8" }}>
          <p className="text-xs text-stone-400" style={{ fontFamily: "Courier New, monospace" }}>
            RTM Builder · Coverage Analyzer · Flaky Test Agent · RCA Agent
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
                AI Agents
              </h2>
              <p className="text-[14px] text-stone-500 leading-relaxed max-w-lg">
                Five specialised agents — each sharing the same knowledge layer.
                Run any one inline, or switch to{" "}
                <Link href="/chat" className="font-medium underline underline-offset-2 hover:text-stone-700 transition-colors"
                      style={{ color: "#C2391B" }}>
                  Chat
                </Link>
                {" "}to let{" "}
                <span className="font-medium" style={{ color: "#C2391B" }}>auto-detect</span>
                {" "}choose the right one.
              </p>
            </div>

            {/* Agent cards */}
            <div className="space-y-4">
              {AGENTS.map(agent => (
                <AgentCard key={agent.id} agent={agent} />
              ))}
            </div>
          </div>
        </main>
      </div>
    </AppShell>
  );
}
