import { useRAGStore } from '../store/ragStore'
import type { HistoryEntry } from '../types'

const STAGE_TO_NODE: Record<string, { active: string[]; done: string[] }> = {
  embedding:  { active: ['retriever'],            done: [] },
  retrieving: { active: ['retriever'],            done: [] },
  generating: { active: ['groq'],                 done: ['retriever'] },
  done:       { active: [],                       done: ['groq', 'answer'] },
}

export function useRAGQuery() {
  const query = async (question: string) => {
    const s = useRAGStore.getState()
    s.startStreaming()
    s.setStageStatus('retriever', 'processing')

    const { settings } = s

    try {
      s.setStreamingStage('embedding')

      const response = await fetch('/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question,
          top_k: settings.top_k,
          temperature: settings.temperature,
          max_tokens: settings.max_tokens,
        }),
      })

      if (!response.ok) {
        const err = await response.json().catch(() => ({ detail: 'Query failed' }))
        throw new Error(err.detail ?? 'Query failed')
      }

      const data = await response.json()

      // Animate through stages so the pipeline UI still looks alive
      s.setStreamingStage('retrieving')
      s.setStreamingSources(data.sources, data.prompt_used)
      s.setStageStatus('retriever', 'complete')

      s.setStreamingStage('generating')
      s.setStageStatus('groq', 'processing')

      // Set full answer at once (fetch mode — no per-token streaming)
      s.appendToken(data.answer)

      s.setStageStatus('groq', 'complete')
      s.setStageStatus('answer', 'complete')

      s.finalizeStreaming({
        embed_ms:  data.metrics.query_latency_ms - data.metrics.search_latency_ms,
        search_ms: data.metrics.search_latency_ms,
        llm_ms:    data.metrics.llm_response_time_ms,
      })

      const entry: HistoryEntry = {
        id: crypto.randomUUID(),
        question,
        answer: data.answer,
        sources: data.sources,
        metrics: data.metrics,
        timestamp: Date.now(),
      }
      s.addToHistory(entry)

    } catch (err) {
      console.error('[RAG query]', err)
      useRAGStore.getState().resetStreaming()
      useRAGStore.getState().setStageStatus('groq', 'error')
    }
  }

  return { query }
}
