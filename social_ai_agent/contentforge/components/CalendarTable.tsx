'use client';

import type { ContentRow, ContentStatus } from '../lib/types';

interface Props {
  rows: ContentRow[];
  onSelectDate: (date: string) => void;
  selectedDate: string | null;
}

const STATUS_STYLES: Record<ContentStatus, string> = {
  Pending: 'bg-slate-700 text-slate-300',
  Writing: 'bg-blue-900/60 text-blue-300',
  Imaging: 'bg-purple-900/60 text-purple-300',
  Done: 'bg-emerald-900/60 text-emerald-300',
  Error: 'bg-red-900/60 text-red-400',
};

export default function CalendarTable({ rows, onSelectDate, selectedDate }: Props) {
  if (rows.length === 0) {
    return (
      <div className="card text-center py-12 text-slate-500">
        No entries yet. Run the pipeline to generate today&apos;s content.
      </div>
    );
  }

  const sorted = [...rows].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="card overflow-hidden p-0">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-700 bg-slate-800/60">
              <th className="text-left px-4 py-3 text-slate-400 font-medium">Date</th>
              <th className="text-left px-4 py-3 text-slate-400 font-medium">Topic</th>
              <th className="text-left px-4 py-3 text-slate-400 font-medium">Status</th>
              <th className="text-left px-4 py-3 text-slate-400 font-medium">Updated By</th>
              <th className="text-left px-4 py-3 text-slate-400 font-medium">Last Updated</th>
              <th className="text-left px-4 py-3 text-slate-400 font-medium">Images</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => {
              const isSelected = row.date === selectedDate;
              return (
                <tr
                  key={row.date}
                  onClick={() => onSelectDate(row.date)}
                  className={`border-b border-slate-700/50 cursor-pointer transition-colors ${
                    isSelected ? 'bg-indigo-900/20' : 'hover:bg-slate-700/40'
                  }`}
                >
                  <td className="px-4 py-3 font-mono text-slate-300">{row.date}</td>
                  <td className="px-4 py-3 text-slate-200 max-w-xs truncate" title={row.topic}>
                    {row.topic || <span className="text-slate-600 italic">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`badge ${STATUS_STYLES[row.status]}`}>{row.status}</span>
                  </td>
                  <td className="px-4 py-3 text-slate-400 text-xs">{row.updatedBy || '—'}</td>
                  <td className="px-4 py-3 text-slate-400 text-xs">
                    {row.lastUpdated
                      ? new Date(row.lastUpdated).toLocaleString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      {row.linkedinImage && (
                        <a
                          href={row.linkedinImage}
                          target="_blank"
                          rel="noreferrer"
                          className="badge bg-blue-900/40 text-blue-400 hover:bg-blue-900/60"
                          onClick={(e) => e.stopPropagation()}
                        >
                          LI
                        </a>
                      )}
                      {row.mediumImage && (
                        <a
                          href={row.mediumImage}
                          target="_blank"
                          rel="noreferrer"
                          className="badge bg-slate-700 text-slate-300 hover:bg-slate-600"
                          onClick={(e) => e.stopPropagation()}
                        >
                          M
                        </a>
                      )}
                      {row.igImage && (
                        <a
                          href={row.igImage}
                          target="_blank"
                          rel="noreferrer"
                          className="badge bg-pink-900/40 text-pink-400 hover:bg-pink-900/60"
                          onClick={(e) => e.stopPropagation()}
                        >
                          IG
                        </a>
                      )}
                      {!row.linkedinImage && !row.mediumImage && !row.igImage && (
                        <span className="text-slate-600 text-xs">—</span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
