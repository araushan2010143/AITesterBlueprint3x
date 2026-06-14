'use client';

import { create } from 'zustand';
import type { Application, ApplicationStatus } from '@/types';

interface AppStore {
  // Kanban filter state
  searchQuery: string;
  filterStatus: ApplicationStatus | 'all';
  filterSource: string | 'all';
  sortBy: 'created_at' | 'updated_at' | 'ai_match_score';

  // UI state
  selectedApplicationId: string | null;
  isAddModalOpen: boolean;
  isQuickSaveOpen: boolean;

  // Actions
  setSearchQuery: (q: string) => void;
  setFilterStatus: (s: ApplicationStatus | 'all') => void;
  setFilterSource: (s: string | 'all') => void;
  setSortBy: (s: AppStore['sortBy']) => void;
  setSelectedApplication: (id: string | null) => void;
  setAddModalOpen: (open: boolean) => void;
  setQuickSaveOpen: (open: boolean) => void;

  // Optimistic updates cache
  optimisticUpdates: Record<string, Partial<Application>>;
  applyOptimisticUpdate: (id: string, update: Partial<Application>) => void;
  clearOptimisticUpdate: (id: string) => void;
}

export const useAppStore = create<AppStore>((set) => ({
  searchQuery: '',
  filterStatus: 'all',
  filterSource: 'all',
  sortBy: 'created_at',
  selectedApplicationId: null,
  isAddModalOpen: false,
  isQuickSaveOpen: false,
  optimisticUpdates: {},

  setSearchQuery: (q) => set({ searchQuery: q }),
  setFilterStatus: (s) => set({ filterStatus: s }),
  setFilterSource: (s) => set({ filterSource: s }),
  setSortBy: (s) => set({ sortBy: s }),
  setSelectedApplication: (id) => set({ selectedApplicationId: id }),
  setAddModalOpen: (open) => set({ isAddModalOpen: open }),
  setQuickSaveOpen: (open) => set({ isQuickSaveOpen: open }),

  applyOptimisticUpdate: (id, update) =>
    set((state) => ({
      optimisticUpdates: { ...state.optimisticUpdates, [id]: update },
    })),
  clearOptimisticUpdate: (id) =>
    set((state) => {
      const updates = { ...state.optimisticUpdates };
      delete updates[id];
      return { optimisticUpdates: updates };
    }),
}));
