export default function AILoading() {
  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6 animate-pulse">
      {/* Page title */}
      <div className="space-y-2">
        <div className="h-7 w-56 bg-muted rounded" />
        <div className="h-4 w-80 bg-muted rounded" />
      </div>

      {/* Application selector */}
      <div className="h-10 w-full bg-muted rounded-lg" />

      {/* Text area */}
      <div className="h-40 w-full bg-muted rounded-lg" />

      {/* Generate button */}
      <div className="h-10 w-36 bg-muted rounded-lg" />

      {/* Output card skeleton */}
      <div className="border border-border rounded-xl p-5 space-y-3">
        <div className="h-5 w-40 bg-muted rounded" />
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-4 bg-muted rounded" style={{ width: `${85 - i * 8}%` }} />
          ))}
        </div>
      </div>
    </div>
  );
}
