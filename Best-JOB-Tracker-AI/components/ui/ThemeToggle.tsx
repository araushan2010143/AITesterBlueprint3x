'use client';

import { useTheme } from 'next-themes';
import { Sun, Moon, Monitor } from 'lucide-react';
import { useEffect, useState } from 'react';

const THEMES = ['light', 'dark', 'system'] as const;
type Theme = (typeof THEMES)[number];

const ICONS: Record<Theme, React.ReactNode> = {
  light:  <Sun  className="h-4 w-4" />,
  dark:   <Moon className="h-4 w-4" />,
  system: <Monitor className="h-4 w-4" />,
};

const LABELS: Record<Theme, string> = {
  light:  'Light',
  dark:   'Dark',
  system: 'System',
};

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);
  if (!mounted) return <div className="h-8 w-8" />;

  const current = (theme as Theme) ?? 'system';

  function cycle() {
    const idx = THEMES.indexOf(current);
    setTheme(THEMES[(idx + 1) % THEMES.length]);
  }

  return (
    <button
      onClick={cycle}
      aria-label={`Switch theme (current: ${LABELS[current]})`}
      title={`Theme: ${LABELS[current]} — click to change`}
      className="flex items-center justify-center h-8 w-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
    >
      {ICONS[current]}
    </button>
  );
}
