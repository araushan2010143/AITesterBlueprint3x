"use client";
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { searchApi, documentsApi } from "@/lib/api";
import { SearchResponse, SearchResult } from "@/types";
import { Search, SlidersHorizontal, MessageSquare, FileText, ChevronDown, ChevronUp } from "lucide-react";

function ResultCard({ result }: { result: SearchResult }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="badge bg-indigo-900/40 text-indigo-400">{result.metadata.document_type ?? "doc"}</span>
            {result.metadata.module && <span className="badge bg-violet-900/40 text-violet-400">{result.metadata.module}</span>}
            {result.metadata.priority && <span className={`badge ${result.metadata.priority === "High" ? "bg-red-900/40 text-red-400" : result.metadata.priority === "Medium" ? "bg-amber-900/40 text-amber-400" : "bg-slate-800 text-slate-400"}`}>{result.metadata.priority}</span>}
            <span className="text-[10px] text-[var(--text-muted)]">{result.filename} · p.{result.page}</span>
          </div>
          <p className={`text-sm text-[var(--text-secondary)] leading-relaxed ${expanded ? "" : "line-clamp-3"}`}>{result.text}</p>
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          <span className="text-xs font-mono font-bold text-emerald-400">{(result.score * 100).toFixed(0)}%</span>
          <button onClick={() => setExpanded(v => !v)} className="text-[var(--text-muted)] hover:text-white">
            {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"search" | "ask">("search");
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [useReranker, setUseReranker] = useState(false);

  const { data: filterValues } = useQuery({ queryKey: ["filter-values"], queryFn: documentsApi.filterValues });

  const searchMut = useMutation({ mutationFn: (body: Record<string, unknown>) => searchApi.search(body) });
  const askMut = useMutation({ mutationFn: (body: Record<string, unknown>) => searchApi.ask(body) });

  const handleSearch = () => {
    if (!query.trim()) return;
    const body = { query, top_k: 10, use_reranker: useReranker, ...filters };
    if (mode === "search") searchMut.mutate(body);
    else askMut.mutate(body);
  };

  const setFilter = (key: string, val: string) =>
    setFilters(prev => val ? { ...prev, [key]: val } : Object.fromEntries(Object.entries(prev).filter(([k]) => k !== key)));

  const isLoading = searchMut.isPending || askMut.isPending;
  const searchData: SearchResponse | undefined = searchMut.data;
  const askData = askMut.data;

  return (
    <div className="p-6 max-w-4xl space-y-4">
      <div>
        <h1 className="text-xl font-bold text-white">QA Explorer</h1>
        <p className="text-sm text-[var(--text-muted)]">Hybrid search (Dense + BM25) across all ingested QA knowledge</p>
      </div>

      {/* Mode Toggle */}
      <div className="flex gap-2">
        {(["search", "ask"] as const).map(m => (
          <button key={m} onClick={() => setMode(m)} className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${mode === m ? "bg-indigo-600 text-white" : "btn-ghost"}`}>
            {m === "search" ? <><Search size={13} className="inline mr-1" />Search</> : <><MessageSquare size={13} className="inline mr-1" />Ask AI</>}
          </button>
        ))}
        <button onClick={() => setShowFilters(v => !v)} className="btn-ghost ml-auto flex items-center gap-1">
          <SlidersHorizontal size={13} /> Filters
        </button>
      </div>

      {/* Filters */}
      {showFilters && filterValues && (
        <div className="card p-4 grid grid-cols-2 md:grid-cols-3 gap-3">
          {[
            { key: "module", options: filterValues.modules, label: "Module" },
            { key: "document_type", options: filterValues.document_types, label: "Doc Type" },
            { key: "priority", options: filterValues.priorities, label: "Priority" },
            { key: "release", options: filterValues.releases, label: "Release" },
            { key: "author", options: filterValues.authors, label: "Author" },
            { key: "automation_status", options: filterValues.automation_statuses, label: "Automation" },
          ].map(({ key, options, label }) => (
            <div key={key}>
              <label className="text-[10px] text-[var(--text-muted)] block mb-1">{label}</label>
              <select onChange={e => setFilter(key, e.target.value)} value={filters[key] ?? ""}
                className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-xs text-white">
                <option value="">All</option>
                {options?.map((o: string) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
          ))}
          <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)] col-span-full">
            <input type="checkbox" checked={useReranker} onChange={e => setUseReranker(e.target.checked)} />
            Use Cohere Reranker
          </label>
        </div>
      )}

      {/* Search Input */}
      <div className="flex gap-3">
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handleSearch()}
          placeholder={mode === "ask" ? "Ask a question about your QA knowledge base…" : "Search test cases, requirements, defects…"}
          className="flex-1 bg-[var(--surface-1)] border border-[var(--border)] rounded-xl px-4 py-3 text-sm text-white placeholder:text-[var(--text-muted)] focus:outline-none focus:border-indigo-500"
        />
        <button onClick={handleSearch} disabled={isLoading} className="btn-primary px-6">
          {isLoading ? "…" : mode === "ask" ? "Ask" : "Search"}
        </button>
      </div>

      {/* Ask Result */}
      {askData && (
        <div className="space-y-3">
          <div className="card p-4 bg-indigo-900/10 border-indigo-800/40">
            <p className="text-xs font-semibold text-indigo-400 mb-2">AI Answer</p>
            <p className="text-sm text-white leading-relaxed">{askData.answer}</p>
            <p className="text-[10px] text-[var(--text-muted)] mt-2">
              {askData.tokens_used} tokens · Search {askData.search_latency_ms}ms · LLM {askData.llm_latency_ms}ms
            </p>
          </div>
          {askData.sources?.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-[var(--text-muted)] font-semibold">Sources ({askData.sources.length})</p>
              {askData.sources.map((r: SearchResult) => <ResultCard key={r.chunk_id} result={r} />)}
            </div>
          )}
        </div>
      )}

      {/* Search Results */}
      {searchData && (
        <div className="space-y-2">
          <p className="text-xs text-[var(--text-muted)]">
            {searchData.total} results · {searchData.latency_ms}ms
          </p>
          {searchData.results.map(r => <ResultCard key={r.chunk_id} result={r} />)}
          {searchData.total === 0 && (
            <div className="card p-8 text-center">
              <p className="text-sm text-[var(--text-muted)]">No results found. Try different keywords or upload more documents.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
