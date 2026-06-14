'use client';

import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useApplications } from '@/hooks/useApplications';
import { useAppStore } from '@/store/useAppStore';
import { ApplicationDetailSheet } from '@/components/kanban/ApplicationDetailSheet';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { STATUS_LABELS, STATUS_COLORS, APPLICATION_STATUSES } from '@/types';
import type { ApplicationStatus } from '@/types';

const SOURCE_ICONS: Record<string, string> = {
  linkedin: '💼', naukri: '🇮🇳', email: '📧',
  referral: '🤝', manual: '✍️', extension: '🔌',
};

type SortKey = 'created_at' | 'updated_at' | 'company' | 'ai_match_score';

function SortIcon({ col, sortKey, sortDir }: { col: SortKey; sortKey: SortKey; sortDir: 'asc' | 'desc' }) {
  if (sortKey !== col) return <span className="text-muted-foreground/40 ml-1">↕</span>;
  return <span className="text-indigo-500 ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>;
}

export default function ApplicationsPage() {
  const [search, setSearch]       = useState('');
  const [statusFilter, setStatus] = useState<ApplicationStatus | 'all'>('all');
  const [sortKey, setSortKey]     = useState<SortKey>('created_at');
  const [sortDir, setSortDir]     = useState<'asc' | 'desc'>('desc');
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [deleting, setDeleting]   = useState(false);

  const { applications, isLoading, deleteApplication } = useApplications();
  const { setSelectedApplication } = useAppStore();

  const filtered = applications
    .filter(a => statusFilter === 'all' || a.status === statusFilter)
    .filter(a => {
      const q = search.toLowerCase();
      return !q || a.company.toLowerCase().includes(q) || a.role_title.toLowerCase().includes(q);
    })
    .sort((a, b) => {
      let av: string | number = a[sortKey] ?? '';
      let bv: string | number = b[sortKey] ?? '';
      if (typeof av === 'string') av = av.toLowerCase();
      if (typeof bv === 'string') bv = bv.toLowerCase();
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDir === 'asc' ? cmp : -cmp;
    });

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  }

  const exportCSV = useCallback(() => {
    const headers = ['Company', 'Role', 'Status', 'Source', 'AI Match %', 'Location', 'Salary Min', 'Salary Max', 'Currency', 'Applied Date', 'Added Date', 'Notes'];
    const rows = filtered.map(a => [
      a.company,
      a.role_title,
      STATUS_LABELS[a.status],
      a.source,
      a.ai_match_score ?? '',
      a.location ?? '',
      a.salary_min ?? '',
      a.salary_max ?? '',
      a.salary_currency ?? '',
      a.applied_at ? new Date(a.applied_at).toLocaleDateString() : '',
      new Date(a.created_at).toLocaleDateString(),
      (a.notes ?? '').replace(/[\n\r,]/g, ' '),
    ]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `applications_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${filtered.length} applications`);
  }, [filtered]);

  async function handleDelete() {
    if (!confirmId) return;
    setDeleting(true);
    try {
      await deleteApplication(confirmId);
      toast.success('Deleted');
      setConfirmId(null);
    } catch {
      toast.error('Failed to delete');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-foreground">All Applications</h2>
          <p className="text-sm text-muted-foreground mt-0.5">{filtered.length} of {applications.length} shown</p>
        </div>
        {filtered.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={exportCSV}
            aria-label="Export applications to CSV"
            className="gap-1.5"
          >
            ⬇ Export CSV
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Input
          placeholder="Search company or role…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="max-w-xs h-9 text-sm"
        />
        <Select value={statusFilter} onValueChange={v => setStatus(v as ApplicationStatus | 'all')}>
          <SelectTrigger className="w-40 h-9 text-sm">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {APPLICATION_STATUSES.map(s => (
              <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={sortKey} onValueChange={v => setSortKey(v as SortKey)}>
          <SelectTrigger className="w-40 h-9 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="created_at">Date Added</SelectItem>
            <SelectItem value="updated_at">Last Updated</SelectItem>
            <SelectItem value="company">Company</SelectItem>
            <SelectItem value="ai_match_score">AI Match</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">
          {[1,2,3,4,5].map(i => (
            <div key={i} className="h-14 bg-muted rounded-lg animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <p className="text-5xl mb-4">📋</p>
          <h3 className="font-semibold text-foreground mb-1">
            {applications.length === 0 ? 'No applications yet' : 'No results'}
          </h3>
          <p className="text-sm text-muted-foreground">
            {applications.length === 0
              ? 'Click "+ Add Job" on the Kanban board to get started.'
              : 'Try clearing your filters.'}
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 border-b border-border">
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  <button onClick={() => toggleSort('company')} className="flex items-center hover:text-foreground">
                    Company <SortIcon col="company" sortKey={sortKey} sortDir={sortDir} />
                  </button>
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden md:table-cell">
                  Role
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Status
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden lg:table-cell">
                  Source
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden lg:table-cell">
                  <button onClick={() => toggleSort('ai_match_score')} className="flex items-center hover:text-foreground">
                    AI Match <SortIcon col="ai_match_score" sortKey={sortKey} sortDir={sortDir} />
                  </button>
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden md:table-cell">
                  <button onClick={() => toggleSort('created_at')} className="flex items-center hover:text-foreground">
                    Added <SortIcon col="created_at" sortKey={sortKey} sortDir={sortDir} />
                  </button>
                </th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map(app => (
                <tr
                  key={app.id}
                  onClick={() => setSelectedApplication(app.id)}
                  className="hover:bg-muted/30 cursor-pointer transition-colors group"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded bg-indigo-100 dark:bg-indigo-900 flex items-center justify-center text-xs font-bold text-indigo-700 dark:text-indigo-300 shrink-0">
                        {app.company.slice(0, 2).toUpperCase()}
                      </div>
                      <span className="font-medium text-foreground">{app.company}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">
                    {app.role_title}
                  </td>
                  <td className="px-4 py-3">
                    <Badge className={`${STATUS_COLORS[app.status]} text-white text-xs py-0`}>
                      {STATUS_LABELS[app.status]}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell">
                    <span className="text-base" title={app.source}>{SOURCE_ICONS[app.source] ?? '✍️'}</span>
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell">
                    {app.ai_match_score !== null ? (
                      <span className={`font-bold text-sm ${
                        app.ai_match_score >= 75 ? 'text-green-500' :
                        app.ai_match_score >= 50 ? 'text-yellow-500' : 'text-red-500'
                      }`}>
                        {app.ai_match_score}%
                      </span>
                    ) : (
                      <span className="text-muted-foreground/40 text-xs">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs hidden md:table-cell whitespace-nowrap">
                    {new Date(app.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={(e) => { e.stopPropagation(); setConfirmId(app.id); }}
                      aria-label={`Delete ${app.company} application`}
                      className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all text-xs px-2 py-1 rounded"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ApplicationDetailSheet />

      <ConfirmDialog
        open={!!confirmId}
        onOpenChange={(open) => { if (!open) setConfirmId(null); }}
        title="Delete application?"
        description={`Remove this application from your list. This cannot be undone.`}
        confirmLabel="Delete"
        loading={deleting}
        onConfirm={handleDelete}
      />
    </div>
  );
}
