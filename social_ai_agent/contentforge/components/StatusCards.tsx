'use client';

import type { StatusResponse } from '../lib/types';

interface Props {
  status: StatusResponse | null;
  onRun: () => void;
  isTriggering: boolean;
}

const stepLabel: Record<string, string> = {
  idle: 'Idle',
  Done: 'Done',
  Error: 'Error',
  'Agent1: Generating topic': 'Step 1/3 — Topic',
  'Agent2: Writing content': 'Step 2/3 — Writing',
  'Agent3: Generating images': 'Step 3/3 — Images',
};

function KeyBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={`badge ${ok ? 'bg-emerald-900/60 text-emerald-400' : 'bg-red-900/60 text-red-400'}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${ok ? 'bg-emerald-400' : 'bg-red-400'}`} />
      {label}: {ok ? 'OK' : 'Missing'}
    </span>
  );
}

export default function StatusCards({ status, onRun, isTriggering }: Props) {
  const pipeline = status?.pipeline;
  const keys = status?.keys;

  const stepDisplay = pipeline?.currentStep
    ? (stepLabel[pipeline.currentStep] ?? pipeline.currentStep)
    : '—';

  const nextRun = status?.nextRun
    ? new Date(status.nextRun).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';

  const lastRun = pipeline?.lastRun
    ? new Date(pipeline.lastRun).toLocaleString()
    : 'Never';

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
      {/* Pipeline Status */}
      <div className="card">
        <p className="text-slate-400 text-xs mb-1 uppercase tracking-wide">Pipeline</p>
        <div className="flex items-center gap-2 mt-1">
          {pipeline?.running ? (
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
          ) : pipeline?.currentStep === 'Error' ? (
            <span className="w-2 h-2 rounded-full bg-red-500" />
          ) : (
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
          )}
          <span className="text-slate-100 font-medium text-sm">{stepDisplay}</span>
        </div>
        {pipeline?.lastError && (
          <p className="text-red-400 text-xs mt-1 truncate" title={pipeline.lastError}>
            {pipeline.lastError}
          </p>
        )}
      </div>

      {/* Last Run */}
      <div className="card">
        <p className="text-slate-400 text-xs mb-1 uppercase tracking-wide">Last Run</p>
        <p className="text-slate-100 font-medium text-sm mt-1">{lastRun}</p>
      </div>

      {/* Next Run */}
      <div className="card">
        <p className="text-slate-400 text-xs mb-1 uppercase tracking-wide">Next Auto-Run</p>
        <p className="text-slate-100 font-medium text-sm mt-1">{nextRun}</p>
        <p className="text-slate-500 text-xs">Daily at 09:00</p>
      </div>

      {/* API Keys + Run button */}
      <div className="card flex flex-col gap-3">
        <div className="flex gap-2 flex-wrap">
          <KeyBadge ok={keys?.groq ?? false} label="Groq" />
          <KeyBadge ok={keys?.gemini ?? false} label="Gemini" />
        </div>
        <button
          onClick={onRun}
          disabled={pipeline?.running || isTriggering}
          className="btn-primary w-full mt-auto"
        >
          {pipeline?.running || isTriggering ? 'Running...' : 'Run Now'}
        </button>
      </div>
    </div>
  );
}
