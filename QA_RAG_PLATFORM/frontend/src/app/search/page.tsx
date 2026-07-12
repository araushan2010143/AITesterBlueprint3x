"use client";
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { searchApi, documentsApi } from "@/lib/api";
import { SearchResult } from "@/types";
import { Search, MessageSquare, SlidersHorizontal, ChevronDown, ChevronUp, Zap } from "lucide-react";

function priorityBadge(p: string) {
  if (!p) return "badge-slate";
  const lp = p.toLowerCase();
  if (lp === "critical") return "badge-red";
  if (lp === "high") return "badge-red";
  if (lp === "medium") return "badge-amber";
  return "badge-slate";
}

function ResultCard({ result, index }: { result: SearchResult; index?: number }) {
  const [expanded, setExpanded] = useState(false);
  const score = Math.round(result.score * 100);
  const scoreColor = score >= 70 ? "var(--green)" : score >= 40 ? "var(--amber)" : "var(--red)";

  return (
    <div className="card card-hover" style={{ padding: "14px 16px", marginBottom: 8 }}>
      <div style={{ display: "flex", gap: 12 }}>
        {index !== undefined && (
          <div style={{
            width: 22, height: 22, borderRadius: 6, background: "var(--surface-3)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 10, fontWeight: 700, color: "var(--text-3)", flexShrink: 0, marginTop: 2,
          }}>{index + 1}</div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 7 }}>
            {result.metadata.document_type && (
              <span className="badge badge-purple" style={{ fontSize: 10 }}>{result.metadata.document_type}</span>
            )}
            {result.metadata.module && (
              <span className="badge badge-blue" style={{ fontSize: 10 }}>{result.metadata.module}</span>
            )}
            {result.metadata.priority && (
              <span className={`badge ${priorityBadge(result.metadata.priority)}`} style={{ fontSize: 10 }}>
                {result.metadata.priority}
              </span>
            )}
            <span style={{ fontSize: 10, color: "var(--text-3)", alignSelf: "center" }}>
              {result.filename} · p.{result.page}
            </span>
          </div>
          <p style={{
            fontSize: 13, color: "var(--text-2)", lineHeight: 1.6, margin: 0,
            display: "-webkit-box", WebkitLineClamp: expanded ? undefined : 3,
            WebkitBoxOrient: "vertical", overflow: expanded ? "visible" : "hidden",
          }}>
            {result.text}
          </p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, flexShrink: 0 }}>
          <div style={{
            background: `${scoreColor}20`, border: `1px solid ${scoreColor}40`,
            borderRadius: 8, padding: "4px 10px", textAlign: "center", minWidth: 52,
          }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: scoreColor }}>{score}%</div>
            <div style={{ fontSize: 9, color: "var(--text-3)", fontWeight: 600 }}>MATCH</div>
          </div>
          <button onClick={() => setExpanded(v => !v)}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-3)", padding: 2 }}>
            {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
        </div>
      </div>

      <div className="score-bar" style={{ marginTop: 10 }}>
        <div className="score-fill" style={{ width: `${score}%`, background: `linear-gradient(90deg, ${scoreColor}80, ${scoreColor})` }} />
      </div>
    </div>
  );
}

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"search" | "ask">("search");
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<Record<string, string>>({});

  const { data: fv } = useQuery({ queryKey: ["filter-values"], queryFn: documentsApi.filterValues });
  const searchMut = useMutation({ mutationFn: searchApi.search });
  const askMut = useMutation({ mutationFn: searchApi.ask });

  const switchMode = (m: "search" | "ask") => {
    setMode(m);
    // Clear results from the other mode so they don't bleed through
    searchMut.reset();
    askMut.reset();
  };

  const handleSearch = () => {
    if (!query.trim()) return;
    const body = { query, top_k: 10, ...filters };
    if (mode === "search") {
      askMut.reset();
      searchMut.mutate(body);
    } else {
      searchMut.reset();
      askMut.mutate(body);
    }
  };

  const setFilter = (key: string, val: string) =>
    setFilters(prev =>
      val ? { ...prev, [key]: val } : Object.fromEntries(Object.entries(prev).filter(([k]) => k !== key))
    );

  const isLoading = searchMut.isPending || askMut.isPending;
  const activeFilters = Object.keys(filters).length;

  return (
    <div style={{ padding: "28px 32px", maxWidth: 880 }}>
      {/* Header */}
      <div style={{ marginBottom: 22 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text-1)", margin: "0 0 4px" }}>QA Explorer</h1>
        <p style={{ fontSize: 13, color: "var(--text-3)", margin: 0 }}>
          {mode === "search"
            ? "Hybrid search (Dense cosine + BM25) — ranked results from your knowledge base"
            : "Ask AI — natural language questions answered from your documents using RAG"}
        </p>
      </div>

      {/* Mode Toggle */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button
          onClick={() => switchMode("search")}
          className={`btn ${mode === "search" ? "btn-primary" : "btn-ghost"}`}
          style={{ gap: 6 }}
        >
          <Search size={13} />
          Semantic Search
        </button>
        <button
          onClick={() => switchMode("ask")}
          className={`btn ${mode === "ask" ? "btn-primary" : "btn-ghost"}`}
          style={{ gap: 6 }}
        >
          <Zap size={13} />
          Ask AI (RAG)
        </button>

        <div style={{ flex: 1 }} />

        <button onClick={() => setShowFilters(v => !v)} className="btn btn-ghost">
          <SlidersHorizontal size={13} />
          Filters
          {activeFilters > 0 && (
            <span style={{
              background: "var(--accent)", color: "white", borderRadius: 10,
              fontSize: 10, fontWeight: 700, padding: "1px 6px", marginLeft: 2,
            }}>{activeFilters}</span>
          )}
        </button>
      </div>

      {/* Mode explainer pill */}
      <div style={{
        display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 16,
        background: mode === "ask" ? "rgba(124,58,237,0.1)" : "var(--surface-2)",
        border: `1px solid ${mode === "ask" ? "rgba(124,58,237,0.3)" : "var(--border)"}`,
        borderRadius: 20, padding: "5px 12px", fontSize: 11, color: "var(--text-3)",
      }}>
        {mode === "search" ? (
          <><Search size={11} /> Returns ranked chunks — best for finding specific test cases</>
        ) : (
          <><MessageSquare size={11} color="var(--accent-light)" />
            <span style={{ color: "var(--accent-light)" }}>Returns an AI-synthesised answer with cited sources</span>
          </>
        )}
      </div>

      {/* Filters Panel */}
      {showFilters && fv && (
        <div className="card" style={{ padding: "16px 18px", marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Filters
            </span>
            {activeFilters > 0 && (
              <button onClick={() => setFilters({})} className="btn btn-ghost" style={{ padding: "3px 10px", fontSize: 11 }}>
                Clear all
              </button>
            )}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
            {[
              { key: "module", opts: fv.modules, label: "Module" },
              { key: "document_type", opts: fv.document_types, label: "Doc Type" },
              { key: "priority", opts: fv.priorities, label: "Priority" },
              { key: "release", opts: fv.releases, label: "Release" },
              { key: "author", opts: fv.authors, label: "Author" },
              { key: "automation_status", opts: fv.automation_statuses, label: "Automation" },
            ].map(({ key, opts, label }) => (
              <div key={key}>
                <label style={{
                  fontSize: 10, color: filters[key] ? "var(--accent-light)" : "var(--text-3)",
                  display: "block", marginBottom: 5, fontWeight: 700,
                  textTransform: "uppercase", letterSpacing: "0.06em",
                }}>{label}{filters[key] ? " ✓" : ""}</label>
                <select
                  onChange={e => setFilter(key, e.target.value)}
                  value={filters[key] ?? ""}
                  className="input"
                  style={{
                    padding: "7px 10px", fontSize: 12,
                    borderColor: filters[key] ? "var(--accent)" : undefined,
                  }}
                >
                  <option value="">All</option>
                  {opts?.map((o: string) => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Search Bar */}
      <div style={{ display: "flex", gap: 10, marginBottom: 24 }}>
        <div style={{ flex: 1, position: "relative" }}>
          {mode === "search"
            ? <Search size={15} style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "var(--text-3)" }} />
            : <MessageSquare size={15} style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "var(--accent-light)" }} />
          }
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleSearch()}
            placeholder={
              mode === "ask"
                ? "e.g. What are the critical security test cases for login?"
                : "e.g. SQL injection high priority, checkout payment flow…"
            }
            className="input"
            style={{
              paddingLeft: 40, paddingRight: 14, fontSize: 14, borderRadius: 12,
              borderColor: mode === "ask" ? "rgba(124,58,237,0.4)" : undefined,
            }}
          />
        </div>
        <button
          onClick={handleSearch}
          disabled={isLoading || !query.trim()}
          className="btn btn-primary"
          style={{ padding: "0 24px", fontSize: 14, minWidth: 90 }}
        >
          {isLoading ? "…" : mode === "ask" ? "Ask AI" : "Search"}
        </button>
      </div>

      {/* ── ASK AI RESULTS ── */}
      {mode === "ask" && askMut.data && (
        <div>
          {/* AI Answer Box */}
          <div className="card" style={{
            padding: 22,
            background: "linear-gradient(135deg, rgba(124,58,237,0.1), rgba(124,58,237,0.03))",
            borderColor: "rgba(124,58,237,0.25)",
            marginBottom: 16,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
              <div style={{
                width: 28, height: 28, borderRadius: 8,
                background: "linear-gradient(135deg, #7c3aed, #a78bfa)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <Zap size={13} color="white" />
              </div>
              <span style={{ fontSize: 13, fontWeight: 700, color: "var(--accent-light)" }}>AI Answer</span>
              <div style={{ marginLeft: "auto", display: "flex", gap: 10 }}>
                <span style={{ fontSize: 10, color: "var(--text-3)", background: "var(--surface-2)", padding: "3px 8px", borderRadius: 6 }}>
                  {askMut.data.tokens_used} tokens
                </span>
                <span style={{ fontSize: 10, color: "var(--text-3)", background: "var(--surface-2)", padding: "3px 8px", borderRadius: 6 }}>
                  {askMut.data.llm_latency_ms?.toFixed(0)}ms
                </span>
              </div>
            </div>
            <p style={{ fontSize: 14, color: "var(--text-1)", lineHeight: 1.75, margin: 0, whiteSpace: "pre-wrap" }}>
              {askMut.data.answer}
            </p>
          </div>

          {/* Sources */}
          {askMut.data.sources?.length > 0 && (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <span style={{ fontSize: 11, color: "var(--text-3)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  Sources used ({askMut.data.sources.length})
                </span>
                <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
              </div>
              {askMut.data.sources.map((r: SearchResult, i: number) => (
                <ResultCard key={r.chunk_id} result={r} index={i} />
              ))}
            </>
          )}
        </div>
      )}

      {/* ── SEARCH RESULTS ── */}
      {mode === "search" && searchMut.data && (
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <span style={{ fontSize: 12, color: "var(--text-3)" }}>
              {searchMut.data.total} results
            </span>
            <span style={{ fontSize: 11, color: "var(--text-3)", background: "var(--surface-2)", padding: "2px 8px", borderRadius: 6 }}>
              {searchMut.data.latency_ms?.toFixed(0)}ms
            </span>
            {activeFilters > 0 && (
              <span style={{ fontSize: 11, color: "var(--accent-light)", background: "rgba(124,58,237,0.1)", padding: "2px 8px", borderRadius: 6 }}>
                {activeFilters} filter{activeFilters > 1 ? "s" : ""} active
              </span>
            )}
          </div>

          {searchMut.data.results.length === 0 ? (
            <div className="card" style={{ padding: 48, textAlign: "center" }}>
              <p style={{ fontSize: 32, marginBottom: 8 }}>🔍</p>
              <p style={{ fontSize: 14, color: "var(--text-2)", fontWeight: 600, margin: "0 0 6px" }}>No results found</p>
              <p style={{ fontSize: 12, color: "var(--text-3)", margin: 0 }}>Try different keywords or remove some filters.</p>
            </div>
          ) : (
            searchMut.data.results.map((r: SearchResult, i: number) => (
              <ResultCard key={r.chunk_id} result={r} index={i} />
            ))
          )}
        </div>
      )}

      {/* Empty state when nothing has been searched yet */}
      {!searchMut.data && !askMut.data && !isLoading && (
        <div style={{ textAlign: "center", padding: "48px 0", color: "var(--text-3)" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>
            {mode === "ask" ? "🤖" : "🔍"}
          </div>
          <p style={{ fontSize: 14, fontWeight: 600, color: "var(--text-2)", margin: "0 0 6px" }}>
            {mode === "ask" ? "Ask anything about your QA knowledge" : "Search your test knowledge base"}
          </p>
          <p style={{ fontSize: 12, margin: 0 }}>
            {mode === "ask"
              ? "Type a question and get an AI answer synthesised from your documents"
              : "Type keywords or a phrase — results are ranked by hybrid Dense + BM25 score"}
          </p>
        </div>
      )}
    </div>
  );
}
