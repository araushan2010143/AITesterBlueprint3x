"use client";
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { aiApi } from "@/lib/api";
import { AIAction } from "@/types";
import { TestTube, Copy, Target, Search, FileCheck, AlertCircle, Zap, Code, Database, ChevronRight, X } from "lucide-react";

const ICON_MAP: Record<string, any> = { TestTube, Copy, Target, Search, FileCheck, AlertCircle, Zap, Code, Database };

function ActionCard({ action, onSelect }: { action: AIAction; onSelect: (a: AIAction) => void }) {
  const Icon = ICON_MAP[action.icon] ?? Zap;
  return (
    <button onClick={() => onSelect(action)}
      className="card p-4 text-left hover:border-indigo-500/60 transition-all group">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-indigo-600/20 flex items-center justify-center shrink-0 group-hover:bg-indigo-600/40 transition-all">
          <Icon size={15} className="text-indigo-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white">{action.label}</p>
          <p className="text-[11px] text-[var(--text-muted)] mt-0.5 leading-relaxed">{action.description}</p>
        </div>
        <ChevronRight size={13} className="text-[var(--text-muted)] mt-1 group-hover:text-indigo-400 transition-all" />
      </div>
    </button>
  );
}

function ResultDisplay({ result }: { result: any }) {
  return (
    <pre className="text-xs text-[var(--text-secondary)] overflow-auto max-h-96 bg-[var(--surface-0)] rounded-lg p-4 leading-relaxed whitespace-pre-wrap">
      {JSON.stringify(result, null, 2)}
    </pre>
  );
}

export default function AIPage() {
  const [selected, setSelected] = useState<AIAction | null>(null);
  const [content, setContent] = useState("");
  const [options, setOptions] = useState<Record<string, unknown>>({});

  const { data: actionsData } = useQuery({ queryKey: ["ai-actions"], queryFn: aiApi.actions });
  const actions: AIAction[] = actionsData?.actions ?? [];

  const runMut = useMutation({
    mutationFn: ({ action, content, options }: { action: string; content: string; options: Record<string, unknown> }) =>
      aiApi.run(action, content, options),
  });

  const handleRun = () => {
    if (!selected || !content.trim()) return;
    runMut.mutate({ action: selected.id, content, options });
  };

  const handleClose = () => {
    setSelected(null);
    setContent("");
    setOptions({});
    runMut.reset();
  };

  return (
    <div className="p-6 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-white">AI Actions</h1>
        <p className="text-sm text-[var(--text-muted)]">9 specialized QA agents powered by Groq · llama-3.3-70b-versatile</p>
      </div>

      {!selected ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {actions.map(a => <ActionCard key={a.id} action={a} onSelect={setSelected} />)}
        </div>
      ) : (
        <div className="space-y-4 max-w-3xl">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {(() => { const Icon = ICON_MAP[selected.icon] ?? Zap; return <Icon size={18} className="text-indigo-400" />; })()}
              <div>
                <h2 className="text-base font-bold text-white">{selected.label}</h2>
                <p className="text-xs text-[var(--text-muted)]">{selected.description}</p>
              </div>
            </div>
            <button onClick={handleClose} className="text-[var(--text-muted)] hover:text-white"><X size={18} /></button>
          </div>

          {/* generate_script options */}
          {selected.id === "generate_script" && (
            <div>
              <label className="text-xs text-[var(--text-muted)] block mb-1">Framework</label>
              <select onChange={e => setOptions({ framework: e.target.value })}
                className="bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white">
                <option value="Playwright TypeScript">Playwright TypeScript</option>
                <option value="Selenium Java">Selenium Java</option>
                <option value="Cypress JavaScript">Cypress JavaScript</option>
                <option value="REST Assured Java">REST Assured Java</option>
              </select>
            </div>
          )}

          {/* test_data options */}
          {selected.id === "test_data" && (
            <div>
              <label className="text-xs text-[var(--text-muted)] block mb-1">Records per category</label>
              <input type="number" defaultValue={10} onChange={e => setOptions({ count: +e.target.value })} min={5} max={50}
                className="w-24 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white" />
            </div>
          )}

          {/* Content Input */}
          <div>
            <label className="text-xs text-[var(--text-muted)] block mb-1">
              {selected.id === "generate_test_cases" ? "Requirement text" :
               selected.id === "find_duplicates" ? "Paste test cases (as text or JSON)" :
               selected.id === "coverage_analysis" ? "Paste requirements + test cases" :
               selected.id === "rca" ? "Paste test execution report" :
               selected.id === "release_summary" ? "Paste execution results" :
               selected.id === "explain_failure" ? "Paste failure log / trace" :
               selected.id === "automate" ? "Paste manual test cases" :
               selected.id === "generate_script" ? "Paste test case to automate" :
               "Describe what data you need"}
            </label>
            <textarea
              value={content}
              onChange={e => setContent(e.target.value)}
              rows={8}
              placeholder="Paste your content here…"
              className="w-full bg-[var(--surface-1)] border border-[var(--border)] rounded-xl px-4 py-3 text-sm text-white placeholder:text-[var(--text-muted)] focus:outline-none focus:border-indigo-500 resize-none font-mono"
            />
          </div>

          <button onClick={handleRun} disabled={!content.trim() || runMut.isPending} className="btn-primary w-full">
            {runMut.isPending ? "Running AI agent…" : `Run — ${selected.label}`}
          </button>

          {/* Result */}
          {runMut.data && (
            <div className="card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-emerald-400">Result</p>
                <p className="text-[10px] text-[var(--text-muted)]">
                  {runMut.data.tokens_used} tokens · {runMut.data.latency_ms?.toFixed(0)}ms
                </p>
              </div>
              <ResultDisplay result={runMut.data.result} />
            </div>
          )}

          {runMut.error && (
            <div className="card p-4 border-red-900/40 bg-red-900/10">
              <p className="text-xs text-red-400">{(runMut.error as any).response?.data?.detail ?? "Request failed"}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
