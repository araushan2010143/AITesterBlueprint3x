'use client';

import { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ApplicationSelector } from '@/components/ai/ApplicationSelector';
import { AIPageHeader } from '@/components/ai/AIPageHeader';
import type { Application } from '@/types';

function ColdEmailContent() {
  const searchParams = useSearchParams();
  const [applicationId, setApplicationId] = useState(searchParams.get('id') ?? '');
  const [selectedApp, setSelectedApp] = useState<Application | null>(null);
  const [hiringManager, setHiringManager] = useState('');
  const [achievement, setAchievement] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ subject: string; body: string } | null>(null);

  async function handleGenerate() {
    setLoading(true);
    try {
      const res = await fetch('/api/ai/cold-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          applicationId,
          hiringManagerName: hiringManager,
          yourTopAchievement: achievement,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error ?? `Request failed (${res.status})`);
      }
      setResult(await res.json());
      toast.success('Cold email generated!');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <AIPageHeader page="cold-email" />
      <div className="p-6 max-w-2xl mx-auto">

      <div className="space-y-4 mb-8">
        <div className="space-y-1.5">
          <Label>Application</Label>
          <ApplicationSelector
            value={applicationId}
            onChange={(id, app) => {
              setApplicationId(id);
              setSelectedApp(app);
              setResult(null);
            }}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Hiring Manager Name (optional)</Label>
          <Input
            placeholder={selectedApp ? `Hiring Manager at ${selectedApp.company}` : 'Priya Sharma'}
            value={hiringManager}
            onChange={(e) => setHiringManager(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Your Top Achievement (optional)</Label>
          <Input
            placeholder="Reduced test execution time by 60% at XYZ"
            value={achievement}
            onChange={(e) => setAchievement(e.target.value)}
          />
        </div>
        <Button
          onClick={handleGenerate}
          className="bg-indigo-600 hover:bg-indigo-700"
          disabled={loading || !applicationId}
        >
          {loading ? 'Composing…' : 'Compose Cold Email'}
        </Button>
      </div>

      {result && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex justify-between items-center">
              <CardTitle className="text-sm">Your Cold Email</CardTitle>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  navigator.clipboard.writeText(`Subject: ${result.subject}\n\n${result.body}`);
                  toast.success('Copied!');
                }}
              >
                Copy All
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="bg-muted rounded p-3">
              <p className="text-xs text-muted-foreground mb-1">Subject line:</p>
              <p className="text-sm font-semibold">{result.subject}</p>
            </div>
            <div className="bg-muted rounded p-3">
              <p className="text-xs text-muted-foreground mb-1">Email body (5 lines):</p>
              <div className="text-sm whitespace-pre-line leading-relaxed">{result.body}</div>
            </div>
          </CardContent>
        </Card>
      )}
      </div>
    </div>
  );
}

export default function ColdEmailPage() {
  return (
    <Suspense>
      <ColdEmailContent />
    </Suspense>
  );
}
