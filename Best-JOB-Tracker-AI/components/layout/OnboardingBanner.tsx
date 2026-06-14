'use client';

import { useState, useEffect } from 'react';
import { X, Briefcase, Sparkles, BarChart2 } from 'lucide-react';

const STORAGE_KEY = 'jt_onboarding_dismissed';

const STEPS = [
  { icon: Briefcase,  title: 'Add a job',        desc: 'Click "+ Add Job" or use the Chrome extension to capture jobs instantly.' },
  { icon: Sparkles,   title: 'Let AI work',       desc: 'Tailor your resume, write a cover letter, or prep for interviews — all in one click.' },
  { icon: BarChart2,  title: 'Track & win',       desc: 'Drag cards across the Kanban board and watch your pipeline fill up.' },
];

export function OnboardingBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!localStorage.getItem(STORAGE_KEY)) setVisible(true);
  }, []);

  function dismiss() {
    localStorage.setItem(STORAGE_KEY, '1');
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="mx-6 mt-4 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/50 p-4 relative">
      <button
        onClick={dismiss}
        aria-label="Dismiss getting started guide"
        className="absolute top-3 right-3 text-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-300 transition-colors"
      >
        <X className="h-4 w-4" />
      </button>

      <p className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 uppercase tracking-widest mb-3">
        Getting started
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {STEPS.map(({ icon: Icon, title, desc }, i) => (
          <div key={i} className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center shrink-0">
              <Icon className="h-4 w-4 text-white" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">
                <span className="text-indigo-400 mr-1">{i + 1}.</span>{title}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
