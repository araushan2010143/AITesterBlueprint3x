import { useQuery } from '@tanstack/react-query'
import { api } from '../services/api'
import { useRAGStore } from '../store/ragStore'

export function useMetrics() {
  const setMetrics = useRAGStore((s) => s.setMetrics)
  return useQuery({
    queryKey: ['metrics'],
    queryFn: async () => {
      const data = await api.getMetrics()
      setMetrics(data)
      return data
    },
    refetchInterval: 10_000,
    staleTime: 5_000
  })
}
