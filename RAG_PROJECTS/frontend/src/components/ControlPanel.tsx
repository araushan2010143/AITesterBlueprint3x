import { useRAGStore } from '../store/ragStore'
import { SlidersHorizontal } from 'lucide-react'

function Slider({
  label, min, max, step = 1, value, unit, onChange, description
}: {
  label: string; min: number; max: number; step?: number;
  value: number; unit?: string; onChange: (v: number) => void; description?: string
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs text-[var(--text-secondary)]">{label}</span>
        <span className="text-xs font-mono font-bold text-blue-400">
          {value}{unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full"
      />
      {description && <p className="mt-0.5 text-[10px] text-[var(--text-muted)]">{description}</p>}
    </div>
  )
}

export default function ControlPanel() {
  const { settings, updateSettings } = useRAGStore()

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center gap-2">
        <SlidersHorizontal size={13} className="text-blue-400" />
        <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Controls</h3>
      </div>

      {/* Chunking */}
      <div className="card p-3 flex flex-col gap-3">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Chunking</p>
        <Slider
          label="Chunk Size"
          min={200} max={2000} step={50}
          value={settings.chunk_size}
          unit=" chars"
          onChange={(v) => updateSettings({ chunk_size: v })}
          description="Characters per chunk. Larger = more context, fewer chunks."
        />
        <Slider
          label="Chunk Overlap"
          min={0} max={400} step={25}
          value={settings.chunk_overlap}
          unit=" chars"
          onChange={(v) => updateSettings({ chunk_overlap: v })}
          description="Overlap between consecutive chunks. Prevents context loss."
        />
        <p className="text-[10px] text-[var(--text-muted)]">
          To reindex with new settings, upload your PDF in the Ingestion tab and click Reindex.
        </p>
      </div>

      {/* Retrieval */}
      <div className="card p-3 flex flex-col gap-3">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Retrieval</p>
        <Slider
          label="Top-K Chunks"
          min={1} max={10}
          value={settings.top_k}
          onChange={(v) => updateSettings({ top_k: v })}
          description="Number of chunks passed to the LLM as context."
        />
      </div>

      {/* LLM */}
      <div className="card p-3 flex flex-col gap-3">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">LLM</p>
        <Slider
          label="Temperature"
          min={0} max={1} step={0.05}
          value={settings.temperature}
          onChange={(v) => updateSettings({ temperature: v })}
          description="0 = deterministic. 1 = creative. Keep low (0.1) for factual QA."
        />
        <Slider
          label="Max Tokens"
          min={128} max={4096} step={64}
          value={settings.max_tokens}
          unit=" tok"
          onChange={(v) => updateSettings({ max_tokens: v })}
          description="Maximum output length from Groq."
        />
      </div>

      {/* Current values summary */}
      <div className="rounded-lg border border-[var(--border-color)] bg-[var(--surface-0)] p-3 font-mono text-[10px] text-[var(--text-muted)] space-y-0.5">
        <p><span className="text-blue-400">chunk_size</span> = {settings.chunk_size}</p>
        <p><span className="text-blue-400">chunk_overlap</span> = {settings.chunk_overlap}</p>
        <p><span className="text-blue-400">top_k</span> = {settings.top_k}</p>
        <p><span className="text-blue-400">temperature</span> = {settings.temperature}</p>
        <p><span className="text-blue-400">max_tokens</span> = {settings.max_tokens}</p>
      </div>
    </div>
  )
}
