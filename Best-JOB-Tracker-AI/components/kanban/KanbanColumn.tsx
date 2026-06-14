'use client';

import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { ApplicationCard } from './ApplicationCard';
import { Badge } from '@/components/ui/badge';
import type { Application, ApplicationStatus } from '@/types';

const COLUMN_COLORS: Record<ApplicationStatus, string> = {
  bookmarked: 'bg-slate-100 dark:bg-slate-800',
  applied: 'bg-blue-50 dark:bg-blue-950',
  phone_screen: 'bg-yellow-50 dark:bg-yellow-950',
  technical: 'bg-orange-50 dark:bg-orange-950',
  final_round: 'bg-purple-50 dark:bg-purple-950',
  offer: 'bg-green-50 dark:bg-green-950',
  rejected: 'bg-red-50 dark:bg-red-950',
  ghosted: 'bg-gray-50 dark:bg-gray-900',
  withdrawn: 'bg-gray-50 dark:bg-gray-900',
};

const COLUMN_DOT: Record<ApplicationStatus, string> = {
  bookmarked: 'bg-slate-400',
  applied: 'bg-blue-500',
  phone_screen: 'bg-yellow-500',
  technical: 'bg-orange-500',
  final_round: 'bg-purple-500',
  offer: 'bg-green-500',
  rejected: 'bg-red-500',
  ghosted: 'bg-gray-400',
  withdrawn: 'bg-gray-500',
};

interface Props {
  status: ApplicationStatus;
  label: string;
  applications: Application[];
  isDragTarget?: boolean;
}

export function KanbanColumn({ status, label, applications, isDragTarget }: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: status });

  const highlighted = isOver || isDragTarget;

  return (
    <div className="flex flex-col w-64 shrink-0">
      <div className="flex items-center gap-2 mb-3">
        <div className={`w-2 h-2 rounded-full ${COLUMN_DOT[status]}`} />
        <h3 className="text-sm font-semibold text-foreground">{label}</h3>
        <Badge variant="secondary" className="ml-auto text-xs">
          {applications.length}
        </Badge>
      </div>

      <div
        ref={setNodeRef}
        className={`flex-1 min-h-24 rounded-xl p-2 space-y-2 transition-all duration-150 ${
          COLUMN_COLORS[status]
        } ${highlighted ? 'ring-2 ring-indigo-400 scale-[1.01]' : ''}`}
      >
        <SortableContext items={applications.map((a) => a.id)} strategy={verticalListSortingStrategy}>
          {applications.map((app) => (
            <ApplicationCard key={app.id} application={app} />
          ))}
        </SortableContext>

        {applications.length === 0 && (
          <div className="flex items-center justify-center h-16 text-xs text-muted-foreground">
            Drop here
          </div>
        )}
      </div>
    </div>
  );
}
