'use client';

import { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { ApplicationSelector } from '@/components/ai/ApplicationSelector';
import { AIPageHeader } from '@/components/ai/AIPageHeader';
import type { Application } from '@/types';

function CoverLetterContent() {
  const searchParams = useSearchParams();
  const [applicationId, setApplicationId] = useState(searchParams.get('id') ?? '');
  const [selectedApp, setSelectedApp] = useState<Application | null>(null);
  const [background, setBackground] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    coverLetter: string;
    company: string;
    role: string;
    companyNews: string[];
  } | null>(null);

  async function handleGenerate() {
    setLoading(true);
    try {
      const res = await fetch('/api/ai/cover-letter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ applicationId, userBackground: background }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error ?? `Request failed (${res.status})`);
      }
      setResult(await res.json());
      toast.success('Cover letter generated!');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <AIPageHeader page="cover-letter" />
      <div className="p-6 max-w-3xl mx-auto">

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
          <Label>Your Background (optional)</Label>
          <Textarea
            placeholder="3 years QA engineer, built test automation for fintech…"
            className="min-h-24"
            value={background}
            onChange={(e) => setBackground(e.target.value)}
          />
        </div>
        <Button
          onClick={handleGenerate}
          className="bg-indigo-600 hover:bg-indigo-700"
          disabled={loading || !applicationId}
        >
          {loading ? 'Generating…' : 'Generate Cover Letter'}
        </Button>
      </div>

      {result && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex justify-between items-center mb-3">
              <p className="text-sm font-medium">
                {selectedApp?.role_title ?? result.role} at {selectedApp?.company ?? result.company}
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  navigator.clipboard.writeText(result.coverLetter);
                  toast.success('Copied!');
                }}
              >
                Copy
              </Button>
            </div>
            <div className="whitespace-pre-wrap text-sm bg-muted/50 rounded-lg p-4 leading-relaxed">
              {result.coverLetter}
            </div>
            {result.companyNews.length > 0 && (
              <div className="mt-4">
                <p className="text-xs text-muted-foreground font-medium mb-1">Sources used:</p>
                {result.companyNews.map((n, i) => (
                  <p key={i} className="text-xs text-muted-foreground">
                    • {n.substring(0, 80)}…
                  </p>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
      </div>
    </div>
  );
}

export default function CoverLetterPage() {
  return (
    <Suspense>
      <CoverLetterContent />
    </Suspense>
  );
}
