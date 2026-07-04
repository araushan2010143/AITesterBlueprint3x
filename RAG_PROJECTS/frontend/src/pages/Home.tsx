import { useState } from 'react'
import { motion } from 'framer-motion'
import { MessageSquare, Eye, Search, BarChart3, Settings, Database } from 'lucide-react'
import { useRAGStore } from '../store/ragStore'
import DocumentExplorer from '../components/DocumentExplorer'
import IngestionPanel from '../components/IngestionPanel'
import ControlPanel from '../components/ControlPanel'
import QueryPanel from '../components/QueryPanel'
import AnswerPanel from '../components/AnswerPanel'
import RetrievalInspector from '../components/RetrievalInspector'
import PromptInspector from '../components/PromptInspector'
import MetricsDashboard from '../components/MetricsDashboard'

type RightTab = 'query' | 'retrieval' | 'prompt'
type CenterTab = 'ingest' | 'controls'

const RIGHT_TABS: { id: RightTab; label: string; icon: typeof MessageSquare }[] = [
  { id: 'query', label: 'Answer', icon: MessageSquare },
  { id: 'retrieval', label: 'Retrieval', icon: Search },
  { id: 'prompt', label: 'Prompt', icon: Eye },
]

const CENTER_TABS: { id: CenterTab; label: string; icon: typeof Database }[] = [
  { id: 'ingest', label: 'Ingestion', icon: Database },
  { id: 'controls', label: 'Controls', icon: Settings },
]

export default function Home() {
  const [rightTab, setRightTab] = useState<RightTab>('query')
  const [centerTab, setCenterTab] = useState<CenterTab>('ingest')

  return (
    <div className="flex flex-col min-h-full">
      {/* Three-column main layout */}
      <div className="flex flex-1 gap-0 min-h-0 overflow-hidden" style={{ minHeight: 400 }}>

        {/* LEFT: Document Explorer */}
        <div className="w-56 shrink-0 border-r border-[var(--border-color)] bg-[var(--surface-1)] flex flex-col overflow-hidden">
          <DocumentExplorer />
        </div>

        {/* CENTER: Ingestion + Controls */}
        <div className="flex-1 border-r border-[var(--border-color)] bg-[var(--surface-0)] flex flex-col overflow-hidden min-w-0">
          {/* Tabs */}
          <div className="flex border-b border-[var(--border-color)] bg-[var(--surface-1)]">
            {CENTER_TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setCenterTab(tab.id)}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium transition border-b-2 ${
                  centerTab === tab.id
                    ? 'border-blue-500 text-blue-400'
                    : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                }`}
              >
                <tab.icon size={12} />
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto min-h-0">
            {centerTab === 'ingest' && <IngestionPanel />}
            {centerTab === 'controls' && <ControlPanel />}
          </div>
        </div>

        {/* RIGHT: Query + Results */}
        <div className="w-[420px] shrink-0 bg-[var(--surface-1)] flex flex-col overflow-hidden">
          {/* Query input (always visible) */}
          <div className="border-b border-[var(--border-color)] p-3">
            <QueryPanel />
          </div>

          {/* Result tabs */}
          <div className="flex border-b border-[var(--border-color)] bg-[var(--surface-0)]">
            {RIGHT_TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setRightTab(tab.id)}
                className={`flex flex-1 items-center justify-center gap-1.5 py-2 text-xs font-medium transition border-b-2 ${
                  rightTab === tab.id
                    ? 'border-blue-500 text-blue-400'
                    : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                }`}
              >
                <tab.icon size={11} />
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-3">
            <motion.div
              key={rightTab}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
            >
              {rightTab === 'query' && <AnswerPanel />}
              {rightTab === 'retrieval' && <RetrievalInspector />}
              {rightTab === 'prompt' && <PromptInspector />}
            </motion.div>
          </div>
        </div>
      </div>

      {/* BOTTOM: Metrics dashboard */}
      <MetricsDashboard />
    </div>
  )
}
