import { create } from "zustand";
import { persist } from "zustand/middleware";

interface AppStore {
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  commandOpen: boolean;
  setCommandOpen: (v: boolean) => void;
  recentAgents: string[];
  addRecentAgent: (label: string) => void;
}

export const useAppStore = create<AppStore>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      commandOpen: false,
      setCommandOpen: (v) => set({ commandOpen: v }),
      recentAgents: [],
      addRecentAgent: (label) =>
        set((s) => ({
          recentAgents: [label, ...s.recentAgents.filter((r) => r !== label)].slice(0, 5),
        })),
    }),
    {
      name: "qa-rag-ui",
      partialize: (s) => ({ sidebarCollapsed: s.sidebarCollapsed, recentAgents: s.recentAgents }),
    }
  )
);
