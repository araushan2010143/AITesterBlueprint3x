'use client';

interface Props {
  filePath: string;
  rowCount: number;
}

export default function ExcelLog({ filePath, rowCount }: Props) {
  return (
    <div className="card flex items-center gap-4 bg-slate-800/40">
      <div className="w-8 h-8 rounded-lg bg-emerald-900/40 flex items-center justify-center text-emerald-400 text-xs font-bold flex-shrink-0">
        XLS
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-slate-300 text-sm font-medium truncate">{filePath}</p>
        <p className="text-slate-500 text-xs">{rowCount} row{rowCount !== 1 ? 's' : ''} in content_calendar.xlsx</p>
      </div>
      <a
        href="/api/calendar"
        target="_blank"
        rel="noreferrer"
        className="btn-ghost text-xs flex-shrink-0"
      >
        View JSON
      </a>
    </div>
  );
}
