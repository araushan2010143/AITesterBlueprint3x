import { useEffect } from 'react'
import { useRAGStore } from './store/ragStore'
import Header from './components/Header'
import PipelineFlow from './components/PipelineFlow'
import Home from './pages/Home'
import { useStatus } from './hooks/useIngest'

function StatusPoller() {
  useStatus()
  return null
}

export default function App() {
  const { isDark } = useRAGStore()

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark)
    document.documentElement.classList.toggle('light', !isDark)
  }, [isDark])

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-[var(--surface-0)] text-[var(--text-primary)]">
      <StatusPoller />
      <Header />
      <PipelineFlow />
      <div className="flex-1 overflow-y-auto min-h-0">
        <Home />
      </div>
    </div>
  )
}
