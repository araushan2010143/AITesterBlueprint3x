"use client";
import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { KNOWLEDGE_BASE } from "@/lib/collections";

const SUGGESTED_PROMPTS = [
  "Explain the login test framework",
  "Find flaky tests in the checkout flow",
  "Generate a test plan for the A/B test feature",
  "What JIRA tickets are open for authentication?",
];

interface CollectionStat { name: string; vectors: number; points: number; }
interface IngestState {
  last_run: string | null; next_run: string | null;
  last_result: { files_new: number; files_modified: number; chunks_indexed: number; errors: string[] } | null;
  running: boolean; total_runs: number;
}

const NAV_CARDS = [
  { href: "/chat",   label: "Chat",   tag: "QA Assistant",    desc: "Ask anything. Auto-detects intent and routes to the right agent.", icon: "M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z", color: "#1D4ED8", bg: "#EFF6FF", border: "#BFDBFE" },
  { href: "/search", label: "Search", tag: "Semantic + BM25", desc: "Hybrid retrieval with metadata filters across all 9 collections.",   icon: "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z",              color: "#7C3AED", bg: "#F5F3FF", border: "#DDD6FE" },
  { href: "/rca",    label: "RCA",    tag: "Root Cause",      desc: "Paste a stack trace. Get a cited diagnosis from logs + JIRA.",      icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2", color: "#C2391B", bg: "#FFF7F5", border: "#FECACA" },
  { href: "/agents", label: "Agents", tag: "5 AI Specialists", desc: "RTM Builder, Coverage Analyzer, Flaky Test Agent — run inline.",   icon: "M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z",             color: "#16A34A", bg: "#F0FDF4", border: "#BBF7D0" },
  { href: "/ingest", label: "Ingest", tag: "Upload & Index",  desc: "Drag-and-drop files. SHA256 dedup. Source-aware chunking.",         icon: "M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12",                                                              color: "#B45309", bg: "#FFFBEB", border: "#FDE68A" },
];

// Animated counter
function Counter({ target, duration = 1200 }: { target: number; duration?: number }) {
  const [val, setVal] = useState(0);
  const raf = useRef<number | null>(null);
  useEffect(() => {
    if (target === 0) return;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min((now - start) / duration, 1);
      setVal(Math.floor(p * target));
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, [target, duration]);
  return <>{val.toLocaleString()}</>;
}

function timeAgo(iso: string | null): string {
  if (!iso) return "never";
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60)   return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}
function timeUntil(iso: string | null): string {
  if (!iso) return "—";
  const diff = Math.floor((new Date(iso).getTime() - Date.now()) / 1000);
  if (diff <= 0) return "soon";
  if (diff < 60)   return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  return `${Math.floor(diff / 3600)}h`;
}

export default function HomePage() {
  const [stats,      setStats]      = useState<CollectionStat[]>([]);
  const [loaded,     setLoaded]     = useState(false);
  const [online,     setOnline]     = useState<"checking" | "waking" | "online" | "offline">("checking");
  const [ingest,     setIngest]     = useState<IngestState | null>(null);
  const [tick,       setTick]       = useState(0);
  const [heroQuery,  setHeroQuery]  = useState("");
  const router = useRouter();

  useEffect(() => {
    // Health check with retry — Render free tier sleeps and takes ~30-60s to wake.
    // Retry every 15s, up to 6 attempts (~90s total), showing "waking" after first failure.
    let attempts = 0;
    const MAX = 6;
    const tryHealth = () => {
      api.health()
        .then(() => { setOnline("online"); })
        .catch(() => {
          attempts++;
          if (attempts >= MAX) { setOnline("offline"); return; }
          setOnline("waking");
          setTimeout(tryHealth, 15_000);
        });
    };
    tryHealth();

    api.listCollections().then(r => { setStats(r.collections); setLoaded(true); }).catch(() => setLoaded(true));
    fetch(`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}/api/admin/ingest/status`)
      .then(r => r.json()).then(setIngest).catch(() => {});
  }, []);

  // Refresh ingest status every 30s + tick for live countdown
  useEffect(() => {
    const t = setInterval(() => {
      setTick(n => n + 1);
      fetch(`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}/api/admin/ingest/status`)
        .then(r => r.json()).then(setIngest).catch(() => {});
    }, 30_000);
    return () => clearInterval(t);
  }, []);

  const totalChunks   = stats.reduce((s, c) => s + (c.points ?? 0), 0);
  const indexedCount  = stats.filter(c => (c.points ?? 0) > 0).length;

  function heroSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = heroQuery.trim();
    if (!q) return;
    router.push(`/chat?q=${encodeURIComponent(q)}`);
  }

  async function triggerNow() {
    await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}/api/admin/ingest/trigger`, { method: "POST" });
    setTimeout(() => {
      fetch(`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}/api/admin/ingest/status`)
        .then(r => r.json()).then(setIngest).catch(() => {});
    }, 2000);
  }

  return (
    <div className="min-h-screen" style={{ background: "#F5F3EE", fontFamily: "system-ui, -apple-system, sans-serif" }}>

      {/* ── Top bar ── */}
      <header className="sticky top-0 z-20 flex items-center justify-between px-8 py-3 border-b backdrop-blur-sm"
              style={{ background: "rgba(237,234,227,0.92)", borderColor: "#D6D1C8" }}>
        <div className="flex items-center gap-3">
          <span className="text-2xl font-bold text-stone-900" style={{ fontFamily: "Georgia,serif", letterSpacing: "-0.02em" }}>
            QA Buddy
          </span>
          <span className="hidden sm:block text-[10px] tracking-widest uppercase text-stone-400 mt-0.5"
                style={{ fontFamily: "Courier New,monospace" }}>
            QA Knowledge System
          </span>
        </div>
        <div className="flex items-center gap-5">
          {loaded && totalChunks > 0 && (
            <span className="text-[12px] font-bold text-stone-700 tabular-nums">
              {totalChunks.toLocaleString()} <span className="font-normal text-stone-400">chunks</span>
            </span>
          )}
          <span className="flex items-center gap-1.5 text-[11px]" style={{ fontFamily: "Courier New,monospace" }}>
            <span className={`w-2 h-2 rounded-full ${
              online === "online"   ? "bg-green-500 shadow-[0_0_6px_#22c55e]" :
              online === "waking"   ? "bg-amber-400 animate-pulse" :
              online === "checking" ? "bg-stone-300 animate-pulse" :
                                      "bg-red-400"
            }`} />
            <span className={
              online === "online"   ? "text-green-700" :
              online === "waking"   ? "text-amber-600" :
              online === "checking" ? "text-stone-400" :
                                      "text-red-500"
            }>
              {online === "online"   ? "online" :
               online === "waking"   ? "waking up…" :
               online === "checking" ? "checking…" :
                                       "offline"}
            </span>
          </span>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-10">

        {/* ── Hero ── */}
        <div className="mb-10 relative">
          <div className="absolute -top-2 -left-2 text-6xl select-none opacity-10 pointer-events-none"
               style={{ color: "#C2391B", fontFamily: "Georgia,serif" }}>✳</div>
          <div className="relative">
            <p className="text-[11px] tracking-widest uppercase text-stone-400 mb-3"
               style={{ fontFamily: "Courier New,monospace" }}>
              QA Intelligence Platform
            </p>
            <h1 className="text-6xl font-bold text-stone-900 leading-none mb-4"
                style={{ fontFamily: "Georgia,serif", letterSpacing: "-0.03em" }}>
              Your QA knowledge,
              <br />
              <span style={{ color: "#C2391B" }}>instantly searchable.</span>
            </h1>
            <p className="text-[15px] text-stone-500 max-w-xl leading-relaxed">
              Hybrid retrieval over Selenium code, Playwright tests, JIRA tickets,
              Jenkins logs, PRDs, and meeting notes — with cited answers.
            </p>

            {/* ── Hero AI input ── */}
            <form onSubmit={heroSubmit} className="mt-6 max-w-xl">
              <div className="flex items-center gap-2 bg-white border rounded-2xl px-4 py-3.5 shadow-sm focus-within:border-stone-400 transition-colors"
                   style={{ borderColor: "#D6D1C8" }}>
                <svg className="w-4 h-4 text-stone-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                </svg>
                <input
                  type="text"
                  value={heroQuery}
                  onChange={e => setHeroQuery(e.target.value)}
                  placeholder="Ask anything about your QA knowledge…"
                  className="flex-1 bg-transparent text-[14px] text-stone-800 placeholder-stone-300 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={!heroQuery.trim()}
                  className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-white disabled:opacity-30 hover:opacity-90 transition-opacity"
                  style={{ background: "#1C1917" }}>
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
              {/* Suggested prompts */}
              <div className="flex flex-wrap gap-2 mt-3">
                {SUGGESTED_PROMPTS.map(p => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => router.push(`/chat?q=${encodeURIComponent(p)}`)}
                    className="px-3 py-1.5 rounded-full border text-[12px] text-stone-500 hover:text-stone-800 hover:border-stone-400 transition-colors bg-white shadow-sm"
                    style={{ borderColor: "#D6D1C8" }}>
                    {p}
                  </button>
                ))}
              </div>
            </form>
          </div>
        </div>

        {/* ── Stats bar ── */}
        <div className="grid grid-cols-4 gap-3 mb-8">
          {[
            { label: "total chunks",  value: totalChunks,  color: "#C2391B" },
            { label: "collections",   value: indexedCount, color: "#1D4ED8" },
            { label: "ingest runs",   value: ingest?.total_runs ?? 0, color: "#16A34A" },
            { label: "files tracked", value: ingest?.last_result ? (ingest.last_result.files_new + ingest.last_result.files_modified) : 0, color: "#7C3AED" },
          ].map(s => (
            <div key={s.label} className="bg-white border rounded-xl px-5 py-4 shadow-sm"
                 style={{ borderColor: "#E7E2D9" }}>
              <p className="text-3xl font-bold tabular-nums" style={{ color: s.color, fontFamily: "Georgia,serif" }}>
                {loaded ? <Counter target={s.value} /> : "—"}
              </p>
              <p className="text-[11px] text-stone-400 mt-1" style={{ fontFamily: "Courier New,monospace" }}>
                {s.label}
              </p>
            </div>
          ))}
        </div>

        {/* ── Auto-ingest status bar ── */}
        <div className="flex items-center justify-between bg-stone-900 text-stone-100 rounded-xl px-5 py-3 mb-8 gap-4">
          <div className="flex items-center gap-3">
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${ingest?.running ? "bg-yellow-400 animate-pulse" : "bg-green-400"}`} />
            <div>
              <p className="text-[12px] font-semibold">{ingest?.running ? "Auto-ingest running…" : "Auto-ingest"}</p>
              <p className="text-[10px] text-stone-400" style={{ fontFamily: "Courier New,monospace" }}>
                last run: {timeAgo(ingest?.last_run ?? null)}
                {ingest?.last_result && ` · +${ingest.last_result.chunks_indexed} chunks · ${ingest.last_result.files_new} new · ${ingest.last_result.files_modified} modified`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4 flex-shrink-0">
            <p className="text-[11px] text-stone-400" style={{ fontFamily: "Courier New,monospace" }}>
              next: <span className="text-stone-200 font-bold">{timeUntil(ingest?.next_run ?? null)}</span>
            </p>
            <button onClick={triggerNow}
                    className="text-[11px] px-3 py-1.5 rounded-lg bg-stone-700 hover:bg-stone-600 transition-colors font-medium"
                    style={{ fontFamily: "Courier New,monospace" }}>
              run now ↑
            </button>
          </div>
        </div>

        {/* ── Nav cards ── */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          {NAV_CARDS.map(card => (
            <Link key={card.href} href={card.href}
                  className="group block rounded-xl border overflow-hidden shadow-sm hover:shadow-lg transition-all duration-200 hover:-translate-y-0.5"
                  style={{ borderColor: card.border, background: card.bg }}>
              <div className="h-1 w-full" style={{ background: card.color }} />
              <div className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[10px] tracking-widest uppercase font-semibold"
                        style={{ color: card.color, fontFamily: "Courier New,monospace" }}>
                    {card.tag}
                  </span>
                  <svg className="w-3.5 h-3.5 opacity-40 group-hover:opacity-100 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all"
                       style={{ color: card.color }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 17L17 7M7 7h10v10" />
                  </svg>
                </div>
                <h2 className="text-xl font-bold text-stone-900 mb-1.5"
                    style={{ fontFamily: "Georgia,serif" }}>
                  {card.label}
                </h2>
                <p className="text-[13px] text-stone-500 leading-relaxed mb-4">{card.desc}</p>
                <div className="w-7 h-7 rounded-lg flex items-center justify-center"
                     style={{ background: card.color + "18" }}>
                  <svg className="w-4 h-4" style={{ color: card.color }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={card.icon} />
                  </svg>
                </div>
              </div>
            </Link>
          ))}
        </div>

        {/* ── Collections grid ── */}
        <div className="bg-white border rounded-xl shadow-sm overflow-hidden" style={{ borderColor: "#E7E2D9" }}>
          <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: "#F0EDE7" }}>
            <p className="text-[11px] tracking-widest uppercase font-semibold text-stone-500"
               style={{ fontFamily: "Courier New,monospace" }}>
              Knowledge Collections
            </p>
            <div className="flex items-center gap-4">
              <span className="text-[11px] font-bold" style={{ fontFamily: "Courier New,monospace", color: "#C2391B" }}>
                {loaded ? `${indexedCount} / ${KNOWLEDGE_BASE.length} live` : "…"}
              </span>
              <Link href="/knowledge"
                    className="text-[11px] text-stone-400 hover:text-stone-700 transition-colors"
                    style={{ fontFamily: "Courier New,monospace" }}>
                hub →
              </Link>
            </div>
          </div>
          <div className="grid grid-cols-3">
            {KNOWLEDGE_BASE.map((kb, i) => {
              const stat    = stats.find(s => s.name === kb.name);
              const count   = stat?.points ?? 0;
              const indexed = loaded && count > 0;
              const isLast3 = i >= KNOWLEDGE_BASE.length - (KNOWLEDGE_BASE.length % 3 || 3);
              return (
                <div key={kb.name}
                     className={`flex items-center justify-between px-5 py-4 border-b border-r last:border-r-0 group hover:bg-stone-50 transition-colors ${isLast3 ? "border-b-0" : ""}`}
                     style={{ borderColor: "#F0EDE7" }}>
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 transition-all ${indexed ? "shadow-sm" : "opacity-30"}`}
                          style={{ background: kb.color, boxShadow: indexed ? `0 0 6px ${kb.color}60` : "none" }} />
                    <div className="min-w-0">
                      <p className={`text-[13px] font-semibold truncate transition-colors ${indexed ? "text-stone-800" : "text-stone-400"}`}>
                        {kb.label}
                      </p>
                      <p className="text-[10px] text-stone-400" style={{ fontFamily: "Courier New,monospace" }}>
                        {kb.name}
                      </p>
                    </div>
                  </div>
                  <div className="flex-shrink-0 ml-3 flex flex-col items-end gap-0.5">
                    {!loaded ? (
                      <span className="block w-8 h-3 bg-stone-100 rounded animate-pulse" />
                    ) : (
                      <>
                        <span className="block text-[14px] font-bold tabular-nums"
                              style={{ fontFamily: "Courier New,monospace", color: indexed ? "#1C1917" : "#C8C3BA" }}>
                          {count > 0 ? count.toLocaleString() : "—"}
                        </span>
                        <span className={`text-[9px] px-1.5 py-px rounded-full font-semibold ${
                          indexed
                            ? "bg-green-100 text-green-700"
                            : "bg-stone-100 text-stone-400"
                        }`} style={{ fontFamily: "Courier New,monospace" }}>
                          {indexed ? "live" : "empty"}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Pipeline breadcrumb ── */}
        <div className="mt-6 flex flex-wrap items-center gap-2 text-[11px]"
             style={{ fontFamily: "Courier New,monospace" }}>
          {["intent detection", "query expansion", "hybrid search", "metadata filter", "rerank", "LLM"].map((s, i, arr) => (
            <span key={s} className="flex items-center gap-2">
              <span className="text-stone-500">{s}</span>
              {i < arr.length - 1 && <span style={{ color: "#C8C3BA" }}>→</span>}
            </span>
          ))}
          <span style={{ color: "#C8C3BA" }}>→</span>
          <span className="font-bold" style={{ color: "#C2391B" }}>cited answer</span>
        </div>

      </main>
    </div>
  );
}
