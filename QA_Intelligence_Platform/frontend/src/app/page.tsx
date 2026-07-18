"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { KNOWLEDGE_BASE } from "@/lib/collections";

interface CollectionStat {
  name: string;
  vectors: number;
  points: number;
}

// ── Nav card definitions ──────────────────────────────────────────────────────
const NAV_CARDS = [
  {
    href: "/chat",
    label: "Chat",
    tagline: "QA Assistant",
    desc: "Ask anything about your test suites, JIRA tickets, Jenkins failures, or docs. Auto-detects intent and routes to the right agent.",
    icon: "M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z",
  },
  {
    href: "/search",
    label: "Search",
    tagline: "Semantic + BM25",
    desc: "Hybrid retrieval across all collections with metadata filters — sprint, severity, module, framework.",
    icon: "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z",
  },
  {
    href: "/rca",
    label: "RCA",
    tagline: "Root Cause Analysis",
    desc: "Paste a stack trace or describe a failure. The agent searches logs, commits, and JIRA history to produce a cited diagnosis.",
    icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2",
  },
  {
    href: "/agents",
    label: "Agents",
    tagline: "5 AI Specialists",
    desc: "RTM Builder, Coverage Analyzer, Flaky Test Agent, RCA Agent, QA Assistant — run any agent inline.",
    icon: "M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z",
  },
  {
    href: "/ingest",
    label: "Ingest",
    tagline: "Upload & Index",
    desc: "Upload code, PDFs, logs, meeting notes, JIRA exports. Source-aware chunking, SHA256 deduplication, incremental indexing.",
    icon: "M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12",
  },
];

// ── Page ──────────────────────────────────────────────────────────────────────
export default function HomePage() {
  const [stats,       setStats]       = useState<CollectionStat[]>([]);
  const [statsLoaded, setStatsLoaded] = useState(false);
  const [online,      setOnline]      = useState(false);

  useEffect(() => {
    api.health().then(() => setOnline(true)).catch(() => setOnline(false));
    api.listCollections()
      .then(r => { setStats(r.collections); setStatsLoaded(true); })
      .catch(() => setStatsLoaded(true));
  }, []);

  const totalChunks = stats.reduce((s, c) => s + (c.points ?? 0), 0);
  const indexedNames = new Set(stats.filter(c => (c.points ?? 0) > 0).map(c => c.name));

  return (
    <div className="min-h-screen"
         style={{ background: "#F5F3EE", fontFamily: "system-ui, -apple-system, sans-serif" }}>

      {/* ── Top bar ─────────────────────────────────────────────────────────── */}
      <header className="flex items-center justify-between px-8 py-4 border-b"
              style={{ borderColor: "#D6D1C8", background: "#EDEAE3" }}>
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-stone-900"
              style={{ fontFamily: "Georgia, 'Times New Roman', serif", letterSpacing: "-0.01em" }}>
            QA Buddy
          </h1>
          <span className="text-[10px] tracking-widest uppercase text-stone-400"
                style={{ fontFamily: "Courier New, monospace" }}>
            QA Knowledge System
          </span>
        </div>
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5 text-[11px] text-stone-500"
                style={{ fontFamily: "Courier New, monospace" }}>
            <span className={`w-1.5 h-1.5 rounded-full ${online ? "bg-green-500" : "bg-red-400"}`} />
            {online ? "online" : "offline"}
          </span>
          {statsLoaded && totalChunks > 0 && (
            <span className="text-[11px] text-stone-400" style={{ fontFamily: "Courier New, monospace" }}>
              {totalChunks.toLocaleString()} chunks indexed
            </span>
          )}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-8 py-12">

        {/* ── Hero ──────────────────────────────────────────────────────────── */}
        <div className="mb-12">
          <div className="text-4xl mb-4 select-none" style={{ color: "#C2391B" }}>✳</div>
          <h2 className="text-5xl font-bold text-stone-900 mb-4"
              style={{ fontFamily: "Georgia, 'Times New Roman', serif", letterSpacing: "-0.03em", lineHeight: "1.1" }}>
            Your QA knowledge,
            <br />
            <span style={{ color: "#C2391B" }}>instantly searchable.</span>
          </h2>
          <p className="text-[15px] text-stone-500 leading-relaxed max-w-2xl">
            Chat, semantic search, failure analysis, and AI agents — all backed by a
            hybrid retrieval engine over your Selenium code, Playwright tests, JIRA tickets,
            Jenkins logs, PRDs, and meeting notes.
          </p>
        </div>

        {/* ── Nav cards ─────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-3 gap-4 mb-12">
          {NAV_CARDS.map(card => (
            <Link key={card.href} href={card.href}
                  className="group block bg-white border rounded-xl p-5 shadow-sm hover:shadow-md transition-all hover:border-stone-400"
                  style={{ borderColor: "#D6D1C8" }}>
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm select-none" style={{ color: "#C2391B" }}>✳</span>
                  <span className="text-[10px] tracking-widest uppercase text-stone-400 group-hover:text-stone-500 transition-colors"
                        style={{ fontFamily: "Courier New, monospace" }}>
                    {card.tagline}
                  </span>
                </div>
                <svg className="w-4 h-4 text-stone-300 group-hover:text-stone-500 transition-colors group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                     fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 17L17 7M7 7h10v10" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-stone-900 mb-2 group-hover:text-stone-800"
                  style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}>
                {card.label}
              </h3>
              <p className="text-[12px] text-stone-500 leading-relaxed">
                {card.desc}
              </p>
              <svg className="w-5 h-5 text-stone-300 mt-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={card.icon} />
              </svg>
            </Link>
          ))}
        </div>

        {/* ── Knowledge base ────────────────────────────────────────────────── */}
        <div className="bg-white border rounded-xl shadow-sm overflow-hidden"
             style={{ borderColor: "#D6D1C8" }}>
          <div className="flex items-center justify-between px-6 py-4 border-b"
               style={{ borderColor: "#F0EDE7" }}>
            <p className="text-[11px] tracking-widest uppercase text-stone-400"
               style={{ fontFamily: "Courier New, monospace" }}>
              Knowledge Collections
            </p>
            {statsLoaded && (
              <span className="text-[11px] text-stone-400" style={{ fontFamily: "Courier New, monospace" }}>
                {indexedNames.size} / {KNOWLEDGE_BASE.length} indexed
              </span>
            )}
          </div>

          <div className="grid grid-cols-3 divide-y divide-x" style={{ borderColor: "#F0EDE7" }}>
            {KNOWLEDGE_BASE.map((kb, i) => {
              const stat = stats.find(s => s.name === kb.name);
              const count = stat?.points ?? 0;
              const indexed = statsLoaded && count > 0;
              const isLast = i === KNOWLEDGE_BASE.length - 1;
              return (
                <div key={kb.name}
                     className={`flex items-center justify-between px-5 py-4 ${isLast && KNOWLEDGE_BASE.length % 3 !== 0 ? "col-span-" + (3 - (KNOWLEDGE_BASE.length % 3) + 1) : ""}`}>
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{ background: indexed ? kb.color : "#D6D1C8" }} />
                    <div className="min-w-0">
                      <p className={`text-[13px] font-medium truncate ${indexed ? "text-stone-700" : "text-stone-400"}`}>
                        {kb.label}
                      </p>
                      <p className="text-[10px] text-stone-400" style={{ fontFamily: "Courier New, monospace" }}>
                        {kb.name}
                      </p>
                    </div>
                  </div>
                  <div className="flex-shrink-0 ml-3">
                    {!statsLoaded ? (
                      <span className="block w-8 h-3 bg-stone-100 rounded animate-pulse" />
                    ) : (
                      <span className="text-[11px] font-bold tabular-nums"
                            style={{ fontFamily: "Courier New, monospace", color: indexed ? "#1C1917" : "#C8C3BA" }}>
                        {count > 0 ? count.toLocaleString() : "—"}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Pipeline note ─────────────────────────────────────────────────── */}
        <div className="mt-8 flex items-center gap-3 text-[11px] text-stone-400"
             style={{ fontFamily: "Courier New, monospace" }}>
          <span>intent detection</span>
          <span style={{ color: "#C8C3BA" }}>→</span>
          <span>query expansion</span>
          <span style={{ color: "#C8C3BA" }}>→</span>
          <span>hybrid search</span>
          <span style={{ color: "#C8C3BA" }}>→</span>
          <span>metadata filter</span>
          <span style={{ color: "#C8C3BA" }}>→</span>
          <span>rerank</span>
          <span style={{ color: "#C8C3BA" }}>→</span>
          <span>LLM</span>
          <span style={{ color: "#C8C3BA" }}>→</span>
          <span style={{ color: "#C2391B" }}>cited answer</span>
        </div>

      </main>
    </div>
  );
}
