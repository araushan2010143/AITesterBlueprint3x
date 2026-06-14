'use client';

import { useMemo } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { motion } from 'framer-motion';
import { Badge } from '@/components/ui/badge';
import { useAppStore } from '@/store/useAppStore';
import type { Application, ApplicationPriority } from '@/types';

interface Props {
  application: Application;
}

const SOURCE_ICONS: Record<string, string> = {
  linkedin: '💼',
  naukri: '🇮🇳',
  email: '📧',
  referral: '🤝',
  manual: '✍️',
  extension: '🔌',
};

const PRIORITY_CONFIG: Record<ApplicationPriority, { label: string; className: string }> = {
  urgent: { label: '🔴 Urgent', className: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300' },
  high:   { label: '🟠 High',   className: 'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300' },
  medium: { label: '🟡 Medium', className: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300' },
  low:    { label: '⚪ Low',    className: 'bg-muted text-muted-foreground' },
};

export function ApplicationCard({ application: app }: Props) {
  const setSelectedApplication = useAppStore((s) => s.setSelectedApplication);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: app.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const updatedMs = new Date(app.updated_at).getTime();
  // eslint-disable-next-line react-hooks/purity
  const daysSinceUpdate = useMemo(() => Math.floor((Date.now() - updatedMs) / 86400000), [updatedMs]);

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      aria-label={`${app.company} — ${app.role_title}. Drag to move between columns.`}
      role="button"
    >
      <motion.div
        layoutId={app.id}
        whileHover={{ y: -2 }}
        onClick={() => setSelectedApplication(app.id)}
        className="bg-card border border-border rounded-lg p-3 cursor-pointer hover:border-indigo-400 hover:shadow-sm transition-all group"
      >
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded bg-indigo-100 dark:bg-indigo-900 flex items-center justify-center text-xs font-bold text-indigo-700 dark:text-indigo-300 shrink-0">
              {app.company.slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate text-foreground">{app.company}</p>
              <p className="text-xs text-muted-foreground truncate">{app.role_title}</p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <span className="text-base">{SOURCE_ICONS[app.source] ?? '✍️'}</span>
            {app.priority && app.priority !== 'low' && (
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full leading-none ${PRIORITY_CONFIG[app.priority]?.className ?? ''}`}>
                {PRIORITY_CONFIG[app.priority]?.label}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between mt-2">
          <div className="flex items-center gap-1.5">
            {app.remote_type && (
              <Badge variant="outline" className="text-xs px-1.5 py-0">
                {app.remote_type}
              </Badge>
            )}
            {app.salary_min && (
              <Badge variant="outline" className="text-xs px-1.5 py-0">
                {app.salary_currency} {(app.salary_min / 100000).toFixed(0)}L+
              </Badge>
            )}
          </div>
          {app.ai_match_score !== null && (
            <Badge
              aria-label={`AI match score: ${app.ai_match_score}%`}
              className={`text-xs px-1.5 py-0 font-bold ${
                app.ai_match_score >= 75
                  ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                  : app.ai_match_score >= 50
                  ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300'
                  : 'bg-red-100 text-red-600 dark:bg-red-900 dark:text-red-300'
              }`}
            >
              ✦ {app.ai_match_score}%
            </Badge>
          )}
        </div>

        <p className="text-xs text-muted-foreground mt-2">
          {daysSinceUpdate === 0
            ? 'Updated today'
            : `${daysSinceUpdate}d ago`}
        </p>
      </motion.div>
    </div>
  );
}
