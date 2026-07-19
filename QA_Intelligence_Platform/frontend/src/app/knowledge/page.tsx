"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { api, BASE } from "@/lib/api";
import { KNOWLEDGE_BASE } from "@/lib/collections";
import { AppShell } from "@/components/AppShell";

interface CollectionStat { name: string; vectors: number; points: number; }
interface IngestState {
  last_run: string | null;
  last_result: { files_new: number; files_modified: number; chunks_indexed: number; errors: string[] } | null;
  running: boolean;
  total_runs: number;
}

function timeAgo(iso: string | null): string {
  if (!iso) return "never";
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60)   return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

export default function KnowledgePage() {
  const [stats,      setStats]      = useState<CollectionStat[]>([]);
  const [ingest,     setIngest]     = useState<IngestState | null>(null);
  const [loaded,     setLoaded]     = useState(false);
  const [triggering, setTriggering] = useState(false);

  useEffect(() => {
    api.listCollections()
      .then(r => { setStats(r.collections); setLoaded(true); })
      .catch(() => setLoaded(true));
    fetch(`${BASE}/api/admin/ingest/status`)
      .then(r => r.json()).then(setIngest).catch(() => {});
  }, []);

  async function triggerIngest() {
    setTriggering(true);
    try {
      await fetch(
        `${BASE}/api/admin/ingest/trigger`,
        { method: "POST" }
      );
      setTimeout(async () => {
        try {
          const r = await fetch(`${BASE}/api/admin/ingest/status`);
          setIngest(await r.json());
        } finally {
          setTriggering(false);
        }
      }, 2500);
    } catch {
      setTriggering(false);
    }
  }

  const totalChunks = stats.reduce((s, c) => s + (c.points ?? 0), 0);
  const liveCount   = stats.filter(c => (c.points ?? 0) > 0).length;
  const emptyCount  = KNOWLEDGE_BASE.length - liveCount;

  const sidebar = (
    <>
      <div className="px-5 pt-4 pb-3">
        <p className="text-[10px] tracking-widest uppercase text-stone-400 mb-3"
           style={{ fontFamily: "Courier New, monospace" }}>
          Overview
        </p>
        <div className="space-y-2.5">
          {[
            { label: "Total chunks",     value: loaded ? totalChunks.toLocaleString() : "—" },
            { label: "Live collections", value: loaded ? `${liveCount} / ${KNOWLEDGE_BASE.length}` : "—" },
            { label: "Empty",            value: loaded ? `${emptyCount}` : "—" },
            { label: "Last indexed",     value: timeAgo(ingest?.last_run ?? null) },
            { label: "Total runs",       value: ingest?.total_runs ?? "—" },
          ].map(({ label, value }) => (
            <div key={label} className="flex items-center justify-between">
              <span className="text-[12px] text-stone-500">{label}</span>
              <span className="text-[12px] font-bold text-stone-700"
                    style={{ fontFamily: "Courier New, monospace" }}>
                {String(value)}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="border-t" style={{ borderColor: "#D6D1C8" }} />

      <div className="px-5 py-4">
        <button
          onClick={triggerIngest}
          disabled={triggering || (ingest?.running ?? false)}
          className="w-full py-2 rounded-xl text-[12px] font-medium text-white disabled:opacity-50 hover:opacity-90 transition-opacity"
          style={{ background: "#1C1917", fontFamily: "Courier New, monospace" }}>
          {triggering || ingest?.running ? "Running…" : "Re-index all ↑"}
        </button>
        {ingest?.last_result && (
          <p className="text-[10px] text-stone-400 mt-2 text-center"
             style={{ fontFamily: "Courier New, monospace" }}>
            last: +{ingest.last_result.chunks_indexed} chunks · {ingest.last_result.files_new} new
          </p>
        )}
      </div>

      <div className="border-t" style={{ borderColor: "#D6D1C8" }} />

      <div className="px-5 py-4">
        <Link href="/ingest"
              className="flex items-center gap-2 text-[12px] text-stone-500 hover:text-stone-800 transition-colors"
              style={{ fontFamily: "Courier New, monospace" }}>
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
          upload new files
        </Link>
      </div>
    </>
  );

  return (
    <AppShell sidebar={sidebar}>
      <div className="flex flex-col flex-1 min-w-0 h-full">

        <header className="flex items-center justify-between px-8 py-3 border-b flex-shrink-0"
                style={{ background: "#F5F3EE", borderColor: "#D6D1C8" }}>
          <p className="text-xs text-stone-400" style={{ fontFamily: "Courier New, monospace" }}>
            {loaded ? `${liveCount} live · ${emptyCount} empty` : "loading…"}
            <span className="mx-1.5" style={{ color: "#C8C3BA" }}>·</span>
            last indexed {timeAgo(ingest?.last_run ?? null)}
          </p>
          <span className="flex items-center gap-1.5 text-[11px] text-stone-500"
                style={{ fontFamily: "Courier New, monospace" }}>
            <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
            online
          </span>
        </header>

        <main className="flex-1 overflow-y-auto px-8 py-8">
          <div className="max-w-3xl mx-auto">

            {/* Hero */}
            <div className="mb-8">
              <div className="text-3xl mb-3 select-none" style={{ color: "#C2391B" }}>✳</div>
              <h2 className="text-4xl font-bold text-stone-900 mb-2"
                  style={{ fontFamily: "Georgia, 'Times New Roman', serif", letterSpacing: "-0.02em" }}>
                Knowledge Hub
              </h2>
              <p className="text-[14px] text-stone-500 leading-relaxed max-w-lg">
                Health status across all 9 collections. Indexed collections are searched by every
                agent, chat session, and semantic search query.
              </p>
            </div>

            {/* Summary stats */}
            <div className="grid grid-cols-3 gap-4 mb-8">
              {[
                { label: "total chunks",     value: loaded ? totalChunks.toLocaleString() : "—", color: "#C2391B" },
                { label: "live collections", value: loaded ? `${liveCount} / ${KNOWLEDGE_BASE.length}` : "—", color: "#16A34A" },
                { label: "last indexed",     value: timeAgo(ingest?.last_run ?? null),            color: "#1D4ED8" },
              ].map(({ label, value, color }) => (
                <div key={label} className="bg-white border rounded-xl px-5 py-4 shadow-sm"
                     style={{ borderColor: "#E7E2D9" }}>
                  <p className="text-2xl font-bold leading-none mb-1"
                     style={{ color, fontFamily: "Georgia, serif" }}>
                    {value}
                  </p>
                  <p className="text-[11px] text-stone-400"
                     style={{ fontFamily: "Courier New, monospace" }}>
                    {label}
                  </p>
                </div>
              ))}
            </div>

            {/* Collection cards */}
            <div className="grid grid-cols-3 gap-4">
              {KNOWLEDGE_BASE.map(kb => {
                const stat  = stats.find(s => s.name === kb.name);
                const count = stat?.points ?? 0;
                const live  = loaded && count > 0;
                return (
                  <div key={kb.name}
                       className="bg-white border rounded-xl shadow-sm overflow-hidden"
                       style={{ borderColor: "#E7E2D9" }}>
                    {/* Color accent bar */}
                    <div className="h-1 w-full transition-colors"
                         style={{ background: live ? kb.color : "#D6D1C8" }} />
                    <div className="p-4">
                      {/* Name + badge */}
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <div className="min-w-0">
                          <p className="text-[13px] font-semibold text-stone-800 leading-tight truncate">
                            {kb.label}
                          </p>
                          <p className="text-[10px] text-stone-400 mt-0.5"
                             style={{ fontFamily: "Courier New, monospace" }}>
                            {kb.name}
                          </p>
                        </div>
                        {loaded ? (
                          <span className={`flex-shrink-0 text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wide ${
                            live
                              ? "bg-green-100 text-green-700"
                              : "bg-stone-100 text-stone-400"
                          }`} style={{ fontFamily: "Courier New, monospace" }}>
                            {live ? "healthy" : "empty"}
                          </span>
                        ) : (
                          <span className="w-12 h-4 bg-stone-100 rounded-full animate-pulse flex-shrink-0" />
                        )}
                      </div>

                      {/* Chunk count */}
                      <div className="flex items-end gap-1">
                        {!loaded ? (
                          <div className="w-16 h-7 bg-stone-100 rounded animate-pulse" />
                        ) : (
                          <>
                            <span className="text-[26px] font-bold tabular-nums leading-none"
                                  style={{
                                    fontFamily: "Courier New, monospace",
                                    color: live ? kb.color : "#C8C3BA",
                                  }}>
                              {count > 0 ? count.toLocaleString() : "0"}
                            </span>
                            <span className="text-[10px] text-stone-400 mb-0.5 ml-1">chunks</span>
                          </>
                        )}
                      </div>

                      {/* Status line */}
                      <p className="text-[10px] text-stone-400 mt-1.5"
                         style={{ fontFamily: "Courier New, monospace" }}>
                        {!loaded
                          ? ""
                          : live
                            ? `synced ${timeAgo(ingest?.last_run ?? null)}`
                            : "no data indexed yet"}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Empty collections warning */}
            {loaded && emptyCount > 0 && (
              <div className="mt-6 flex items-center gap-3 px-5 py-3.5 bg-amber-50 border border-amber-200 rounded-xl">
                <svg className="w-4 h-4 text-amber-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-[13px] text-amber-700">
                  {emptyCount} collection{emptyCount > 1 ? "s are" : " is"} empty.{" "}
                  <Link href="/ingest"
                        className="underline underline-offset-2 font-medium hover:text-amber-900 transition-colors">
                    Upload files to index →
                  </Link>
                </p>
              </div>
            )}

          </div>
        </main>
      </div>
    </AppShell>
  );
}
