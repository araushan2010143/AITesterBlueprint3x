'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAppStore } from '@/store/useAppStore';
import { useApplications } from '@/hooks/useApplications';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { STATUS_LABELS, STATUS_COLORS, APPLICATION_STATUSES } from '@/types';
import type { Application, ApplicationStatus, ApplicationPriority } from '@/types';

const PRIORITY_OPTIONS: { value: ApplicationPriority; label: string; className: string }[] = [
  { value: 'urgent', label: '🔴 Urgent', className: 'text-red-600 dark:text-red-400' },
  { value: 'high',   label: '🟠 High',   className: 'text-orange-600 dark:text-orange-400' },
  { value: 'medium', label: '🟡 Medium', className: 'text-yellow-600 dark:text-yellow-400' },
  { value: 'low',    label: '⚪ Low',    className: 'text-muted-foreground' },
];

const REMOTE_LABELS = { remote: 'Remote', hybrid: 'Hybrid', onsite: 'Onsite' };

const AI_ACTIONS = [
  { label: 'Tailor Resume', icon: '📄', path: '/ai/resume', desc: 'Match your resume to this JD' },
  { label: 'Cover Letter', icon: '✉️', path: '/ai/cover-letter', desc: 'Write a personalised letter' },
  { label: 'Cold Email',    icon: '📧', path: '/ai/cold-email',   desc: 'Reach the hiring manager' },
  { label: 'Interview Prep', icon: '🎯', path: '/ai/prep',       desc: 'AI-generated prep questions' },
];

export function ApplicationDetailSheet() {
  const router = useRouter();
  const { selectedApplicationId, setSelectedApplication } = useAppStore();
  const { applications, updateStatus, deleteApplication, mutate } = useApplications();

  const app = applications.find((a) => a.id === selectedApplicationId) ?? null;

  const [editingNotes, setEditingNotes] = useState(false);
  const [notes, setNotes] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  function openSheet(a: Application) {
    setNotes(a.notes ?? '');
    setEditingNotes(false);
  }

  async function handleStatusChange(newStatus: ApplicationStatus) {
    if (!app) return;
    try {
      await updateStatus(app.id, newStatus);
      toast.success(`Moved to ${STATUS_LABELS[newStatus]}`);
    } catch {
      toast.error('Failed to update status');
    }
  }

  async function saveNotes() {
    if (!app) return;
    setSavingNotes(true);
    try {
      await fetch(`/api/applications/${app.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes }),
      });
      await mutate();
      setEditingNotes(false);
      toast.success('Notes saved');
    } catch {
      toast.error('Failed to save notes');
    } finally {
      setSavingNotes(false);
    }
  }

  async function handleDelete() {
    if (!app) return;
    setDeleting(true);
    try {
      await deleteApplication(app.id);
      setSelectedApplication(null);
      toast.success('Application deleted');
    } catch {
      toast.error('Failed to delete');
    } finally {
      setDeleting(false);
    }
  }

  const isOpen = !!selectedApplicationId;

  return (
    <Sheet
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) setSelectedApplication(null);
        else if (app) openSheet(app);
      }}
    >
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto" side="right">
        {app && (
          <>
            <SheetHeader className="pb-4 border-b">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-indigo-100 dark:bg-indigo-900 flex items-center justify-center text-sm font-bold text-indigo-700 dark:text-indigo-300 shrink-0">
                  {app.company.slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <SheetTitle className="text-base leading-tight">{app.role_title}</SheetTitle>
                  <p className="text-sm text-muted-foreground mt-0.5">{app.company}</p>
                </div>
                {app.ai_match_score !== null && (
                  <span
                    className={`text-lg font-bold shrink-0 ${
                      app.ai_match_score >= 75 ? 'text-green-500' :
                      app.ai_match_score >= 50 ? 'text-yellow-500' : 'text-red-500'
                    }`}
                  >
                    {app.ai_match_score}%
                  </span>
                )}
              </div>
            </SheetHeader>

            <div className="py-4 space-y-5">

              {/* Status + meta */}
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground uppercase tracking-wide">Status</Label>
                    <Select value={app.status} onValueChange={(v) => v && handleStatusChange(v as ApplicationStatus)}>
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {APPLICATION_STATUSES.map((s) => (
                          <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground uppercase tracking-wide">Priority</Label>
                    <Select
                      value={app.priority ?? 'medium'}
                      onValueChange={async (v) => {
                        if (!v) return;
                        await fetch(`/api/applications/${app.id}`, {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ priority: v as ApplicationPriority }),
                        });
                        await mutate();
                      }}
                    >
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PRIORITY_OPTIONS.map((p) => (
                          <SelectItem key={p.value} value={p.value}>
                            <span className={p.className}>{p.label}</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Badge className={`${STATUS_COLORS[app.status]} text-white text-xs`}>
                    {STATUS_LABELS[app.status]}
                  </Badge>
                  <Badge variant="outline" className="text-xs">{REMOTE_LABELS[app.remote_type]}</Badge>
                  {app.location && (
                    <Badge variant="outline" className="text-xs">📍 {app.location}</Badge>
                  )}
                  {app.salary_min && (
                    <Badge variant="outline" className="text-xs">
                      {app.salary_currency} {(app.salary_min / 100000).toFixed(0)}L+
                    </Badge>
                  )}
                  {app.source && (
                    <Badge variant="secondary" className="text-xs capitalize">{app.source}</Badge>
                  )}
                </div>

                {app.job_url && (
                  <a
                    href={app.job_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-indigo-500 hover:text-indigo-400 underline underline-offset-2 truncate block"
                  >
                    {app.job_url}
                  </a>
                )}

                <div className="flex gap-4 text-xs text-muted-foreground">
                  <span>Added {new Date(app.created_at).toLocaleDateString()}</span>
                  {app.applied_at && (
                    <span>Applied {new Date(app.applied_at).toLocaleDateString()}</span>
                  )}
                </div>
              </div>

              {/* AI Actions */}
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold mb-2">AI Actions</p>
                <div className="grid grid-cols-2 gap-2">
                  {AI_ACTIONS.map((action) => (
                    <button
                      key={action.path}
                      onClick={() => {
                        setSelectedApplication(null);
                        router.push(
                          `${action.path}?company=${encodeURIComponent(app.company)}&role=${encodeURIComponent(app.role_title)}&id=${app.id}`
                        );
                      }}
                      className="flex items-start gap-2 p-3 rounded-lg border border-border hover:border-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950 text-left transition-colors group"
                    >
                      <span className="text-base">{action.icon}</span>
                      <div>
                        <p className="text-xs font-semibold text-foreground group-hover:text-indigo-600 dark:group-hover:text-indigo-400">
                          {action.label}
                        </p>
                        <p className="text-xs text-muted-foreground">{action.desc}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Notes */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">Notes</p>
                  {!editingNotes ? (
                    <button
                      onClick={() => { setNotes(app.notes ?? ''); setEditingNotes(true); }}
                      className="text-xs text-indigo-500 hover:text-indigo-400"
                    >
                      Edit
                    </button>
                  ) : (
                    <div className="flex gap-2">
                      <button onClick={() => setEditingNotes(false)} className="text-xs text-muted-foreground hover:text-foreground">
                        Cancel
                      </button>
                      <button onClick={saveNotes} disabled={savingNotes} className="text-xs text-indigo-500 hover:text-indigo-400 disabled:opacity-50">
                        {savingNotes ? 'Saving…' : 'Save'}
                      </button>
                    </div>
                  )}
                </div>

                {editingNotes ? (
                  <Textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={5}
                    placeholder="Add notes, interview feedback, contacts…"
                    className="text-sm resize-none"
                    autoFocus
                  />
                ) : (
                  <div
                    onClick={() => { setNotes(app.notes ?? ''); setEditingNotes(true); }}
                    className="min-h-16 p-3 rounded-md border border-border text-sm text-muted-foreground cursor-text hover:border-indigo-400 whitespace-pre-wrap"
                  >
                    {app.notes || 'Click to add notes…'}
                  </div>
                )}
              </div>

              {/* Danger zone */}
              <div className="pt-2 border-t">
                <Button
                  variant="outline"
                  size="sm"
                  className="text-destructive border-destructive/30 hover:bg-destructive/10 w-full"
                  onClick={() => setConfirmOpen(true)}
                  disabled={deleting}
                >
                  Delete Application
                </Button>
              </div>
            </div>
          </>
        )}
      </SheetContent>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Delete application?"
        description={`Remove ${app?.company} — ${app?.role_title} from your board. This cannot be undone.`}
        confirmLabel="Delete"
        loading={deleting}
        onConfirm={handleDelete}
      />
    </Sheet>
  );
}
