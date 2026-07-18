"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { api, type ChatResponse, type Citation } from "@/lib/api";

// ── Types ──────────────────────────────────────────────────────────────────────
interface Message {
  id: string;
  role: "user" | "assistant" | "error";
  content: string;
  citations?: Citation[];
  agent?: string;
  intent?: string;
  timestamp: Date;
}

const AGENTS = [
  { id: "qa_assistant",     label: "QA Assistant",      desc: "General QA knowledge & framework help" },
  { id: "rca",              label: "Root Cause Analysis", desc: "Diagnose failures from logs & history" },
  { id: "flaky_test",       label: "Flaky Test Agent",   desc: "Retry patterns, locator stability" },
  { id: "rtm_builder",      label: "RTM Builder",        desc: "Requirements → Test Case traceability" },
  { id: "coverage_analyzer", label: "Coverage Analyzer", desc: "Find requirements with no tests" },
];

const FILTER_KEYS = ["sprint", "module", "framework", "severity"];

const STARTERS = [
  "Where is the login page implemented in our Playwright repo?",
  "Show all High severity JIRA bugs from Sprint 17",
  "Which requirements have no test coverage?",
  "Why did the login test TC-456 fail in the last run?",
  "How do I migrate from Selenium Page Objects to Playwright?",
];

// ── Helpers ────────────────────────────────────────────────────────────────────
function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function cleanCitation(c: Citation): string {
  if (c.jira) return c.jira;
  if (c.testcase) return c.testcase;
  if (c.filename) return c.line ? `${c.filename}:${c.line}` : c.filename;
  if (c.path) return c.path;
  return c.source;
}

// ── Sub-components ─────────────────────────────────────────────────────────────
function CitationsPanel({ citations }: { citations: Citation[] }) {
  const filtered = citations.filter(
    (c) => c.source || c.filename || c.jira || c.testcase || c.path
  );
  if (!filtered.length) return null;
  return (
    <div className="mt-3 pt-3 border-t border-white/[0.06]">
      <p className="text-[10px] font-bold tracking-widest uppercase text-[#64748B] mb-2">Sources</p>
      <div className="flex flex-wrap gap-2">
        {filtered.map((c, i) => (
          <span
            key={i}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#0D1426] border border-white/[0.08] text-[11px] text-[#94A3B8] font-mono"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-[#3B82F6] flex-shrink-0" />
            {cleanCitation(c)}
          </span>
        ))}
      </div>
    </div>
  );
}

function IntentBadge({ intent }: { intent: string }) {
  const colors: Record<string, string> = {
    code:      "bg-[#3B82F6]/10 text-[#3B82F6] border-[#3B82F6]/20",
    bug:       "bg-red-500/10 text-red-400 border-red-500/20",
    test:      "bg-[#10B981]/10 text-[#10B981] border-[#10B981]/20",
    prd:       "bg-[#8B5CF6]/10 text-[#8B5CF6] border-[#8B5CF6]/20",
    logs:      "bg-amber-500/10 text-amber-400 border-amber-500/20",
    general:   "bg-white/5 text-[#64748B] border-white/10",
    rca:       "bg-red-500/10 text-red-400 border-red-500/20",
    coverage:  "bg-[#10B981]/10 text-[#10B981] border-[#10B981]/20",
    rtm:       "bg-[#22D3EE]/10 text-[#22D3EE] border-[#22D3EE]/20",
    flaky_test:"bg-amber-500/10 text-amber-400 border-amber-500/20",
  };
  const cls = colors[intent] ?? colors.general;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wide uppercase border ${cls}`}>
      {intent}
    </span>
  );
}

function UserBubble({ msg }: { msg: Message }) {
  return (
    <div className="flex justify-end gap-3 group">
      <div className="max-w-[72%]">
        <div className="bg-[#2563EB] text-white rounded-2xl rounded-tr-sm px-4 py-3 text-sm leading-relaxed">
          {msg.content}
        </div>
        <p className="text-[10px] text-[#475569] mt-1 text-right">
          {msg.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </p>
      </div>
      <div className="w-7 h-7 rounded-full bg-[#2563EB] flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0 mt-1">
        U
      </div>
    </div>
  );
}

function AssistantBubble({ msg }: { msg: Message }) {
  return (
    <div className="flex gap-3 group">
      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#3B82F6] to-[#8B5CF6] flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0 mt-1">
        QA
      </div>
      <div className="max-w-[80%] flex-1">
        <div className="flex items-center gap-2 mb-1.5">
          {msg.intent && <IntentBadge intent={msg.intent} />}
          {msg.agent && (
            <span className="text-[10px] text-[#475569]">
              {AGENTS.find((a) => a.id === msg.agent)?.label ?? msg.agent}
            </span>
          )}
        </div>
        <div className="bg-[#0D1426] border border-white/[0.07] rounded-2xl rounded-tl-sm px-4 py-3 text-sm text-[#CBD5E1] leading-relaxed whitespace-pre-wrap">
          {msg.content}
          {msg.citations && <CitationsPanel citations={msg.citations} />}
        </div>
        <p className="text-[10px] text-[#475569] mt-1">
          {msg.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </p>
      </div>
    </div>
  );
}

function ErrorBubble({ msg }: { msg: Message }) {
  return (
    <div className="flex justify-center">
      <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm max-w-lg">
        <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        {msg.content}
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex gap-3">
      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#3B82F6] to-[#8B5CF6] flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">
        QA
      </div>
      <div className="bg-[#0D1426] border border-white/[0.07] rounded-2xl rounded-tl-sm px-4 py-3">
        <div className="flex gap-1.5 items-center h-4">
          <div className="w-1.5 h-1.5 rounded-full bg-[#3B82F6] animate-bounce" style={{ animationDelay: "0ms" }} />
          <div className="w-1.5 h-1.5 rounded-full bg-[#3B82F6] animate-bounce" style={{ animationDelay: "150ms" }} />
          <div className="w-1.5 h-1.5 rounded-full bg-[#3B82F6] animate-bounce" style={{ animationDelay: "300ms" }} />
        </div>
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function ChatPage() {
  const [messages, setMessages]     = useState<Message[]>([]);
  const [input, setInput]           = useState("");
  const [agent, setAgent]           = useState("qa_assistant");
  const [loading, setLoading]       = useState(false);
  const [filters, setFilters]       = useState<Record<string, string>>({});
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [agentOpen, setAgentOpen]   = useState(false);
  const bottomRef  = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll on new message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 140) + "px";
  }, [input]);

  const currentAgent = AGENTS.find((a) => a.id === agent) ?? AGENTS[0];

  const sendMessage = useCallback(async (text?: string) => {
    const query = (text ?? input).trim();
    if (!query || loading) return;

    setInput("");
    setLoading(true);

    const userMsg: Message = {
      id: uid(), role: "user", content: query, timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);

    try {
      const activeFilters = Object.fromEntries(
        Object.entries(filters).filter(([, v]) => v.trim())
      );
      const res: ChatResponse = await api.chat(
        query,
        agent,
        Object.keys(activeFilters).length ? activeFilters : undefined,
      );
      const aiMsg: Message = {
        id: uid(),
        role: "assistant",
        content: res.answer,
        citations: res.citations,
        agent: res.agent_id,
        intent: res.intent,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, aiMsg]);
    } catch (err) {
      const errMsg: Message = {
        id: uid(),
        role: "error",
        content: err instanceof Error
          ? err.message.includes("500")
            ? "Backend error — check that at least one LLM API key is set in backend/.env"
            : err.message
          : "Something went wrong. Please try again.",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errMsg]);
    } finally {
      setLoading(false);
      textareaRef.current?.focus();
    }
  }, [input, loading, agent, filters]);

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const setFilter = (key: string, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const clearFilter = (key: string) => {
    setFilters((prev) => { const n = { ...prev }; delete n[key]; return n; });
  };

  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  return (
    <div className="flex flex-col h-screen bg-[#080C18]">

      {/* ── Top Bar ─────────────────────────────────────────────────────── */}
      <header className="flex items-center gap-4 px-6 py-3 border-b border-white/[0.06] bg-[#080C18]/95 backdrop-blur-sm flex-shrink-0">
        <Link
          href="/"
          className="flex items-center gap-2 text-[#475569] hover:text-[#94A3B8] transition-colors text-sm"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Dashboard
        </Link>

        <div className="w-px h-5 bg-white/[0.08]" />

        {/* Agent selector */}
        <div className="relative">
          <button
            onClick={() => setAgentOpen((o) => !o)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#0D1426] border border-white/[0.08] hover:border-white/20 transition-colors text-sm"
          >
            <span className="w-2 h-2 rounded-full bg-[#10B981]" />
            <span className="text-[#F1F5F9] font-medium">{currentAgent.label}</span>
            <svg className={`w-3.5 h-3.5 text-[#475569] transition-transform ${agentOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {agentOpen && (
            <div className="absolute top-full left-0 mt-1.5 w-72 bg-[#0D1426] border border-white/[0.1] rounded-xl shadow-2xl shadow-black/50 z-50 overflow-hidden">
              {AGENTS.map((a) => (
                <button
                  key={a.id}
                  onClick={() => { setAgent(a.id); setAgentOpen(false); }}
                  className={`w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-white/[0.04] transition-colors ${a.id === agent ? "bg-[#3B82F6]/10" : ""}`}
                >
                  <span className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${a.id === agent ? "bg-[#3B82F6]" : "bg-[#334155]"}`} />
                  <div>
                    <p className={`text-sm font-semibold ${a.id === agent ? "text-[#3B82F6]" : "text-[#F1F5F9]"}`}>{a.label}</p>
                    <p className="text-xs text-[#64748B] mt-0.5">{a.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Filter button */}
        <button
          onClick={() => setActiveFilter(activeFilter ? null : FILTER_KEYS[0])}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm transition-colors ${
            activeFilterCount > 0
              ? "bg-[#3B82F6]/10 border-[#3B82F6]/30 text-[#3B82F6]"
              : "bg-[#0D1426] border-white/[0.08] text-[#94A3B8] hover:border-white/20"
          }`}
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
          </svg>
          Filters
          {activeFilterCount > 0 && (
            <span className="px-1.5 py-0.5 rounded-md bg-[#3B82F6] text-white text-[10px] font-bold">
              {activeFilterCount}
            </span>
          )}
        </button>

        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs text-[#334155]">{messages.length} messages</span>
          {messages.length > 0 && (
            <button
              onClick={() => setMessages([])}
              className="text-xs text-[#475569] hover:text-[#94A3B8] transition-colors"
            >
              Clear
            </button>
          )}
        </div>
      </header>

      {/* ── Filter Bar ────────────────────────────────────────────────────── */}
      {activeFilter !== null && (
        <div className="flex items-center gap-3 px-6 py-3 border-b border-white/[0.06] bg-[#0A0F1C] flex-shrink-0 flex-wrap">
          {FILTER_KEYS.map((key) => (
            <div key={key} className="flex items-center gap-2">
              <label className="text-xs text-[#64748B] uppercase tracking-wide font-semibold">{key}</label>
              <input
                type="text"
                placeholder={`e.g. ${key === "sprint" ? "Sprint-17" : key === "module" ? "login" : key === "framework" ? "playwright" : "high"}`}
                value={filters[key] ?? ""}
                onChange={(e) => setFilter(key, e.target.value)}
                className="bg-[#0D1426] border border-white/[0.08] rounded-lg px-2.5 py-1 text-xs text-[#F1F5F9] placeholder-[#334155] focus:outline-none focus:border-[#3B82F6]/50 w-28"
              />
              {filters[key] && (
                <button onClick={() => clearFilter(key)} className="text-[#475569] hover:text-[#94A3B8]">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Message Thread ────────────────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center gap-6">
            <div>
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#3B82F6] to-[#8B5CF6] flex items-center justify-center mx-auto mb-4 text-white font-black text-lg">
                QA
              </div>
              <h2 className="text-xl font-bold text-[#F1F5F9] mb-1">{currentAgent.label}</h2>
              <p className="text-sm text-[#64748B]">{currentAgent.desc}</p>
            </div>
            <div className="grid grid-cols-1 gap-2 w-full max-w-lg">
              {STARTERS.map((s) => (
                <button
                  key={s}
                  onClick={() => sendMessage(s)}
                  className="text-left px-4 py-2.5 rounded-xl bg-[#0D1426] border border-white/[0.07] hover:border-[#3B82F6]/30 hover:bg-[#0D1426]/80 transition-all text-sm text-[#94A3B8] hover:text-[#F1F5F9]"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) =>
          msg.role === "user"      ? <UserBubble key={msg.id} msg={msg} /> :
          msg.role === "assistant" ? <AssistantBubble key={msg.id} msg={msg} /> :
                                     <ErrorBubble key={msg.id} msg={msg} />
        )}

        {loading && <TypingIndicator />}
        <div ref={bottomRef} />
      </main>

      {/* ── Input Bar ─────────────────────────────────────────────────────── */}
      <footer className="flex-shrink-0 px-6 py-4 border-t border-white/[0.06] bg-[#080C18]">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-end gap-3 bg-[#0D1426] border border-white/[0.1] rounded-2xl px-4 py-3 focus-within:border-[#3B82F6]/40 transition-colors">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder={`Ask ${currentAgent.label}… (Enter to send, Shift+Enter for newline)`}
              rows={1}
              className="flex-1 bg-transparent text-sm text-[#F1F5F9] placeholder-[#334155] resize-none focus:outline-none leading-relaxed max-h-36"
              style={{ minHeight: "24px" }}
            />
            <button
              onClick={() => sendMessage()}
              disabled={!input.trim() || loading}
              className="flex-shrink-0 w-9 h-9 rounded-xl bg-gradient-to-br from-[#3B82F6] to-[#8B5CF6] flex items-center justify-center text-white disabled:opacity-30 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
            >
              {loading ? (
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              )}
            </button>
          </div>
          <p className="text-[11px] text-[#334155] text-center mt-2">
            Hybrid retrieval · Intent routing · bge-m3 embeddings · bge-reranker · Citations
          </p>
        </div>
      </footer>

      {/* Click outside to close agent dropdown */}
      {agentOpen && (
        <div className="fixed inset-0 z-40" onClick={() => setAgentOpen(false)} />
      )}
    </div>
  );
}
