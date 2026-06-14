'use client';

import useSWR from 'swr';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  CartesianGrid,
} from 'recharts';
import { STATUS_LABELS } from '@/types';
import type { Application } from '@/types';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const FUNNEL_STATUSES = [
  'applied', 'phone_screen', 'technical', 'final_round', 'offer',
] as const;

const PIE_COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#3b82f6'];

export default function AnalyticsPage() {
  const { data, isLoading } = useSWR<{ data: Application[] }>('/api/applications', fetcher);
  const apps = data?.data ?? [];

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div className="h-8 w-40 bg-muted rounded animate-pulse" />
        <div className="grid grid-cols-4 gap-4">
          {[1,2,3,4].map(i => <div key={i} className="h-24 bg-muted rounded-xl animate-pulse" />)}
        </div>
        <div className="h-64 bg-muted rounded-xl animate-pulse" />
      </div>
    );
  }

  /* ── Stat cards ──────────────────────────────────────────── */
  const total      = apps.length;
  const activeApps = apps.filter(a => !['rejected','ghosted','withdrawn'].includes(a.status));
  const offers     = apps.filter(a => a.status === 'offer').length;
  const avgScore   = apps.filter(a => a.ai_match_score !== null).length
    ? Math.round(apps.filter(a => a.ai_match_score !== null).reduce((s, a) => s + (a.ai_match_score ?? 0), 0) /
        apps.filter(a => a.ai_match_score !== null).length)
    : null;
  const responseRate = apps.filter(a => a.status !== 'bookmarked').length
    ? Math.round((apps.filter(a => ['phone_screen','technical','final_round','offer'].includes(a.status)).length /
        apps.filter(a => a.status !== 'bookmarked').length) * 100)
    : 0;

  /* ── Funnel data ─────────────────────────────────────────── */
  const funnelData = FUNNEL_STATUSES.map(s => ({
    name: STATUS_LABELS[s],
    count: apps.filter(a => a.status === s).length,
  }));

  /* ── Status breakdown (pie) ──────────────────────────────── */
  const statusCounts: Record<string, number> = {};
  apps.forEach(a => { statusCounts[a.status] = (statusCounts[a.status] ?? 0) + 1; });
  const pieData = Object.entries(statusCounts)
    .map(([status, count]) => ({ name: STATUS_LABELS[status as keyof typeof STATUS_LABELS] ?? status, count }))
    .sort((a, b) => b.count - a.count)
    .map((d, i) => ({ ...d, fill: PIE_COLORS[i % PIE_COLORS.length] }));

  /* ── Source breakdown ────────────────────────────────────── */
  const sourceCounts: Record<string, number> = {};
  apps.forEach(a => { sourceCounts[a.source] = (sourceCounts[a.source] ?? 0) + 1; });
  const sourceData = Object.entries(sourceCounts)
    .map(([name, count]) => ({ name: name.charAt(0).toUpperCase() + name.slice(1), count }))
    .sort((a, b) => b.count - a.count)
    .map((d, i) => ({ ...d, fill: PIE_COLORS[i % PIE_COLORS.length] }));

  /* ── Applications over time (last 8 weeks) ───────────────── */
  const weeklyMap: Record<string, number> = {};
  const now = new Date();
  for (let i = 7; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i * 7);
    const key = `W${d.getMonth() + 1}/${d.getDate()}`;
    weeklyMap[key] = 0;
  }
  apps.forEach(a => {
    const created = new Date(a.created_at);
    const diffWeeks = Math.floor((now.getTime() - created.getTime()) / (7 * 24 * 60 * 60 * 1000));
    if (diffWeeks <= 7) {
      const d = new Date(now);
      d.setDate(d.getDate() - diffWeeks * 7);
      const key = `W${d.getMonth() + 1}/${d.getDate()}`;
      weeklyMap[key] = (weeklyMap[key] ?? 0) + 1;
    }
  });
  const weeklyData = Object.entries(weeklyMap).map(([week, count]) => ({ week, count }));

  const stats = [
    { label: 'Total Applications', value: total, sub: `${activeApps.length} active`, color: 'text-indigo-500' },
    { label: 'Response Rate', value: `${responseRate}%`, sub: 'Applied → Interview', color: 'text-blue-500' },
    { label: 'Offers Received', value: offers, sub: offers > 0 ? '🎉 Congrats!' : 'Keep applying!', color: 'text-green-500' },
    { label: 'Avg AI Match', value: avgScore !== null ? `${avgScore}%` : '—', sub: 'Resume match score', color: 'text-purple-500' },
  ];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-xl font-bold text-foreground">Analytics</h2>
        <p className="text-sm text-muted-foreground mt-1">Your job search at a glance</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stats.map((s) => (
          <div key={s.label} className="bg-card border border-border rounded-xl p-4">
            <p className="text-xs text-muted-foreground mb-1">{s.label}</p>
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-muted-foreground mt-1">{s.sub}</p>
          </div>
        ))}
      </div>

      {apps.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <p className="text-5xl mb-4">📊</p>
          <h3 className="font-semibold text-foreground mb-1">No data yet</h3>
          <p className="text-sm text-muted-foreground">Add your first job application to see analytics here.</p>
        </div>
      ) : (
        <>
          {/* Applications over time */}
          <div className="bg-card border border-border rounded-xl p-5">
            <h3 className="text-sm font-semibold text-foreground mb-4">Applications Over Time</h3>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={weeklyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="week" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }}
                  labelStyle={{ color: 'hsl(var(--foreground))' }}
                />
                <Line type="monotone" dataKey="count" stroke="#6366f1" strokeWidth={2} dot={{ fill: '#6366f1' }} name="Apps" />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Funnel + Source side by side */}
          <div className="grid md:grid-cols-2 gap-4">
            {/* Conversion funnel */}
            <div className="bg-card border border-border rounded-xl p-5">
              <h3 className="text-sm font-semibold text-foreground mb-4">Application Funnel</h3>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={funnelData} layout="vertical">
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={90} />
                  <Tooltip
                    contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }}
                    labelStyle={{ color: 'hsl(var(--foreground))' }}
                  />
                  <Bar dataKey="count" fill="#6366f1" radius={[0, 4, 4, 0]} name="Count" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Source breakdown */}
            <div className="bg-card border border-border rounded-xl p-5">
              <h3 className="text-sm font-semibold text-foreground mb-4">By Source</h3>
              {sourceData.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={sourceData}
                      dataKey="count"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={75}
                      label={({ name, percent }: { name?: string; percent?: number }) =>
                        `${name ?? ''} ${((percent ?? 0) * 100).toFixed(0)}%`
                      }
                      labelLine={false}
                    >
                      {sourceData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                    </Pie>
                    <Tooltip
                      contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-16">No source data</p>
              )}
            </div>
          </div>

          {/* Status breakdown bar */}
          <div className="bg-card border border-border rounded-xl p-5">
            <h3 className="text-sm font-semibold text-foreground mb-4">Status Breakdown</h3>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={pieData}>
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }}
                  labelStyle={{ color: 'hsl(var(--foreground))' }}
                />
                <Bar dataKey="count" name="Applications" radius={[4, 4, 0, 0]}>
                  {pieData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  );
}
