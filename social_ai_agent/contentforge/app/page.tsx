'use client';

import { useEffect, useState, useCallback } from 'react';
import StatusCards from '../components/StatusCards';
import ContentTabs from '../components/ContentTabs';
import CalendarTable from '../components/CalendarTable';
import ExcelLog from '../components/ExcelLog';
import type { StatusResponse, ContentRow } from '../lib/types';

type View = 'today' | 'calendar';

export default function DashboardPage() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [todayRow, setTodayRow] = useState<ContentRow | null>(null);
  const [allRows, setAllRows] = useState<ContentRow[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedRow, setSelectedRow] = useState<ContentRow | null>(null);
  const [view, setView] = useState<View>('today');
  const [isTriggering, setIsTriggering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/status');
      if (!res.ok) return;
      const data: StatusResponse = await res.json();
      setStatus(data);
    } catch { /* ignore */ }
  }, []);

  const fetchToday = useCallback(async () => {
    try {
      const res = await fetch('/api/today');
      if (!res.ok) return;
      const data = await res.json();
      setTodayRow(data.row ?? null);
    } catch { /* ignore */ }
  }, []);

  const fetchCalendar = useCallback(async () => {
    try {
      const res = await fetch('/api/calendar');
      if (!res.ok) return;
      const data = await res.json();
      setAllRows(data.rows ?? []);
    } catch { /* ignore */ }
  }, []);

  // Initial load
  useEffect(() => {
    fetchStatus();
    fetchToday();
    fetchCalendar();
  }, [fetchStatus, fetchToday, fetchCalendar]);

  // Poll while pipeline is running
  useEffect(() => {
    if (!status?.pipeline.running) return;
    const id = setInterval(() => {
      fetchStatus();
      fetchToday();
      fetchCalendar();
    }, 3000);
    return () => clearInterval(id);
  }, [status?.pipeline.running, fetchStatus, fetchToday, fetchCalendar]);

  // Refresh everything when pipeline transitions to Done/Error
  const prevRunning = status?.pipeline.running;
  useEffect(() => {
    if (prevRunning === false) {
      fetchToday();
      fetchCalendar();
    }
  }, [prevRunning, fetchToday, fetchCalendar]);

  // Update selected row when calendar changes
  useEffect(() => {
    if (!selectedDate) return;
    const row = allRows.find((r) => r.date === selectedDate) ?? null;
    setSelectedRow(row);
  }, [selectedDate, allRows]);

  const handleRun = async () => {
    setIsTriggering(true);
    setError(null);
    try {
      const res = await fetch('/api/run', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Failed to start pipeline');
      } else {
        await fetchStatus();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setIsTriggering(false);
    }
  };

  const handleSelectDate = (date: string) => {
    setSelectedDate(date);
    const row = allRows.find((r) => r.date === date) ?? null;
    setSelectedRow(row);
    setView('today'); // reuse the content tab view for the selected date
  };

  const displayRow = view === 'today' ? todayRow : selectedRow;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Content Pipeline</h1>
        <p className="text-slate-400 text-sm mt-1">
          Automated daily content generation — LinkedIn, Medium, Instagram, YouTube, Dev.to
        </p>
      </div>

      {error && (
        <div className="bg-red-900/20 border border-red-700 rounded-lg px-4 py-3 text-red-400 text-sm">
          {error}
        </div>
      )}

      <StatusCards status={status} onRun={handleRun} isTriggering={isTriggering} />

      {/* View toggle */}
      <div className="flex gap-1 bg-slate-800 p-1 rounded-lg w-fit">
        <button
          onClick={() => { setView('today'); setSelectedDate(null); }}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
            view === 'today' && !selectedDate
              ? 'bg-indigo-600 text-white'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Today
        </button>
        <button
          onClick={() => setView('calendar')}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
            view === 'calendar'
              ? 'bg-indigo-600 text-white'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          All Entries ({allRows.length})
        </button>
      </div>

      {view === 'calendar' && !selectedDate ? (
        <CalendarTable
          rows={allRows}
          onSelectDate={handleSelectDate}
          selectedDate={selectedDate}
        />
      ) : (
        <div className="space-y-4">
          {selectedDate && (
            <div className="flex items-center gap-3">
              <button
                onClick={() => { setSelectedDate(null); setView('calendar'); }}
                className="btn-ghost text-xs"
              >
                Back to Calendar
              </button>
              <span className="text-slate-400 text-sm">
                Showing content for <span className="text-slate-200 font-mono">{selectedDate}</span>
              </span>
            </div>
          )}
          <ContentTabs row={displayRow} />
        </div>
      )}

      {/* Excel log strip */}
      <ExcelLog filePath="./content_calendar.xlsx" rowCount={allRows.length} />
    </div>
  );
}
