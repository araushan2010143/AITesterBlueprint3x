export default function CallbackLoading() {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
      <div className="w-14 h-14 rounded-2xl bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-500/30 animate-pulse">
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
          <path d="M4 9a3 3 0 013-3h14a3 3 0 013 3v2H4V9z" fill="white" fillOpacity=".9"/>
          <rect x="4" y="12" width="20" height="12" rx="2" fill="white" fillOpacity=".9"/>
          <rect x="9" y="7" width="3" height="3" rx="1" fill="#6366f1"/>
          <rect x="16" y="7" width="3" height="3" rx="1" fill="#6366f1"/>
        </svg>
      </div>
      <div className="text-center">
        <p className="text-base font-semibold text-foreground">Signing you in…</p>
        <p className="text-sm text-muted-foreground mt-1">Completing Google authentication</p>
      </div>
      <div className="flex gap-1.5 mt-2">
        <span className="w-2 h-2 rounded-full bg-indigo-600 animate-bounce [animation-delay:0ms]" />
        <span className="w-2 h-2 rounded-full bg-indigo-600 animate-bounce [animation-delay:150ms]" />
        <span className="w-2 h-2 rounded-full bg-indigo-600 animate-bounce [animation-delay:300ms]" />
      </div>
    </div>
  );
}
