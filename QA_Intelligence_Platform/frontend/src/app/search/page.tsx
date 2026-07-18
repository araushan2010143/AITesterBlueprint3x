"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import { api, type SearchResult } from "@/lib/api";
import { KNOWLEDGE_BASE } from "@/lib/collections";
import { AppShell } from "@/components/AppShell";

// ── Types ──────────────────────────────────────────────────────────────────────
interface CollectionState {
  name: string;
  label: string;
  color: string;
  points: number;
  checked: boolean;
}

const FILTER_KEYS = [
  { key: "sprint",    placeholder: "e.g. Sprint-17" },
  { key: "severity",  placeholder: "e.g. high" },
  { key: "module",    placeholder: "e.g. login" },
  { key: "framework", placeholder: "e.g. playwright" },
];

const TOP_K_OPTIONS = [5, 10, 20];

const EXAMPLE_QUERIES = [
  "login timeout flaky test",
  "VWO A/B test setup steps",
  "checkout coupon validation",
  "SmartStats Bayesian engine",
  "switchMediaType implementation",
];

// ── Score badge ────────────────────────────────────────────────────────────────
function ScoreBadge({ score }: { score: number }) {
  const pct   = Math.round(score * 10000) / 100;
  const color = pct >= 1.5 ? "#15803D" : pct >= 0.8 ? "#B45309" : "#6B7280";
  return (
    <span className="text-[10px] font-bold tabular-nums px-1.5 py-0.5 rounded"
          style={{ background: `${color}18`, color, fontFamily: "Courier New, monospace" }}>
      {score.toFixed(4)}
    </span>
  );
}

// ── Result card ────────────────────────────────────────────────────────────────
function ResultCard({ result, rank }: { result: SearchResult; rank: number }) {
  const kb      = KNOWLEDGE_BASE.find(k => k.name === result.collection);
  const color   = kb?.color ?? "#78716C";
  const label   = kb?.label ?? result.collection;
  const meta    = result.metadata ?? {};
  const file    = meta.filename || meta.path?.split("/").pop() || "";
  const path    = meta.path || "";

  const metaChips = [
    meta.framework && { key: "framework", val: meta.framework },
    meta.module    && { key: "module",    val: meta.module    },
    meta.sprint    && { key: "sprint",    val: meta.sprint    },
    meta.severity  && { key: "severity",  val: meta.severity  },
  ].filter(Boolean) as { key: string; val: string }[];

  return (
    <div className="bg-white border rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow"
         style={{ borderColor: "#D6D1C8" }}>
      {/* Header row */}
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          {/* Rank */}
          <span className="text-[11px] text-stone-400 flex-shrink-0 tabular-nums w-5 text-right"
                style={{ fontFamily: "Courier New, monospace" }}>
            {rank}.
          </span>
          {/* Collection badge */}
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[11px] font-medium flex-shrink-0"
                style={{ borderColor: `${color}40`, color, background: `${color}10` }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
            {label}
          </span>
          {/* Filename */}
          {file && (
            <span className="text-[12px] text-stone-600 font-mono truncate">{file}</span>
          )}
        </div>
        <ScoreBadge score={result.score} />
      </div>

      {/* File path */}
      {path && path !== file && (
        <p className="text-[10px] text-stone-400 font-mono mb-2 pl-7 truncate">{path}</p>
      )}

      {/* Text excerpt */}
      <p className="text-[13px] text-stone-600 leading-relaxed pl-7 line-clamp-3">
        {result.text}
      </p>

      {/* Metadata chips */}
      {metaChips.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3 pl-7">
          {metaChips.map(({ key, val }) => (
            <span key={key}
              className="text-[10px] px-2 py-0.5 rounded border text-stone-500"
              style={{ borderColor: "#D6D1C8", fontFamily: "Courier New, monospace" }}>
              {key}:{val}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function SearchPage() {
  const [query,   setQuery]   = useState("");
  const [topK,    setTopK]    = useState(5);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [intent,  setIntent]  = useState("");
  const [searched, setSearched] = useState("");
  const [loading, setLoading] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [cols, setCols] = useState<CollectionState[]>(
    KNOWLEDGE_BASE.map(k => ({ ...k, points: 0, checked: true }))
  );

  const inputRef = useRef<HTMLInputElement>(null);

  // Overlay live counts
  useEffect(() => {
    api.listCollections().then(({ collections: live }) => {
      setCols(prev => prev.map(c => {
        const found = live.find(l => l.name === c.name);
        return found ? { ...c, points: found.points } : c;
      }));
    }).catch(() => {});
  }, []);

  const toggle   = (name: string) => setCols(p => p.map(c => c.name === name ? { ...c, checked: !c.checked } : c));
  const setAll   = (v: boolean)   => setCols(p => p.map(c => ({ ...c, checked: v })));
  const allChecked  = cols.every(c => c.checked);
  const noneChecked = cols.every(c => !c.checked);
  const checkedCols = cols.filter(c => c.checked).map(c => c.name);
  const totalChunks = cols.reduce((s, c) => s + c.points, 0);

  const activeFilters = Object.entries(filters).filter(([, v]) => v.trim());

  const runSearch = useCallback(async (q?: string) => {
    const text = (q ?? query).trim();
    if (!text || loading) return;

    setLoading(true);
    setResults(null);
    setSearched(text);

    try {
      const cols_ = (!noneChecked && !allChecked) ? checkedCols : [];
      const filts = activeFilters.length
        ? Object.fromEntries(activeFilters)
        : undefined;
      const res = await api.search(text, filts, topK, cols_);
      setResults(res.results);
      setIntent(res.intent);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [query, loading, checkedCols, noneChecked, allChecked, topK, activeFilters]);

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") runSearch();
  };

  const setFilter = (key: string, val: string) =>
    setFilters(prev => ({ ...prev, [key]: val }));
  const clearFilter = (key: string) =>
    setFilters(prev => { const n = { ...prev }; delete n[key]; return n; });

  const searchSidebar = (
    <>
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
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ background: col.color, opacity: notIndexed ? 0.35 : 1 }} />
                  <span className={`text-[13px] flex-1 leading-tight ${
                    col.checked ? notIndexed ? "text-stone-400" : "text-stone-800" : "text-stone-400"
                  }`}>
                    {col.label}
                  </span>
                  <span className={`text-[12px] tabular-nums font-medium ${notIndexed ? "text-stone-300" : "text-stone-500"}`}>
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

        {/* Top-K */}
        <div className="px-5 py-4">
          <p className="text-[10px] tracking-widest uppercase text-stone-400 mb-2"
             style={{ fontFamily: "Courier New, monospace" }}>
            Results
          </p>
          <div className="flex gap-1.5">
            {TOP_K_OPTIONS.map(k => (
              <button key={k}
                onClick={() => setTopK(k)}
                className="flex-1 py-1 rounded-lg border text-[12px] font-medium transition-colors"
                style={{
                  fontFamily:  "Courier New, monospace",
                  background:  topK === k ? "#1C1917" : "transparent",
                  color:       topK === k ? "#F5F5F4" : "#78716C",
                  borderColor: topK === k ? "#1C1917" : "#C8C3BA",
                }}>
                {k}
              </button>
            ))}
          </div>
        </div>

        <div className="border-t" style={{ borderColor: "#D6D1C8" }} />

        {/* Tech footer */}
        <div className="px-5 py-3 space-y-0.5">
          {[["llm", "groq llama-3.3-70b"], ["search", "BM25 hybrid"]].map(([k, v]) => (
            <p key={k} className="text-[10px]" style={{ fontFamily: "Courier New, monospace", color: "#A8A29E" }}>
              <span style={{ color: "#78716C" }}>{k}</span>{" "}{v}
            </p>
          ))}
        </div>
    </>
  );

  return (
    <AppShell sidebar={searchSidebar}>
      {/* ── Main ─────────────────────────────────────────────────────────────── */}
      <div className="flex flex-col flex-1 min-w-0 h-full">

        {/* Top bar */}
        <header className="flex items-center justify-between px-8 py-3 border-b flex-shrink-0"
                style={{ background: "#F5F3EE", borderColor: "#D6D1C8" }}>
          <p className="text-xs text-stone-400" style={{ fontFamily: "Courier New, monospace" }}>
            hybrid vector + BM25{" "}
            <span className="mx-1" style={{ color: "#C8C3BA" }}>·</span>
            metadata filters{" "}
            <span className="mx-1" style={{ color: "#C8C3BA" }}>·</span>
            intent routing
          </p>
          <span className="flex items-center gap-1.5 text-[11px] text-stone-500"
                style={{ fontFamily: "Courier New, monospace" }}>
            <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
            online
          </span>
        </header>

        {/* Scrollable body */}
        <main className="flex-1 overflow-y-auto px-8 py-8">
          <div className="max-w-2xl mx-auto">

            {/* Heading */}
            <div className="mb-7">
              <div className="text-3xl mb-3 select-none" style={{ color: "#C2391B" }}>✳</div>
              <h2 className="text-4xl font-bold text-stone-900 mb-2"
                  style={{ fontFamily: "Georgia, 'Times New Roman', serif", letterSpacing: "-0.02em" }}>
                Semantic Search
              </h2>
              <p className="text-[14px] text-stone-500 leading-relaxed">
                Hybrid dense + BM25 retrieval across your entire knowledge base.
                Pinpoint any code, ticket, test case, or doc with{" "}
                <span className="font-medium" style={{ color: "#C2391B" }}>cited</span> results.
              </p>
            </div>

            {/* Search bar */}
            <div className="flex gap-2 mb-3">
              <div className="flex-1 flex items-center gap-3 bg-white border rounded-xl px-4 py-3 shadow-sm focus-within:border-stone-400 transition-colors"
                   style={{ borderColor: "#D6D1C8" }}>
                <svg className="w-4 h-4 text-stone-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  onKeyDown={handleKey}
                  placeholder="search across tests, tickets, code, docs…"
                  className="flex-1 bg-transparent text-[14px] text-stone-800 placeholder-stone-300 focus:outline-none"
                />
                {query && (
                  <button onClick={() => { setQuery(""); setResults(null); inputRef.current?.focus(); }}
                          className="text-stone-300 hover:text-stone-500 transition-colors flex-shrink-0">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
              {/* Search button */}
              <button
                onClick={() => runSearch()}
                disabled={!query.trim() || loading}
                className="px-5 py-3 rounded-xl text-[13px] font-medium text-white disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-opacity flex-shrink-0"
                style={{ background: "#1C1917" }}>
                {loading ? (
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : "Search"}
              </button>
              {/* Filter toggle */}
              <button
                onClick={() => setFiltersOpen(o => !o)}
                className={`px-3 py-3 rounded-xl border text-[13px] transition-colors flex-shrink-0 ${
                  activeFilters.length > 0 || filtersOpen
                    ? "border-stone-500 text-stone-700 bg-stone-100"
                    : "text-stone-500 hover:border-stone-400"
                }`}
                style={{ borderColor: activeFilters.length > 0 || filtersOpen ? undefined : "#D6D1C8" }}>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
                </svg>
                {activeFilters.length > 0 && (
                  <span className="ml-1 text-[10px] font-bold" style={{ color: "#C2391B" }}>
                    {activeFilters.length}
                  </span>
                )}
              </button>
            </div>

            {/* Filter panel */}
            {filtersOpen && (
              <div className="bg-white border rounded-xl p-4 mb-4 shadow-sm" style={{ borderColor: "#D6D1C8" }}>
                <p className="text-[10px] tracking-widest uppercase text-stone-400 mb-3"
                   style={{ fontFamily: "Courier New, monospace" }}>
                  Metadata Filters
                </p>
                <div className="grid grid-cols-2 gap-3">
                  {FILTER_KEYS.map(({ key, placeholder }) => (
                    <div key={key} className="flex flex-col gap-1">
                      <label className="text-[10px] tracking-widest uppercase text-stone-400"
                             style={{ fontFamily: "Courier New, monospace" }}>
                        {key}
                      </label>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          value={filters[key] ?? ""}
                          onChange={e => setFilter(key, e.target.value)}
                          placeholder={placeholder}
                          className="flex-1 bg-stone-50 border rounded-lg px-2.5 py-1.5 text-[12px] text-stone-700 placeholder-stone-300 focus:outline-none focus:border-stone-400 transition-colors"
                          style={{ borderColor: "#D6D1C8" }}
                        />
                        {filters[key] && (
                          <button onClick={() => clearFilter(key)}
                                  className="text-stone-300 hover:text-stone-500 transition-colors">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                {activeFilters.length > 0 && (
                  <button onClick={() => setFilters({})}
                          className="mt-3 text-[11px] text-stone-400 hover:text-stone-600 transition-colors"
                          style={{ fontFamily: "Courier New, monospace" }}>
                    clear all filters
                  </button>
                )}
              </div>
            )}

            {/* Active filter pills */}
            {activeFilters.length > 0 && !filtersOpen && (
              <div className="flex flex-wrap gap-1.5 mb-4">
                {activeFilters.map(([k, v]) => (
                  <span key={k}
                    className="inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full border text-stone-600"
                    style={{ borderColor: "#C8C3BA", background: "#F0EDE7", fontFamily: "Courier New, monospace" }}>
                    {k}:{v}
                    <button onClick={() => clearFilter(k)} className="text-stone-400 hover:text-stone-700">
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* ── States ─────────────────────────────────────────────────────── */}

            {/* Empty / example queries */}
            {results === null && !loading && (
              <div>
                <p className="text-[11px] text-stone-400 mb-3" style={{ fontFamily: "Courier New, monospace" }}>
                  try an example
                </p>
                <div className="flex flex-wrap gap-2">
                  {EXAMPLE_QUERIES.map(q => (
                    <button key={q}
                      onClick={() => { setQuery(q); runSearch(q); }}
                      className="px-4 py-2 rounded-full border text-[13px] text-stone-600 hover:border-stone-500 hover:text-stone-800 transition-colors bg-white shadow-sm"
                      style={{ borderColor: "#D6D1C8" }}>
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Loading skeleton */}
            {loading && (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="bg-white border rounded-xl p-4 shadow-sm animate-pulse"
                       style={{ borderColor: "#D6D1C8" }}>
                    <div className="flex gap-2 mb-3">
                      <div className="w-20 h-4 rounded-full bg-stone-100" />
                      <div className="w-32 h-4 rounded bg-stone-100" />
                    </div>
                    <div className="space-y-2 pl-7">
                      <div className="h-3 bg-stone-100 rounded w-full" />
                      <div className="h-3 bg-stone-100 rounded w-5/6" />
                      <div className="h-3 bg-stone-100 rounded w-4/6" />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Results */}
            {results !== null && !loading && (
              <>
                {/* Result summary bar */}
                <div className="flex items-center justify-between mb-4">
                  <p className="text-[12px] text-stone-500" style={{ fontFamily: "Courier New, monospace" }}>
                    {results.length > 0 ? (
                      <>
                        <span className="font-bold text-stone-700">{results.length}</span> results
                        {intent && intent !== "general" && (
                          <> · intent: <span className="font-bold" style={{ color: "#C2391B" }}>{intent}</span></>
                        )}
                        {" "}for &ldquo;{searched}&rdquo;
                      </>
                    ) : (
                      <>no results for &ldquo;{searched}&rdquo;</>
                    )}
                  </p>
                  <button
                    onClick={() => { setResults(null); setQuery(""); inputRef.current?.focus(); }}
                    className="text-[11px] text-stone-400 hover:text-stone-600 transition-colors"
                    style={{ fontFamily: "Courier New, monospace" }}>
                    clear
                  </button>
                </div>

                {results.length === 0 ? (
                  <div className="text-center py-12">
                    <div className="text-4xl mb-3 text-stone-300 select-none">✳</div>
                    <p className="text-stone-500 text-sm">No chunks matched your query.</p>
                    <p className="text-stone-400 text-[12px] mt-1">
                      Try a broader term or check that the collection is indexed.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {results.map((r, i) => (
                      <ResultCard key={i} result={r} rank={i + 1} />
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </main>
      </div>
    </AppShell>
  );
}
