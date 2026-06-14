'use client';

import { FileText, Mail, Send, GraduationCap, type LucideIcon } from 'lucide-react';

interface Config {
  icon: LucideIcon;
  title: string;
  description: string;
  iconBg: string;
  iconColor: string;
  accent: string;
}

const CONFIGS: Record<string, Config> = {
  resume: {
    icon: FileText,
    title: 'Resume Tailoring',
    description: 'Match your resume to the job description and get an ATS match score.',
    iconBg: 'bg-indigo-100 dark:bg-indigo-950',
    iconColor: 'text-indigo-600 dark:text-indigo-400',
    accent: 'from-indigo-500/10 via-blue-500/5 to-transparent',
  },
  'cover-letter': {
    icon: Mail,
    title: 'Cover Letter Generator',
    description: 'Personalised letters enriched with real company news via web search.',
    iconBg: 'bg-purple-100 dark:bg-purple-950',
    iconColor: 'text-purple-600 dark:text-purple-400',
    accent: 'from-purple-500/10 via-pink-500/5 to-transparent',
  },
  'cold-email': {
    icon: Send,
    title: 'Cold Email Composer',
    description: '5-line AIDA emails that get replies from hiring managers.',
    iconBg: 'bg-amber-100 dark:bg-amber-950',
    iconColor: 'text-amber-600 dark:text-amber-400',
    accent: 'from-amber-500/10 via-orange-500/5 to-transparent',
  },
  prep: {
    icon: GraduationCap,
    title: 'Interview Prep',
    description: 'Company-specific questions with STAR frameworks and coaching tips.',
    iconBg: 'bg-emerald-100 dark:bg-emerald-950',
    iconColor: 'text-emerald-600 dark:text-emerald-400',
    accent: 'from-emerald-500/10 via-teal-500/5 to-transparent',
  },
};

interface Props {
  page: keyof typeof CONFIGS;
}

export function AIPageHeader({ page }: Props) {
  const c = CONFIGS[page];
  if (!c) return null;
  const Icon = c.icon;

  return (
    <div className={`bg-gradient-to-r ${c.accent} border-b border-border px-6 py-5`}>
      <div className="max-w-4xl mx-auto flex items-center gap-4">
        <div className={`w-11 h-11 rounded-xl ${c.iconBg} flex items-center justify-center shrink-0`}>
          <Icon className={`h-5 w-5 ${c.iconColor}`} />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-foreground leading-tight">{c.title}</h2>
          <p className="text-sm text-muted-foreground mt-0.5">{c.description}</p>
        </div>
      </div>
    </div>
  );
}
