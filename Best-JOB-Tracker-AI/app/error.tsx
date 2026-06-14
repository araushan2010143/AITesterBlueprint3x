'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-4 p-6 text-center">
      <div className="text-4xl">⚠️</div>
      <h2 className="text-xl font-bold text-foreground">Something went wrong</h2>
      <p className="text-sm text-muted-foreground max-w-sm">
        An unexpected error occurred. You can try again or return to the dashboard.
      </p>
      <div className="flex gap-3">
        <Button onClick={reset} className="bg-indigo-600 hover:bg-indigo-700 text-white">
          Try again
        </Button>
        <Button variant="outline" onClick={() => window.location.href = '/tracker'}>
          Go to Dashboard
        </Button>
      </div>
      {error.digest && (
        <p className="text-xs text-muted-foreground/50 mt-2">Error ID: {error.digest}</p>
      )}
    </div>
  );
}
