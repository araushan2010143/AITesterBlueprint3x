'use client';

import useSWR from 'swr';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { STATUS_LABELS } from '@/types';
import type { Application } from '@/types';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface Props {
  value: string;
  onChange: (id: string, app: Application) => void;
  className?: string;
}

export function ApplicationSelector({ value, onChange, className }: Props) {
  const { data, isLoading } = useSWR<{ data: Application[] }>('/api/applications', fetcher, {
    revalidateOnFocus: false,
  });

  const apps = data?.data ?? [];
  const selected = apps.find((a) => a.id === value);

  // Derive trigger label from the found app — avoids showing raw UUID
  // when value is pre-filled from URL params before SWR loads
  const triggerLabel = selected
    ? `${selected.company} — ${selected.role_title}`
    : isLoading
    ? 'Loading your applications…'
    : value
    ? 'Loading…'       // value set but apps not yet loaded
    : 'Select an application';

  return (
    <div className={`space-y-2 ${className ?? ''}`}>
      <Select
        value={value}
        onValueChange={(id) => {
          if (!id) return;
          const app = apps.find((a) => a.id === id);
          if (app) onChange(id, app);
        }}
      >
        <SelectTrigger className="w-full" aria-label="Select an application">
          {/* Render label directly — prevents raw UUID showing when value pre-set from URL */}
          <span className={`text-sm truncate ${!value ? 'text-muted-foreground' : ''}`}>
            {triggerLabel}
          </span>
        </SelectTrigger>
        <SelectContent>
          {apps.map((app) => (
            <SelectItem key={app.id} value={app.id}>
              <span className="font-medium">{app.company}</span>
              <span className="text-muted-foreground"> — {app.role_title}</span>
            </SelectItem>
          ))}
          {!isLoading && apps.length === 0 && (
            <div className="px-3 py-4 text-sm text-center text-muted-foreground">
              No applications yet. Add one from the Kanban board.
            </div>
          )}
        </SelectContent>
      </Select>

      {selected && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{selected.company}</span>
          <span>·</span>
          <span>{selected.role_title}</span>
          <span>·</span>
          <Badge variant="secondary" className="text-xs py-0">
            {STATUS_LABELS[selected.status]}
          </Badge>
          {selected.ai_match_score !== null && (
            <>
              <span>·</span>
              <Badge
                className={`text-xs py-0 ${
                  selected.ai_match_score >= 75
                    ? 'bg-green-100 text-green-700'
                    : selected.ai_match_score >= 50
                    ? 'bg-yellow-100 text-yellow-700'
                    : 'bg-red-100 text-red-700'
                }`}
              >
                {selected.ai_match_score}% match
              </Badge>
            </>
          )}
        </div>
      )}
    </div>
  );
}
