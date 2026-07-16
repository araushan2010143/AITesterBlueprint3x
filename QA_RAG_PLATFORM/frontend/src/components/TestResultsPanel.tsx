"use client";

import { useState } from "react";
import {
  CheckCircle2, XCircle, Clock, AlertTriangle,
  ChevronDown, ChevronRight, FlaskConical, List, Play
} from "lucide-react";

interface TestCase {
  title: string;
  suite?: string;
  status: "passed" | "failed" | "skipped" | "discovered" | "timedOut" | string;
  duration_ms?: number;
  error?: string;
}

interface TestResult {
  success: boolean;
  mode: "validate" | "dry_run" | "execute";
  tests: TestCase[];
  passed: number;
  failed: number;
  skipped?: number;
  total: number;
  duration_ms?: number;
  error?: string;
  issues?: { file: string; line: number; code: string; message: string }[];
  stdout?: string;
  raw_output?: string;
}

interface Props {
  result: TestResult | null;
  loading: boolean;
  onValidate?: () => void;
  onDryRun?: () => void;
  onExecute?: () => void;
  jobId?: string;
}

const STATUS_ICONS = {
  passed: <CheckCircle2 size={14} className="text-emerald-500" />,
  failed: <XCircle size={14} className="text-red-500" />,
  timedOut: <Clock size={14} className="text-amber-500" />,
  skipped: <AlertTriangle size={14} className="text-slate-400" />,
  discovered: <CheckCircle2 size={14} className="text-sky-400" />,
};

const MODE_LABEL = {
  validate: "TypeScript Validation",
  dry_run: "Test Discovery",
  execute: "Test Execution",
};

function TestRow({ test, idx }: { test: TestCase; idx: number }) {
  const [open, setOpen] = useState(false);
  const icon = STATUS_ICONS[test.status as keyof typeof STATUS_ICONS] ?? STATUS_ICONS.discovered;
  const hasError = !!test.error;

  return (
    <div className="border-b border-slate-800 last:border-0">
      <button
        onClick={() => hasError && setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-slate-800/50 transition-colors"
      >
        {icon}
        <span className="flex-1 text-sm text-slate-200 truncate">{test.title}</span>
        {test.duration_ms != null && test.duration_ms > 0 && (
          <span className="text-xs text-slate-500 tabular-nums">{test.duration_ms}ms</span>
        )}
        {hasError && (
          open ? <ChevronDown size={12} className="text-slate-500" />
               : <ChevronRight size={12} className="text-slate-500" />
        )}
      </button>
      {open && hasError && (
        <div className="px-10 pb-3">
          <pre className="text-xs text-red-400 bg-red-950/30 rounded p-3 overflow-x-auto whitespace-pre-wrap">
            {test.error}
          </pre>
        </div>
      )}
    </div>
  );
}

export default function TestResultsPanel({ result, loading, onValidate, onDryRun, onExecute, jobId }: Props) {
  const [showRaw, setShowRaw] = useState(false);

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-700 flex items-center gap-3 bg-slate-800/60">
        <FlaskConical size={16} className="text-violet-400" />
        <span className="font-semibold text-sm text-slate-100">Playwright Test Sandbox</span>
        <div className="flex-1" />
        <div className="flex gap-2">
          {onValidate && (
            <button
              onClick={onValidate}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
                         bg-slate-700 hover:bg-slate-600 text-slate-200 transition-colors disabled:opacity-50"
            >
              <CheckCircle2 size={12} />
              Validate TS
            </button>
          )}
          {onDryRun && (
            <button
              onClick={onDryRun}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
                         bg-sky-600 hover:bg-sky-500 text-white transition-colors disabled:opacity-50"
            >
              <List size={12} />
              Discover Tests
            </button>
          )}
          {onExecute && (
            <button
              onClick={onExecute}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
                         bg-violet-600 hover:bg-violet-500 text-white transition-colors disabled:opacity-50"
            >
              <Play size={12} />
              Run Tests
            </button>
          )}
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center gap-3 px-5 py-8 justify-center">
          <span className="animate-spin rounded-full h-5 w-5 border-2 border-violet-500 border-t-transparent" />
          <span className="text-sm text-slate-400">Running in sandbox…</span>
        </div>
      )}

      {/* Empty state */}
      {!loading && !result && (
        <div className="px-5 py-8 text-center text-sm text-slate-500">
          Click <span className="text-sky-400">Discover Tests</span> to validate structure,
          or <span className="text-violet-400">Run Tests</span> for full execution.
        </div>
      )}

      {/* Results */}
      {!loading && result && (
        <>
          {/* Summary bar */}
          <div className="px-4 py-3 border-b border-slate-800 flex flex-wrap items-center gap-4 bg-slate-850">
            <span className="text-xs text-slate-500 uppercase tracking-wide">
              {MODE_LABEL[result.mode] ?? result.mode}
            </span>
            {result.duration_ms != null && (
              <span className="text-xs text-slate-500 tabular-nums">{result.duration_ms}ms</span>
            )}
            <div className="flex-1" />
            {result.mode !== "validate" && (
              <>
                {result.passed > 0 && (
                  <span className="flex items-center gap-1 text-xs font-medium text-emerald-400">
                    <CheckCircle2 size={12} /> {result.passed} passed
                  </span>
                )}
                {result.failed > 0 && (
                  <span className="flex items-center gap-1 text-xs font-medium text-red-400">
                    <XCircle size={12} /> {result.failed} failed
                  </span>
                )}
                {(result.skipped ?? 0) > 0 && (
                  <span className="flex items-center gap-1 text-xs font-medium text-slate-400">
                    <AlertTriangle size={12} /> {result.skipped} skipped
                  </span>
                )}
                <span className="text-xs text-slate-500">{result.total} total</span>
              </>
            )}
            {result.mode === "validate" && (
              <span className={`text-xs font-semibold ${result.success ? "text-emerald-400" : "text-red-400"}`}>
                {result.success ? "✓ TypeScript OK" : `${(result.issues ?? []).length} error(s)`}
              </span>
            )}
          </div>

          {/* TS compile errors */}
          {result.mode === "validate" && (result.issues ?? []).length > 0 && (
            <div className="px-4 py-3 space-y-1.5">
              {(result.issues ?? []).map((iss, i) => (
                <div key={i} className="flex gap-2 text-xs">
                  <span className="text-red-400 font-medium shrink-0">{iss.code}</span>
                  <span className="text-slate-400 shrink-0">
                    {iss.file.split("/").pop()}:{iss.line}
                  </span>
                  <span className="text-slate-300">{iss.message}</span>
                </div>
              ))}
            </div>
          )}

          {/* Validate success */}
          {result.mode === "validate" && result.success && (
            <div className="px-4 py-5 text-center text-sm text-emerald-400">
              All TypeScript files compile without errors
            </div>
          )}

          {/* Test list */}
          {result.tests.length > 0 && (
            <div className="divide-y divide-slate-800 max-h-72 overflow-y-auto">
              {result.tests.map((t, i) => (
                <TestRow key={i} test={t} idx={i} />
              ))}
            </div>
          )}

          {/* Error */}
          {result.error && (
            <div className="px-4 py-3 text-sm text-red-400 bg-red-950/20">
              {result.error}
            </div>
          )}

          {/* Raw output toggle */}
          {(result.stdout || result.raw_output) && (
            <div className="border-t border-slate-800">
              <button
                onClick={() => setShowRaw(v => !v)}
                className="w-full px-4 py-2 text-left text-xs text-slate-500 hover:text-slate-300 flex items-center gap-1"
              >
                {showRaw ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                Raw output
              </button>
              {showRaw && (
                <pre className="px-4 pb-3 text-xs text-slate-400 overflow-x-auto whitespace-pre-wrap max-h-40">
                  {result.stdout || result.raw_output}
                </pre>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
