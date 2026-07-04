import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../services/api'
import { useRAGStore } from '../store/ragStore'

export function useStatus() {
  const setAppStatus = useRAGStore((s) => s.setAppStatus)
  return useQuery({
    queryKey: ['status'],
    queryFn: async () => {
      const data = await api.getStatus()
      setAppStatus(data)
      return data
    },
    refetchInterval: (query) => {
      const status = query.state.data?.status
      return status === 'ingesting' ? 1000 : 5000
    },
  })
}

export function useIngest() {
  const qc = useQueryClient()
  const store = useRAGStore()

  return useMutation({
    mutationFn: async (req: { file: File; chunk_size: number; chunk_overlap: number }) => {
      store.setIsIngesting(true)
      store.setAllStages('idle')
      store.setStageStatus('pdf', 'processing')
      store.setStageStatus('chunker', 'processing')
      store.setStageStatus('embedder', 'processing')

      const result = await api.ingestFile(req.file, {
        chunk_size: req.chunk_size,
        chunk_overlap: req.chunk_overlap,
      })

      store.setStageStatus('embedder', 'complete')
      store.setStageStatus('chromadb', 'processing')
      await new Promise((r) => setTimeout(r, 300))
      store.setStageStatus('chromadb', 'complete')
      return result
    },
    onSuccess: async (data) => {
      store.setIngestResult(data)
      store.setIsIngesting(false)
      qc.invalidateQueries({ queryKey: ['status'] })
      qc.invalidateQueries({ queryKey: ['documents'] })
      qc.invalidateQueries({ queryKey: ['chunks'] })
      qc.invalidateQueries({ queryKey: ['metrics'] })
    },
    onError: () => {
      store.setIsIngesting(false)
      store.setAllStages('error')
    },
  })
}

export function useReindex() {
  const qc = useQueryClient()
  const store = useRAGStore()

  return useMutation({
    mutationFn: async (req: { file: File; chunk_size: number; chunk_overlap: number }) => {
      store.setIsIngesting(true)
      store.setAllStages('processing')
      const result = await api.reindexFile(req.file, {
        chunk_size: req.chunk_size,
        chunk_overlap: req.chunk_overlap,
      })
      store.setAllStages('complete')
      return result
    },
    onSuccess: (data) => {
      store.setIngestResult(data)
      store.setIsIngesting(false)
      qc.invalidateQueries()
    },
    onError: () => {
      store.setIsIngesting(false)
      store.setAllStages('error')
    },
  })
}

export function useDocuments() {
  const setDocuments = useRAGStore((s) => s.setDocuments)
  return useQuery({
    queryKey: ['documents'],
    queryFn: async () => {
      const data = await api.getDocuments()
      setDocuments(data)
      return data
    },
    staleTime: 30_000,
  })
}

export function useChunks(docId?: string, page?: number) {
  const setChunks = useRAGStore((s) => s.setChunks)
  return useQuery({
    queryKey: ['chunks', docId, page],
    queryFn: async () => {
      const data = await api.getChunks({ doc_id: docId, page })
      if (!docId && !page) setChunks(data)
      return data
    },
    staleTime: 30_000,
  })
}
