'use client';

import { useEffect } from 'react';
import { useAppStore } from '@/store/useAppStore';

export function useKeyboardShortcuts() {
  const setAddModalOpen = useAppStore((s) => s.setAddModalOpen);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName;
      const isTyping = tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable;
      if (isTyping || e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        setAddModalOpen(true);
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setAddModalOpen]);
}
