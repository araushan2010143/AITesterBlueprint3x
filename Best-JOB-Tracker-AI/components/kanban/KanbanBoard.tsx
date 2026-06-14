'use client';

import { useState, useCallback, useRef } from 'react';
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  type UniqueIdentifier,
} from '@dnd-kit/core';
import { toast } from 'sonner';
import { KanbanColumn } from './KanbanColumn';
import { ApplicationCard } from './ApplicationCard';
import { AddApplicationModal } from './AddApplicationModal';
import { ApplicationDetailSheet } from './ApplicationDetailSheet';
import { QuickSaveModal } from './QuickSaveModal';
import { useApplications } from '@/hooks/useApplications';
import { useAppStore } from '@/store/useAppStore';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { APPLICATION_STATUSES, STATUS_LABELS } from '@/types';
import type { Application, ApplicationStatus, ApplicationSource, ApplicationPriority } from '@/types';

const BOARD_STATUSES = APPLICATION_STATUSES.filter(
  (s) => s !== 'withdrawn'
) as ApplicationStatus[];

function isColumnId(id: UniqueIdentifier): id is ApplicationStatus {
  return BOARD_STATUSES.includes(id as ApplicationStatus);
}

// ── Source filter config ─────────────────────────────────────────────────────
const SOURCE_FILTERS: { value: ApplicationSource | 'all'; label: string; icon: string }[] = [
  { value: 'all',      label: 'All',      icon: '⊞' },
  { value: 'referral', label: 'Referral', icon: '🤝' },
  { value: 'linkedin', label: 'LinkedIn', icon: '💼' },
  { value: 'naukri',   label: 'Naukri',   icon: '🇮🇳' },
  { value: 'manual',   label: 'Manual',   icon: '✍️' },
  { value: 'extension',label: 'Extension',icon: '🔌' },
];

// ── CSV helpers ──────────────────────────────────────────────────────────────
const CSV_HEADERS = ['Company','Role Title','Status','Source','Location','Min Salary','Max Salary','Job URL','Notes','Applied Date','Deadline','Resume Link'];

function appsToCSV(apps: Application[]): string {
  const rows = apps.map(a => [
    a.company, a.role_title, a.status, a.source,
    a.location ?? '', a.salary_min ?? '', a.salary_max ?? '',
    a.job_url ?? '', (a.notes ?? '').replace(/[\n\r,]/g, ' '),
    a.applied_at ? new Date(a.applied_at).toLocaleDateString() : '',
    a.deadline ? new Date(a.deadline).toLocaleDateString() : '',
    a.resume_version ?? '',
  ]);
  return [CSV_HEADERS, ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n');
}

function downloadCSV(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// Simple CSV parser — handles quoted fields, commas inside quotes
function parseCSV(text: string): string[][] {
  return text.split('\n').filter(Boolean).map(line => {
    const cells: string[] = [];
    let cur = ''; let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQ = !inQ; }
      else if (ch === ',' && !inQ) { cells.push(cur.trim()); cur = ''; }
      else { cur += ch; }
    }
    cells.push(cur.trim());
    return cells;
  });
}

const VALID_STATUSES = new Set<string>(['bookmarked','applied','phone_screen','technical','final_round','offer','rejected','ghosted','withdrawn']);
const VALID_SOURCES  = new Set<string>(['linkedin','naukri','email','referral','manual','extension']);

// ── Referral funnel banner ───────────────────────────────────────────────────
function ReferralFunnelBanner({ apps }: { apps: Application[] }) {
  const total       = apps.length;
  const applied     = apps.filter(a => !['bookmarked'].includes(a.status)).length;
  const interviews  = apps.filter(a => ['phone_screen','technical','final_round'].includes(a.status)).length;
  const offers      = apps.filter(a => a.status === 'offer').length;
  const convRate    = total ? Math.round(offers / total * 100) : 0;

  if (!total) return null;

  return (
    <div className="mx-6 mb-2 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-1">
      <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-widest">🤝 Referral Funnel</span>
      {[
        { label: 'Bookmarked', val: total },
        { label: 'Applied',    val: applied },
        { label: 'Interviews', val: interviews },
        { label: 'Offers',     val: offers },
      ].map(({ label, val }, i, arr) => (
        <span key={label} className="flex items-center gap-2 text-sm">
          <span className="font-semibold text-foreground">{val}</span>
          <span className="text-muted-foreground">{label}</span>
          {i < arr.length - 1 && <span className="text-muted-foreground/40">→</span>}
        </span>
      ))}
      <span className="ml-auto text-xs text-emerald-600 dark:text-emerald-400 font-semibold">
        {convRate}% offer rate
      </span>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────
export function KanbanBoard() {
  const { applications, isLoading, updateStatus, createApplication } = useApplications();
  const { setAddModalOpen, setQuickSaveOpen } = useAppStore();
  useKeyboardShortcuts();

  const [activeApp, setActiveApp]       = useState<Application | null>(null);
  const [overColumnId, setOverColumnId] = useState<ApplicationStatus | null>(null);
  const [sortDir, setSortDir]             = useState<'desc' | 'asc'>('desc');
  const [sourceFilter, setSourceFilter]   = useState<ApplicationSource | 'all'>('all');
  const [priorityFilter, setPriorityFilter] = useState<ApplicationPriority | 'all'>('all');
  const [importing, setImporting]       = useState(false);
  const importRef = useRef<HTMLInputElement>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const resolveColumn = useCallback(
    (overId: UniqueIdentifier): ApplicationStatus | null => {
      if (isColumnId(overId)) return overId;
      const card = applications.find((a) => a.id === overId);
      return card?.status ?? null;
    },
    [applications]
  );

  // Apply source filter + sort, then split by status
  const getAppsForStatus = useCallback(
    (status: ApplicationStatus) => {
      return applications
        .filter(a => a.status === status)
        .filter(a => sourceFilter === 'all'   || a.source   === sourceFilter)
        .filter(a => priorityFilter === 'all' || a.priority === priorityFilter)
        .sort((a, b) => {
          const diff = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          return sortDir === 'desc' ? -diff : diff;
        });
    },
    [applications, sourceFilter, priorityFilter, sortDir]
  );

  // Referral apps (all statuses) for the funnel banner
  const referralApps = applications.filter(a => a.source === 'referral');

  // Visible applications for export (respects active filters)
  const visibleApps = applications
    .filter(a => sourceFilter   === 'all' || a.source   === sourceFilter)
    .filter(a => priorityFilter === 'all' || a.priority === priorityFilter);

  function handleDragStart({ active }: DragStartEvent) {
    const found = applications.find((a) => a.id === active.id);
    setActiveApp(found ?? null);
    setOverColumnId(found?.status ?? null);
  }

  function handleDragOver({ over }: DragOverEvent) {
    if (!over) { setOverColumnId(null); return; }
    const col = resolveColumn(over.id);
    if (col) setOverColumnId(col);
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    setActiveApp(null);
    setOverColumnId(null);
    if (!over) return;
    const newStatus = resolveColumn(over.id);
    if (!newStatus) return;
    const draggedApp = applications.find((a) => a.id === active.id);
    if (!draggedApp || draggedApp.status === newStatus) return;
    toast.success(`Moved to ${STATUS_LABELS[newStatus]}`);
    updateStatus(draggedApp.id, newStatus).catch(() => toast.error('Update failed — reverted'));
  }

  function handleDragCancel() {
    setActiveApp(null);
    setOverColumnId(null);
  }

  // ── Export ─────────────────────────────────────────────────────────────────
  function handleExport() {
    const csv = appsToCSV(visibleApps);
    const suffix = sourceFilter !== 'all' ? `_${sourceFilter}` : '';
    downloadCSV(csv, `applications${suffix}_${new Date().toISOString().split('T')[0]}.csv`);
    toast.success(`Exported ${visibleApps.length} application${visibleApps.length !== 1 ? 's' : ''}`);
  }

  // ── Import ─────────────────────────────────────────────────────────────────
  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    const text = await file.text();
    const rows = parseCSV(text);
    if (rows.length < 2) { toast.error('CSV appears empty'); return; }

    // Detect if first row is headers (contains "Company" or "company")
    const firstRow = rows[0].map(c => c.toLowerCase());
    const dataRows = firstRow.includes('company') || firstRow.includes('role title') ? rows.slice(1) : rows;

    if (!dataRows.length) { toast.error('No data rows found in CSV'); return; }

    setImporting(true);
    let created = 0; let failed = 0;

    for (const row of dataRows) {
      const [company, role_title, status, source, location, salary_min, , job_url, notes, applied_at, deadline, resume_version] = row;
      if (!company?.trim() || !role_title?.trim()) { failed++; continue; }

      try {
        await createApplication({
          company:        company.trim(),
          role_title:     role_title.trim(),
          status:         (VALID_STATUSES.has(status?.trim()) ? status.trim() : 'bookmarked') as ApplicationStatus,
          source:         (VALID_SOURCES.has(source?.trim())  ? source.trim() : 'manual') as ApplicationSource,
          location:       location?.trim() || null,
          salary_min:     salary_min ? Number(salary_min) || null : null,
          job_url:        job_url?.trim() || null,
          notes:          notes?.trim() || null,
          applied_at:     applied_at?.trim() || null,
          deadline:       deadline?.trim() || null,
          resume_version: resume_version?.trim() || null,
        });
        created++;
      } catch {
        failed++;
      }
    }

    setImporting(false);
    if (created) toast.success(`Imported ${created} application${created !== 1 ? 's' : ''}${failed ? ` (${failed} skipped)` : ''}`);
    else toast.error(`Import failed — ${failed} row${failed !== 1 ? 's' : ''} skipped`);
  }

  if (isLoading) {
    return (
      <div className="flex gap-4 p-6 overflow-x-auto">
        {BOARD_STATUSES.map((s) => (
          <div key={s} className="w-64 shrink-0">
            <div className="h-6 w-32 bg-muted rounded animate-pulse mb-3" />
            <div className="space-y-2">
              {[1, 2].map((i) => <div key={i} className="h-24 bg-muted rounded-lg animate-pulse" />)}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <>
      {/* ── Toolbar ─────────────────────────────────────────────────────────── */}
      <div className="px-6 pt-4 pb-2 space-y-3">
        {/* Row 1: title + action buttons */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-xl font-bold text-foreground">Job Tracker</h2>
            <p className="text-sm text-muted-foreground">
              {visibleApps.length}{sourceFilter !== 'all' ? ` ${sourceFilter}` : ''} application{visibleApps.length !== 1 ? 's' : ''}
              {sourceFilter !== 'all' && ` · ${applications.length} total`}
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Sort toggle */}
            <button
              onClick={() => setSortDir(d => d === 'desc' ? 'asc' : 'desc')}
              title={sortDir === 'desc' ? 'Showing newest first — click for oldest first' : 'Showing oldest first — click for newest first'}
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-border bg-background hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            >
              {sortDir === 'desc' ? '↓ Newest' : '↑ Oldest'}
            </button>

            {/* Export */}
            <button
              onClick={handleExport}
              disabled={!visibleApps.length}
              title="Export to CSV"
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-border bg-background hover:bg-muted text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              ⬇ Export
            </button>

            {/* Import */}
            <button
              onClick={() => importRef.current?.click()}
              disabled={importing}
              title="Import from CSV"
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-border bg-background hover:bg-muted text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
            >
              {importing ? '⏳ Importing…' : '⬆ Import'}
            </button>
            <input
              ref={importRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={handleImportFile}
            />

            {/* Save Job */}
            <button
              onClick={() => setQuickSaveOpen(true)}
              aria-label="Save job for later"
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-indigo-300 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-950 hover:bg-indigo-100 dark:hover:bg-indigo-900 text-indigo-700 dark:text-indigo-300 transition-colors"
            >
              💾 Save Job
            </button>

            {/* Add Job */}
            <button
              onClick={() => setAddModalOpen(true)}
              aria-label="Add new job application"
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            >
              + Add Job
            </button>
          </div>
        </div>

        {/* Row 2: source filter chips */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {SOURCE_FILTERS.map(({ value, label, icon }) => {
            const count = value === 'all'
              ? applications.length
              : applications.filter(a => a.source === value).length;
            if (count === 0 && value !== 'all') return null;
            const active = sourceFilter === value;
            return (
              <button
                key={value}
                onClick={() => setSourceFilter(active && value !== 'all' ? 'all' : value)}
                className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full border transition-colors ${
                  active
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-background text-muted-foreground border-border hover:border-indigo-300 hover:text-foreground'
                }`}
              >
                <span>{icon}</span>
                <span>{label}</span>
                <span className={`rounded-full px-1 text-[10px] font-bold ${active ? 'bg-indigo-500' : 'bg-muted'}`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Row 3: priority filter chips — no "All" chip; unselected state = show all */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            onClick={() => setPriorityFilter('all')}
            className={`text-xs font-medium transition-colors ${
              priorityFilter === 'all'
                ? 'text-foreground'
                : 'text-indigo-500 hover:text-indigo-400 underline underline-offset-2'
            }`}
            title="Clear priority filter"
          >
            Priority{priorityFilter !== 'all' ? ' ×' : ':'}
          </button>
          {([
            { value: 'urgent' as const, label: '🔴 Urgent' },
            { value: 'high'   as const, label: '🟠 High' },
            { value: 'medium' as const, label: '🟡 Medium' },
            { value: 'low'    as const, label: '⚪ Low' },
          ] as const).map(({ value, label }) => {
            const count = applications.filter(a => (a.priority ?? 'medium') === value).length;
            if (count === 0) return null;
            const active = priorityFilter === value;
            return (
              <button
                key={value}
                onClick={() => setPriorityFilter(active ? 'all' : value)}
                className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full border transition-colors ${
                  active
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-background text-muted-foreground border-border hover:border-indigo-300 hover:text-foreground'
                }`}
              >
                <span>{label}</span>
                <span className={`rounded-full px-1 text-[10px] font-bold ${active ? 'bg-indigo-500' : 'bg-muted'}`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Referral funnel banner ───────────────────────────────────────────── */}
      {sourceFilter === 'referral' && <ReferralFunnelBanner apps={referralApps} />}

      {/* ── Empty state ──────────────────────────────────────────────────────── */}
      {applications.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 text-center px-6">
          <div className="text-6xl mb-4">🎯</div>
          <h3 className="text-lg font-semibold text-foreground mb-2">Start tracking your job search</h3>
          <p className="text-sm text-muted-foreground mb-6 max-w-sm">
            Add your first application or import a CSV to get started. Use the Chrome extension to capture jobs instantly from LinkedIn, Naukri, or any job board.
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => setAddModalOpen(true)}
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-6 py-2.5 rounded-lg transition-colors"
            >
              + Add Your First Job
            </button>
            <button
              onClick={() => importRef.current?.click()}
              className="border border-border text-muted-foreground hover:text-foreground text-sm font-medium px-5 py-2.5 rounded-lg transition-colors"
            >
              ⬆ Import CSV
            </button>
          </div>
        </div>
      )}

      {/* ── Board ────────────────────────────────────────────────────────────── */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <div className="flex gap-4 px-6 pb-6 overflow-x-auto min-h-[calc(100vh-220px)]">
          {BOARD_STATUSES.map((status) => (
            <KanbanColumn
              key={status}
              status={status}
              label={STATUS_LABELS[status]}
              applications={getAppsForStatus(status)}
              isDragTarget={overColumnId === status && activeApp?.status !== status}
            />
          ))}
        </div>

        <DragOverlay dropAnimation={{ duration: 120, easing: 'ease-out' }}>
          {activeApp && (
            <div className="rotate-1 shadow-2xl opacity-90 pointer-events-none">
              <ApplicationCard application={activeApp} />
            </div>
          )}
        </DragOverlay>
      </DndContext>

      <AddApplicationModal />
      <ApplicationDetailSheet />
      <QuickSaveModal />
    </>
  );
}
