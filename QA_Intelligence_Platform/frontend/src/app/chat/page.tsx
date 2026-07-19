"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import { api, type ChatResponse, type Citation } from "@/lib/api";
import { KNOWLEDGE_BASE, MODES, STARTERS, type KBCollection } from "@/lib/collections";
import { AppShell } from "@/components/AppShell";
import { showToast } from "@/components/Toast";

// ── Runtime state for a collection ────────────────────────────────────────────
interface CollectionState extends KBCollection {
  points: number;
  checked: boolean;
}

// ── Message ────────────────────────────────────────────────────────────────────
interface Message {
  id: string;
  role: "user" | "assistant" | "error";
  content: string;
  citations?: Citation[];
  intent?: string;
  mode?: string;
  elapsed?: number;
  timestamp: Date;
}

// ── Conversation history ──────────────────────────────────────────────────────
interface ConvSession {
  id: string;
  title: string;
  messages: (Omit<Message, "timestamp"> & { timestamp: string })[];
  savedAt: string;
}

const CONV_KEY = "qa_buddy_conversations";
const MAX_SESSIONS = 15;

function loadConversations(): ConvSession[] {
  try { return JSON.parse(localStorage.getItem(CONV_KEY) ?? "[]"); }
  catch { return []; }
}

function persistConversation(sessionId: string, messages: Message[]): ConvSession[] {
  if (!messages.length) return loadConversations();
  const firstUser = messages.find(m => m.role === "user");
  if (!firstUser) return loadConversations();
  const session: ConvSession = {
    id: sessionId,
    title: firstUser.content.slice(0, 60),
    messages: messages.map(m => ({ ...m, timestamp: m.timestamp.toISOString() })),
    savedAt: new Date().toISOString(),
  };
  const existing = loadConversations().filter(s => s.id !== sessionId);
  const updated = [session, ...existing].slice(0, MAX_SESSIONS);
  localStorage.setItem(CONV_KEY, JSON.stringify(updated));
  return updated;
}

function deserializeMessages(raw: ConvSession["messages"]): Message[] {
  return raw.map(m => ({ ...m, timestamp: new Date(m.timestamp) }));
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

// ── Citation cards ─────────────────────────────────────────────────────────────
function CitationCards({ citations }: { citations: Citation[] }) {
  const rows = citations.filter(c => c.source || c.filename || c.path || c.jira);
  if (!rows.length) return null;

  return (
    <div className="mt-4 pt-4 border-t border-stone-100">
      <p className="text-[9px] tracking-widest uppercase text-stone-400 mb-2"
         style={{ fontFamily: "Courier New, monospace" }}>
        Sources
      </p>
      <div className="space-y-1.5">
        {rows.map((c, i) => {
          const kb     = KNOWLEDGE_BASE.find(k => k.name === c.source);
          const color  = kb?.color ?? "#C2391B";
          const badge  = (kb?.label ?? c.source ?? "").toUpperCase();
          const title  = c.jira || c.testcase || c.filename || c.path || c.source || "";
          return (
            <div key={i}
                 className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-stone-50 border border-stone-100"
                 style={{ borderLeftColor: color, borderLeftWidth: "3px" }}>
              {/* Index */}
              <span className="text-[10px] font-bold tabular-nums flex-shrink-0"
                    style={{ fontFamily: "Courier New, monospace", color }}>
                [{i + 1}]
              </span>
              {/* Collection badge */}
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded flex-shrink-0 tracking-wide"
                    style={{
                      fontFamily: "Courier New, monospace",
                      background: `${color}18`,
                      color,
                    }}>
                {badge}
              </span>
              {/* Label */}
              <span className="text-[11px] text-stone-600 truncate flex-1 min-w-0"
                    style={{ fontFamily: "Courier New, monospace" }}>
                {title}
              </span>
              {/* Score */}
              {typeof c.score === "number" && (
                <span className="text-[11px] font-bold tabular-nums flex-shrink-0 text-stone-400"
                      style={{ fontFamily: "Courier New, monospace" }}>
                  {c.score.toFixed(2)}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Markdown prose renderer ────────────────────────────────────────────────────
function Prose({ content }: { content: string }) {
  return (
    <ReactMarkdown
      components={{
        p:          ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>,
        strong:     ({ children }) => <strong className="font-semibold text-stone-900">{children}</strong>,
        em:         ({ children }) => <em className="italic text-stone-600">{children}</em>,
        ul:         ({ children }) => <ul className="my-2 space-y-1 pl-4 list-disc">{children}</ul>,
        ol:         ({ children }) => <ol className="my-2 space-y-1 pl-4 list-decimal">{children}</ol>,
        li:         ({ children }) => <li className="leading-relaxed">{children}</li>,
        h1:         ({ children }) => <h1 className="text-base font-bold text-stone-900 mt-3 mb-1">{children}</h1>,
        h2:         ({ children }) => <h2 className="text-sm font-bold text-stone-900 mt-3 mb-1">{children}</h2>,
        h3:         ({ children }) => <h3 className="text-sm font-semibold text-stone-800 mt-2 mb-1">{children}</h3>,
        hr:         () => <hr className="my-3 border-stone-200" />,
        blockquote: ({ children }) => (
          <blockquote className="pl-3 border-l-2 border-stone-300 text-stone-500 italic my-2">
            {children}
          </blockquote>
        ),
        code: ({ children, className }) => {
          const isBlock = !!className;
          if (isBlock) {
            return (
              <pre className="mt-2 mb-1 p-3 rounded-lg bg-stone-50 border border-stone-200 overflow-x-auto">
                <code className="text-[12px] font-mono text-stone-700 leading-relaxed">
                  {String(children).trim()}
                </code>
              </pre>
            );
          }
          return (
            <code className="px-1.5 py-0.5 rounded bg-stone-100 border border-stone-200 text-[12px] font-mono text-stone-700">
              {children}
            </code>
          );
        },
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

// ── Bubbles ────────────────────────────────────────────────────────────────────
function UserBubble({ msg }: { msg: Message }) {
  return (
    <div className="flex justify-end gap-3">
      <div className="max-w-[72%]">
        <div className="bg-stone-800 text-stone-50 rounded-2xl rounded-tr-sm px-4 py-3 text-sm leading-relaxed">
          {msg.content}
        </div>
        <p className="text-[10px] text-stone-400 mt-1 text-right">
          {msg.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </p>
      </div>
      <div className="w-7 h-7 rounded-full bg-stone-700 flex items-center justify-center text-stone-200 text-[11px] font-bold flex-shrink-0 mt-0.5">U</div>
    </div>
  );
}

function AssistantBubble({ msg }: { msg: Message }) {
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard.writeText(msg.content).then(() => {
      setCopied(true);
      showToast("Copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="flex gap-3 group">
      <div className="w-7 h-7 flex items-center justify-center text-[#C2391B] text-lg font-bold flex-shrink-0 mt-0.5 select-none">✳</div>
      <div className="max-w-[80%] flex-1">
        <div className="bg-white border border-stone-200 rounded-2xl rounded-tl-sm shadow-sm overflow-hidden">
          {/* Response header */}
          <div className="flex items-center gap-2 px-4 py-2 border-b border-stone-100 bg-stone-50">
            <span className="text-[9px] font-bold tracking-widest uppercase text-stone-400"
                  style={{ fontFamily: "Courier New, monospace" }}>
              QABUDDY
            </span>
            {msg.intent && msg.intent !== "general" && (
              <>
                <span className="text-stone-300">·</span>
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded tracking-wide uppercase"
                      style={{
                        fontFamily: "Courier New, monospace",
                        background: "#C2391B18",
                        color: "#C2391B",
                      }}>
                  {msg.intent}
                </span>
              </>
            )}
            {msg.elapsed !== undefined && (
              <span className="ml-auto text-[9px] text-stone-400"
                    style={{ fontFamily: "Courier New, monospace" }}>
                {(msg.elapsed / 1000).toFixed(2)}s
              </span>
            )}
          </div>

          {/* Markdown content */}
          <div className="px-4 py-3 text-sm text-stone-700">
            <Prose content={msg.content} />
          </div>

          {/* Citations */}
          {msg.citations && msg.citations.length > 0 && (
            <div className="px-4 pb-4">
              <CitationCards citations={msg.citations} />
            </div>
          )}
        </div>

        {/* Footer: timestamp + copy */}
        <div className="flex items-center justify-between mt-1 px-1">
          <p className="text-[10px] text-stone-400">
            {msg.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </p>
          <button
            onClick={copy}
            className="text-[10px] text-stone-300 hover:text-stone-500 transition-colors opacity-0 group-hover:opacity-100"
            style={{ fontFamily: "Courier New, monospace" }}>
            {copied ? "✓ copied" : "copy"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ErrorBubble({ msg }: { msg: Message }) {
  return (
    <div className="flex justify-center">
      <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-50 border border-red-200 text-red-600 text-sm max-w-lg">
        <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        {msg.content}
      </div>
    </div>
  );
}

// Pipeline step loading indicator
const PIPELINE_STEPS = [
  { label: "hybrid search",    delay: 0    },
  { label: "BM25 + reranking", delay: 700  },
  { label: "generating answer", delay: 1400 },
];

function TypingIndicator() {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const timers = PIPELINE_STEPS.slice(1).map(({ delay }, i) =>
      setTimeout(() => setStep(i + 1), delay)
    );
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <div className="flex gap-3">
      <div className="w-7 h-7 flex items-center justify-center text-[#C2391B] text-lg font-bold flex-shrink-0 mt-0.5 select-none">✳</div>
      <div className="bg-white border border-stone-200 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
        <div className="space-y-2">
          {PIPELINE_STEPS.map(({ label, delay }, i) => (
            <div key={label}
                 className="flex items-center gap-2.5"
                 style={{
                   opacity: 0,
                   animation: `fadeSlideIn 0.25s ease forwards`,
                   animationDelay: `${delay}ms`,
                 }}>
              {i < step ? (
                <svg className="w-3 h-3 text-green-500 flex-shrink-0" fill="none" viewBox="0 0 12 12" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M2 6l3 3 5-5" />
                </svg>
              ) : i === step ? (
                <span className="w-2 h-2 rounded-full flex-shrink-0 animate-pulse"
                      style={{ background: "#C2391B" }} />
              ) : (
                <span className="w-2 h-2 rounded-full flex-shrink-0 bg-stone-200" />
              )}
              <span className="text-[12px]"
                    style={{
                      fontFamily: "Courier New, monospace",
                      color: i < step ? "#16A34A" : i === step ? "#1C1917" : "#C8C3BA",
                    }}>
                {label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Live backend status dot ────────────────────────────────────────────────────
function BackendDot() {
  const [ok, setOk] = useState<boolean | null>(null);
  useEffect(() => {
    let dead = false;
    async function ping() {
      try { await api.health(); if (!dead) setOk(true); }
      catch { if (!dead) setOk(false); }
    }
    ping();
    const id = setInterval(ping, 30_000);
    return () => { dead = true; clearInterval(id); };
  }, []);
  return (
    <span className="flex items-center gap-1.5 text-[11px] text-stone-500"
          style={{ fontFamily: "Courier New, monospace" }}>
      <span className={`w-1.5 h-1.5 rounded-full ${
        ok === true ? "bg-green-500" : ok === false ? "bg-red-500" : "bg-yellow-400 animate-pulse"
      }`} />
      {ok === true ? "online" : ok === false ? "offline" : "checking…"}
    </span>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function ChatPage() {
  const [messages, setMessages]   = useState<Message[]>([]);
  const [input, setInput]         = useState("");
  const [loading, setLoading]     = useState(false);
  const [modeValue, setModeValue] = useState("auto-detect");

  // Conversation history
  const [sessionId, setSessionId] = useState(() => uid());
  const [sessions, setSessions]   = useState<ConvSession[]>([]);

  // All 9 collections pre-seeded from KNOWLEDGE_BASE; counts filled from API
  const [cols, setCols] = useState<CollectionState[]>(
    KNOWLEDGE_BASE.map(k => ({ ...k, points: 0, checked: true }))
  );

  const bottomRef    = useRef<HTMLDivElement>(null);
  const textareaRef  = useRef<HTMLTextAreaElement>(null);
  const urlParamSent = useRef(false);

  // Load conversation history on mount
  useEffect(() => {
    setSessions(loadConversations());
  }, []);

  // Auto-save conversation whenever messages change
  useEffect(() => {
    if (messages.length === 0) return;
    const updated = persistConversation(sessionId, messages);
    setSessions(updated);
  }, [messages, sessionId]);

  // Overlay live chunk counts from /api/collections
  useEffect(() => {
    api.listCollections().then(({ collections: live }) => {
      setCols(prev => prev.map(c => {
        const found = live.find(l => l.name === c.name);
        return found ? { ...c, points: found.points } : c;
      }));
    }).catch(() => {});
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 140) + "px";
  }, [input]);

  const toggle   = (name: string) => setCols(p => p.map(c => c.name === name ? { ...c, checked: !c.checked } : c));
  const setAll   = (v: boolean)   => setCols(p => p.map(c => ({ ...c, checked: v })));

  const currentMode = MODES.find(m => m.value === modeValue) ?? MODES[0];
  const totalChunks = cols.reduce((s, c) => s + c.points, 0);
  const checkedCols = cols.filter(c => c.checked).map(c => c.name);
  const allChecked  = cols.every(c => c.checked);
  const noneChecked = cols.every(c => !c.checked);

  function newConversation() {
    setMessages([]);
    setSessionId(uid());
    textareaRef.current?.focus();
  }

  function restoreSession(s: ConvSession) {
    setMessages(deserializeMessages(s.messages));
    setSessionId(s.id);
  }

  function exportConversation() {
    const lines = messages.map(m => {
      const role = m.role === "user" ? "**You**" : m.role === "assistant" ? "**QA Buddy**" : "**Error**";
      return `${role}\n\n${m.content}`;
    });
    const md = `# QA Buddy — Conversation Export\n_${new Date().toLocaleString()}_\n\n---\n\n${lines.join("\n\n---\n\n")}`;
    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `qa-buddy-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("Conversation exported");
  }

  const sendMessage = useCallback(async (text?: string) => {
    const query = (text ?? input).trim();
    if (!query || loading) return;

    setInput("");
    setLoading(true);
    setMessages(prev => [...prev, {
      id: uid(), role: "user", content: query, timestamp: new Date(),
    }]);

    const t0 = Date.now();
    try {
      const collectionsFilter = (!noneChecked && !allChecked) ? checkedCols : [];
      const res: ChatResponse = await api.chat(
        query,
        currentMode.agent,
        undefined,
        collectionsFilter,
      );
      const elapsed = res.elapsed_ms ?? (Date.now() - t0);
      setMessages(prev => [...prev, {
        id: uid(), role: "assistant",
        content:   res.answer,
        citations: res.citations,
        intent:    res.intent,
        elapsed,
        mode:      currentMode.value,
        timestamp: new Date(),
      }]);
    } catch (err) {
      setMessages(prev => [...prev, {
        id: uid(), role: "error",
        content: err instanceof Error
          ? (err.message.includes("500") ? "Backend error — check at least one LLM key is set" : err.message)
          : "Something went wrong. Please try again.",
        timestamp: new Date(),
      }]);
    } finally {
      setLoading(false);
      textareaRef.current?.focus();
    }
  }, [input, loading, checkedCols, noneChecked, allChecked, currentMode]);

  // Auto-send ?q= param — ref-guarded so React 18 Strict Mode double-invoke is a no-op
  useEffect(() => {
    if (urlParamSent.current) return;
    const params = new URLSearchParams(window.location.search);
    const q = params.get("q");
    if (q) {
      urlParamSent.current = true;
      window.history.replaceState({}, "", window.location.pathname);
      sendMessage(q);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const hasMessages = messages.length > 0;

  const chatSidebar = (
    <>
        {/* Conversations */}
        <div className="px-5 pt-4 pb-3">
          <div className="flex items-center justify-between mb-2.5">
            <p className="text-[10px] tracking-widest uppercase text-stone-400"
               style={{ fontFamily: "Courier New, monospace" }}>
              Conversations
            </p>
            <button
              onClick={newConversation}
              className="text-[10px] text-stone-400 hover:text-stone-700 px-2 py-0.5 rounded hover:bg-stone-200 transition-colors"
              style={{ fontFamily: "Courier New, monospace" }}>
              + new
            </button>
          </div>
          {sessions.length === 0 ? (
            <p className="text-[11px] text-stone-300" style={{ fontFamily: "Courier New, monospace" }}>
              no history yet
            </p>
          ) : (
            <ul className="space-y-0.5">
              {sessions.slice(0, 8).map(s => (
                <li key={s.id}>
                  <button
                    onClick={() => restoreSession(s)}
                    title={s.title}
                    className={`w-full text-left px-2 py-1.5 rounded-lg text-[11px] truncate transition-colors ${
                      s.id === sessionId
                        ? "bg-stone-800 text-white"
                        : "text-stone-500 hover:bg-stone-200 hover:text-stone-800"
                    }`}
                    style={{ fontFamily: "Courier New, monospace" }}>
                    {s.title}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="border-t" style={{ borderColor: "#D6D1C8" }} />

        {/* Knowledge Base */}
        <div className="px-5 pt-4 pb-3">
          <p className="text-[10px] tracking-widest uppercase text-stone-400 mb-3"
             style={{ fontFamily: "Courier New, monospace" }}>
            Knowledge Base
          </p>
          <ul className="space-y-2">
            {cols.map(col => {
              const notIndexed = col.points === 0;
              return (
                <li key={col.name}
                    className="flex items-center gap-2 cursor-pointer select-none"
                    onClick={() => toggle(col.name)}>
                  <div className={`w-4 h-4 rounded-sm border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                    col.checked ? "border-stone-600 bg-stone-700" : "border-stone-300 bg-transparent"
                  }`}>
                    {col.checked && (
                      <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 12 12" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M2 6l3 3 5-5" />
                      </svg>
                    )}
                  </div>
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0 transition-opacity"
                        style={{ background: col.color, opacity: notIndexed ? 0.35 : 1 }} />
                  <span className={`text-[13px] flex-1 transition-colors leading-tight ${
                    col.checked ? notIndexed ? "text-stone-400" : "text-stone-800" : "text-stone-400"
                  }`}>
                    {col.label}
                  </span>
                  <span className={`text-[12px] tabular-nums font-medium flex-shrink-0 ${
                    notIndexed ? "text-stone-300" : "text-stone-500"
                  }`}>
                    {col.points}
                  </span>
                </li>
              );
            })}
          </ul>

          <div className="mt-4">
            <p className="mb-2" style={{ fontFamily: "Courier New, monospace", fontSize: 11, color: "#78716C" }}>
              total chunks{" "}
              <span className="font-bold" style={{ color: "#C2391B" }}>{totalChunks}</span>
            </p>
            <div className="flex gap-2">
              {[["all", true], ["none", false]].map(([lbl, val]) => (
                <button key={lbl as string}
                  onClick={() => setAll(val as boolean)}
                  className="px-3 py-0.5 rounded-full border text-[11px] transition-colors"
                  style={{
                    fontFamily: "Courier New, monospace",
                    background:  (val && allChecked) || (!val && noneChecked) ? "#1C1917" : "transparent",
                    color:       (val && allChecked) || (!val && noneChecked) ? "#F5F5F4" : "#78716C",
                    borderColor: (val && allChecked) || (!val && noneChecked) ? "#1C1917" : "#C8C3BA",
                  }}>
                  {lbl}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="border-t" style={{ borderColor: "#D6D1C8" }} />

        {/* Mode */}
        <div className="px-5 py-4">
          <p className="text-[10px] tracking-widest uppercase text-stone-400 mb-2"
             style={{ fontFamily: "Courier New, monospace" }}>
            Mode
          </p>
          <div className="relative">
            <select
              value={modeValue}
              onChange={e => setModeValue(e.target.value)}
              className="w-full appearance-none text-[13px] text-stone-700 border rounded-lg px-3 py-2 pr-7 focus:outline-none focus:ring-1 cursor-pointer transition-colors"
              style={{ background: "#E5E0D8", borderColor: "#C8C3BA" }}>
              {MODES.map(m => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
            <svg className="w-3.5 h-3.5 text-stone-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
                 fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
          {currentMode.value !== "auto-detect" && (
            <p className="text-[10px] text-stone-400 mt-1.5 leading-snug">
              {currentMode.value === "answer"         && "direct Q&A from your knowledge base"}
              {currentMode.value === "generate_tests" && "builds test cases from a feature or requirement"}
              {currentMode.value === "coverage"       && "identifies untested requirements & gaps"}
              {currentMode.value === "rca"            && "diagnoses failures from logs, commits & history"}
            </p>
          )}
        </div>

        <div className="border-t" style={{ borderColor: "#D6D1C8" }} />

        {/* Ingest */}
        <div className="px-5 py-4">
          <div className="flex items-center justify-between">
            <p className="text-[10px] tracking-widest uppercase text-stone-400"
               style={{ fontFamily: "Courier New, monospace" }}>
              Ingest
            </p>
            <Link href="/ingest"
                  className="text-[11px] px-3 py-0.5 rounded-full border text-stone-500 hover:text-stone-800 hover:border-stone-500 transition-colors"
                  style={{ borderColor: "#C8C3BA", fontFamily: "Courier New, monospace" }}>
              open
            </Link>
          </div>
        </div>

        {/* Tech footer */}
        <div className="px-5 py-3 space-y-0.5">
          {[["llm", "groq llama-3.3-70b"], ["search", "BM25 hybrid"]].map(([k, v]) => (
            <p key={k} className="text-[10px]" style={{ fontFamily: "Courier New, monospace", color: "#A8A29E" }}>
              <span style={{ color: "#78716C" }}>{k}</span>{" "}{v}
            </p>
          ))}
          <div className="flex gap-1 pt-1.5 flex-wrap">
            {["intent-routing", "citations", "rerank"].map(tag => (
              <span key={tag} className="text-[9px] px-1.5 py-0.5 rounded border"
                    style={{ fontFamily: "Courier New, monospace", color: "#A8A29E", borderColor: "#C8C3BA" }}>
                {tag}
              </span>
            ))}
          </div>
        </div>
    </>
  );

  return (
    <AppShell sidebar={chatSidebar}>
      <div className="flex flex-col flex-1 min-w-0 h-full">

        {/* Top bar */}
        <header className="flex items-center justify-between px-8 py-3 border-b flex-shrink-0"
                style={{ background: "#F5F3EE", borderColor: "#D6D1C8" }}>
          <p className="text-xs text-stone-400" style={{ fontFamily: "Courier New, monospace" }}>
            ask
            <span className="mx-1.5" style={{ color: "#C8C3BA" }}>→</span>
            hybrid search
            <span className="mx-1.5" style={{ color: "#C8C3BA" }}>→</span>
            BM25 + rerank
            <span className="mx-1.5" style={{ color: "#C8C3BA" }}>→</span>
            cited answer
          </p>
          <div className="flex items-center gap-3">
            {hasMessages && (
              <>
                <button onClick={exportConversation}
                        className="text-[11px] text-stone-400 hover:text-stone-600 transition-colors"
                        style={{ fontFamily: "Courier New, monospace" }}>
                  export
                </button>
                <button onClick={newConversation}
                        className="text-[11px] text-stone-400 hover:text-stone-600 transition-colors"
                        style={{ fontFamily: "Courier New, monospace" }}>
                  clear
                </button>
              </>
            )}
            <BackendDot />
          </div>
        </header>

        {/* Scrollable body */}
        <main className="flex-1 overflow-y-auto">
          {!hasMessages ? (
            <div className="max-w-2xl mx-auto px-8 pt-14 pb-8">
              <div className="text-5xl mb-5 leading-none select-none" style={{ color: "#C2391B" }}>✳</div>
              <h2 className="text-[58px] font-bold mb-5 text-stone-900 leading-none"
                  style={{ fontFamily: "Georgia, 'Times New Roman', serif", letterSpacing: "-0.02em" }}>
                QA Buddy
              </h2>
              <p className="text-[15px] text-stone-600 leading-relaxed mb-8 max-w-[480px]">
                One question, one{" "}
                <span className="font-semibold" style={{ color: "#C2391B" }}>cited</span>
                {" "}answer, grounded in your team&apos;s real QA knowledge: the Selenium &amp; Playwright
                frameworks, ~5,000 test cases, JIRA history, PRDs, meeting notes, and Jenkins logs.
              </p>

              {/* Pipeline card */}
              <div className="rounded-xl border p-5 mb-7 bg-white shadow-sm" style={{ borderColor: "#D6D1C8" }}>
                <p className="text-[10px] tracking-widest uppercase text-stone-400 mb-4"
                   style={{ fontFamily: "Courier New, monospace" }}>
                  Pipeline on every query
                </p>
                <div className="space-y-3">
                  {[
                    { step: "01", title: "Intent detection",  body: "Classifies as framework / bug / testcase / code / review" },
                    { step: "02", title: "Hybrid search",      body: "Dense vector + BM25 sparse over selected collections simultaneously" },
                    { step: "03", title: "Rerank",             body: "Cross-encoder re-scores results, keeps top-6 most relevant chunks" },
                    { step: "04", title: "Cited answer",       body: "LLM answers strictly from those chunks, every claim linked to [n] source" },
                  ].map(({ step, title, body }) => (
                    <div key={step} className="flex gap-3 items-start">
                      <span className="text-[10px] font-bold flex-shrink-0 mt-0.5"
                            style={{ fontFamily: "Courier New, monospace", color: "#C2391B" }}>
                        {step}
                      </span>
                      <div>
                        <p className="text-[13px] font-semibold text-stone-800 leading-snug">{title}</p>
                        <p className="text-[12px] text-stone-500 leading-relaxed">{body}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Starter prompts */}
              <div className="flex flex-wrap gap-2">
                {STARTERS.map(s => (
                  <button key={s}
                    onClick={() => sendMessage(s)}
                    className="px-4 py-2 rounded-full border text-[13px] text-stone-600 hover:border-stone-500 hover:text-stone-800 transition-colors bg-white shadow-sm"
                    style={{ borderColor: "#D6D1C8" }}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="max-w-2xl mx-auto px-8 py-6 space-y-6">
              {messages.map(msg =>
                msg.role === "user"      ? <UserBubble      key={msg.id} msg={msg} /> :
                msg.role === "assistant" ? <AssistantBubble key={msg.id} msg={msg} /> :
                                           <ErrorBubble     key={msg.id} msg={msg} />
              )}
              {loading && <TypingIndicator />}
              <div ref={bottomRef} />
            </div>
          )}
        </main>

        {/* Input bar */}
        <footer className="flex-shrink-0 px-8 py-4 border-t"
                style={{ background: "#F5F3EE", borderColor: "#D6D1C8" }}>
          <div className="max-w-2xl mx-auto">
            <div className="flex items-end gap-3 bg-white border rounded-2xl px-4 py-3 shadow-sm transition-colors focus-within:border-stone-400"
                 style={{ borderColor: "#D6D1C8" }}>
              <textarea
                ref={textareaRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKey}
                placeholder={currentMode.hint}
                rows={1}
                className="flex-1 bg-transparent text-[13px] text-stone-800 placeholder-stone-300 resize-none focus:outline-none leading-relaxed"
                style={{ minHeight: "24px", maxHeight: "140px" }}
              />
              <button
                onClick={() => sendMessage()}
                disabled={!input.trim() || loading}
                className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-white disabled:opacity-30 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
                style={{ background: "#1C1917" }}>
                {loading ? (
                  <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : (
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                )}
              </button>
            </div>
            <p className="text-[10px] text-stone-400 text-center mt-2"
               style={{ fontFamily: "Courier New, monospace" }}>
              enter to send · shift+enter for newline · answers always cite their sources
            </p>
          </div>
        </footer>
      </div>
    </AppShell>
  );
}
