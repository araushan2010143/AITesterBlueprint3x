'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Bookmark, ExternalLink, Sparkles, Trash2, CheckCircle2, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { QuickSaveModal } from '@/components/kanban/QuickSaveModal';
import { useApplications } from '@/hooks/useApplications';
import { useAppStore } from '@/store/useAppStore';
import type { Application } from '@/types';

// ── Platform config ──────────────────────────────────────────────────────────
const SOURCE_CONFIG: Record<string, { label: string; icon: string; badge: string }> = {
  linkedin:  { label: 'LinkedIn',  icon: '💼', badge: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300' },
  naukri:    { label: 'Naukri',    icon: '🇮🇳', badge: 'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300' },
  referral:  { label: 'Referral',  icon: '🤝', badge: 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300' },
  email:     { label: 'Email',     icon: '📧', badge: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300' },
  extension: { label: 'Extension', icon: '🔌', badge: 'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300' },
  manual:    { label: 'Manual',    icon: '✍️', badge: 'bg-muted text-muted-foreground' },
};

const PRIORITY_BADGE: Record<string, string> = {
  urgent: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
  high:   'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300',
  medium: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300',
  low:    'bg-muted text-muted-foreground',
};

const AI_ACTIONS = [
  { label: 'Resume',   path: '/ai/resume' },
  { label: 'Cover Letter', path: '/ai/cover-letter' },
  { label: 'Cold Email',   path: '/ai/cold-email' },
  { label: 'Prep',         path: '/ai/prep' },
];

// ── Saved Job Card ───────────────────────────────────────────────────────────
function SavedJobCard({
  app,
  onApply,
  onRemove,
}: {
  app: Application;
  onApply: (app: Application) => void;
  onRemove: (app: Application) => void;
}) {
  const router = useRouter();
  const src = SOURCE_CONFIG[app.source] ?? SOURCE_CONFIG.manual;

  return (
    <div className="bg-card border border-border rounded-xl p-4 hover:border-indigo-400/50 hover:shadow-sm transition-all group">
      <div className="flex items-start justify-between gap-3">
        {/* Company avatar + info */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-lg bg-indigo-100 dark:bg-indigo-900 flex items-center justify-center text-sm font-bold text-indigo-700 dark:text-indigo-300 shrink-0">
            {app.company.slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">{app.company}</p>
            <p className="text-sm text-muted-foreground truncate">{app.role_title}</p>
          </div>
        </div>

        {/* Priority badge */}
        {app.priority && app.priority !== 'low' && (
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${PRIORITY_BADGE[app.priority] ?? ''}`}>
            {app.priority === 'urgent' ? '🔴 Urgent' : app.priority === 'high' ? '🟠 High' : '🟡 Medium'}
          </span>
        )}
      </div>

      {/* Meta row */}
      <div className="flex flex-wrap items-center gap-2 mt-3">
        <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${src.badge}`}>
          <span>{src.icon}</span>
          <span>{src.label}</span>
        </span>
        {app.location && (
          <span className="text-xs text-muted-foreground">📍 {app.location}</span>
        )}
        {app.salary_min && (
          <span className="text-xs text-muted-foreground">
            {app.salary_currency} {(app.salary_min / 100000).toFixed(0)}L{app.salary_max ? `–${(app.salary_max / 100000).toFixed(0)}L` : '+'}
          </span>
        )}
        {app.remote_type && (
          <Badge variant="outline" className="text-xs px-1.5 py-0">{app.remote_type}</Badge>
        )}
        <span className="text-xs text-muted-foreground ml-auto">
          Saved {new Date(app.created_at).toLocaleDateString()}
        </span>
      </div>

      {/* Job URL */}
      {app.job_url && (
        <a
          href={app.job_url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 mt-2 text-xs text-indigo-500 hover:text-indigo-400 underline underline-offset-2 truncate"
        >
          <ExternalLink className="h-3 w-3 shrink-0" />
          <span className="truncate">{app.job_url}</span>
        </a>
      )}

      {/* Notes preview */}
      {app.notes && (
        <p className="mt-2 text-xs text-muted-foreground line-clamp-2 italic">
          &ldquo;{app.notes}&rdquo;
        </p>
      )}

      {/* Action row */}
      <div className="flex items-center gap-2 mt-4 pt-3 border-t border-border flex-wrap">
        <Button
          size="sm"
          className="bg-indigo-600 hover:bg-indigo-700 text-white gap-1.5 h-7 text-xs"
          onClick={() => onApply(app)}
        >
          <CheckCircle2 className="h-3.5 w-3.5" />
          Apply Now
        </Button>

        {app.job_url && (
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 h-7 text-xs"
            onClick={() => window.open(app.job_url!, '_blank')}
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Visit Job
          </Button>
        )}

        <div className="relative group/ai">
          <Button size="sm" variant="outline" className="gap-1.5 h-7 text-xs">
            <Sparkles className="h-3.5 w-3.5 text-indigo-500" />
            AI Tools
          </Button>
          <div className="absolute left-0 top-full mt-1 z-10 hidden group-hover/ai:block bg-card border border-border rounded-lg shadow-lg p-1 min-w-36">
            {AI_ACTIONS.map(a => (
              <button
                key={a.path}
                onClick={() => router.push(`${a.path}?id=${app.id}`)}
                className="w-full text-left text-xs px-3 py-1.5 rounded hover:bg-muted transition-colors"
              >
                {a.label}
              </button>
            ))}
          </div>
        </div>

        <Button
          size="sm"
          variant="ghost"
          className="gap-1.5 h-7 text-xs text-muted-foreground hover:text-destructive ml-auto"
          onClick={() => onRemove(app)}
        >
          <Trash2 className="h-3.5 w-3.5" />
          Remove
        </Button>
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function SavedJobsPage() {
  const { applications, isLoading, updateStatus, deleteApplication } = useApplications();
  const { setQuickSaveOpen } = useAppStore();
  const [search, setSearch]         = useState('');
  const [removeTarget, setRemoveTarget] = useState<Application | null>(null);
  const [applying, setApplying]     = useState<string | null>(null);
  const [removing, setRemoving]     = useState(false);

  const saved = applications
    .filter(a => a.status === 'bookmarked')
    .filter(a => {
      const q = search.toLowerCase();
      return !q || a.company.toLowerCase().includes(q) || a.role_title.toLowerCase().includes(q);
    });

  async function handleApply(app: Application) {
    setApplying(app.id);
    try {
      await updateStatus(app.id, 'applied');
      toast.success(`Moved "${app.role_title}" at ${app.company} to Applied!`);
    } catch {
      toast.error('Failed to update status');
    } finally {
      setApplying(null);
    }
  }

  async function handleRemove() {
    if (!removeTarget) return;
    setRemoving(true);
    try {
      await deleteApplication(removeTarget.id);
      toast.success('Job removed from saved list');
      setRemoveTarget(null);
    } catch {
      toast.error('Failed to remove');
    } finally {
      setRemoving(false);
    }
  }

  if (isLoading) {
    return (
      <div className="p-6 space-y-3">
        {[1,2,3].map(i => <div key={i} className="h-40 bg-muted rounded-xl animate-pulse" />)}
      </div>
    );
  }

  return (
    <>
      <div className="p-6 space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
              <Bookmark className="h-5 w-5 text-indigo-500" />
              Saved Jobs
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              {saved.length} job{saved.length !== 1 ? 's' : ''} saved — review and apply when ready
            </p>
          </div>
          <Button
            onClick={() => setQuickSaveOpen(true)}
            className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2"
          >
            <span>💾</span> Save a Job
          </Button>
        </div>

        {/* Search */}
        {applications.filter(a => a.status === 'bookmarked').length > 0 && (
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search saved jobs…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 h-9 text-sm"
            />
          </div>
        )}

        {/* Cards grid */}
        {saved.length > 0 ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {saved.map(app => (
              <SavedJobCard
                key={app.id}
                app={app}
                onApply={handleApply}
                onRemove={setRemoveTarget}
              />
            ))}
          </div>
        ) : (
          /* Empty state */
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-16 h-16 rounded-2xl bg-indigo-100 dark:bg-indigo-950 flex items-center justify-center mb-4">
              <Bookmark className="h-8 w-8 text-indigo-500" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">
              {search ? 'No saved jobs match your search' : 'No saved jobs yet'}
            </h3>
            <p className="text-sm text-muted-foreground mb-6 max-w-sm">
              {search
                ? 'Try a different search term.'
                : 'Paste a job URL from LinkedIn, Naukri, Indeed, or any platform and save it to review later.'}
            </p>
            {!search && (
              <Button
                onClick={() => setQuickSaveOpen(true)}
                className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2"
              >
                <span>💾</span> Save Your First Job
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Modals */}
      <QuickSaveModal />

      <ConfirmDialog
        open={!!removeTarget}
        onOpenChange={(o) => { if (!o) setRemoveTarget(null); }}
        title="Remove saved job?"
        description={`Remove "${removeTarget?.role_title}" at ${removeTarget?.company} from your saved list.`}
        confirmLabel="Remove"
        loading={removing}
        onConfirm={handleRemove}
      />

      {/* Invisible applying state — toasts handle feedback */}
      {applying && <span className="hidden">{applying}</span>}
    </>
  );
}
