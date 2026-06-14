'use client';

import { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ApplicationSelector } from '@/components/ai/ApplicationSelector';
import { ResumeExporter } from '@/components/ai/ResumeExporter';
import { AIPageHeader } from '@/components/ai/AIPageHeader';
import type { Application } from '@/types';

interface TailorResult {
  score: number;
  gaps: string[];
  keywords: string[];
  bullets: { original: string; tailored: string; improvement: string }[];
}

function ResumeTailorContent() {
  const searchParams = useSearchParams();
  const [applicationId, setApplicationId] = useState(searchParams.get('id') ?? '');
  const [selectedApp, setSelectedApp] = useState<Application | null>(null);
  const [resumeText, setResumeText] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TailorResult | null>(null);

  async function handleSubmit() {
    if (!applicationId || !resumeText) return;
    setLoading(true);
    try {
      const res = await fetch('/api/ai/tailor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ applicationId, resumeText }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error ?? `Request failed (${res.status})`);
      }
      const data = await res.json();
      setResult(data);
      toast.success(`Resume scored ${data.score}/100 — tailored successfully!`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to tailor resume');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <AIPageHeader page="resume" />
      <div className="p-6 max-w-4xl mx-auto">

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
          <Label htmlFor="resume">Your Resume Text</Label>
          <Textarea
            id="resume"
            placeholder="Paste your resume here…"
            className="min-h-48 font-mono text-sm"
            value={resumeText}
            onChange={(e) => setResumeText(e.target.value)}
          />
        </div>
        <Button
          onClick={handleSubmit}
          className="bg-indigo-600 hover:bg-indigo-700"
          disabled={loading || !applicationId || !resumeText}
        >
          {loading ? 'Tailoring…' : 'Tailor My Resume'}
        </Button>
      </div>

      {result && (
        <div className="space-y-6">
          {selectedApp && (
            <p className="text-sm text-muted-foreground">
              Results for <span className="font-medium text-foreground">{selectedApp.role_title}</span> at{' '}
              <span className="font-medium text-foreground">{selectedApp.company}</span>
            </p>
          )}

          <div className="flex items-center gap-4">
            <div
              className={`text-4xl font-bold ${
                result.score >= 75
                  ? 'text-green-600'
                  : result.score >= 50
                  ? 'text-yellow-600'
                  : 'text-red-500'
              }`}
            >
              {result.score}<span className="text-xl">/100</span>
            </div>
            <div>
              <p className="text-sm font-medium">ATS Match Score</p>
              <p className="text-xs text-muted-foreground">Based on keyword alignment with the job description</p>
            </div>
          </div>

          {result.keywords.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Must-Have Keywords</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {result.keywords.map((k) => (
                  <Badge key={k} variant="outline">{k}</Badge>
                ))}
              </CardContent>
            </Card>
          )}

          {result.gaps.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-red-600">Gaps to Address</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  {result.gaps.map((g, i) => <li key={i}>• {g}</li>)}
                </ul>
              </CardContent>
            </Card>
          )}

          {result.bullets.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-base font-semibold">Tailored Bullets (Before → After)</h3>
              {result.bullets.map((b, i) => (
                <Card key={i}>
                  <CardContent className="pt-4 space-y-2">
                    <div className="bg-red-50 dark:bg-red-950 rounded p-2 text-sm text-red-800 dark:text-red-200 line-through opacity-70">
                      {b.original}
                    </div>
                    <div className="bg-green-50 dark:bg-green-950 rounded p-2 text-sm text-green-800 dark:text-green-200 font-medium">
                      {b.tailored}
                    </div>
                    {b.improvement && (
                      <p className="text-xs text-muted-foreground italic">💡 {b.improvement}</p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Export section — always shown after tailoring */}
          <ResumeExporter
            applicationId={applicationId}
            resumeText={resumeText}
            tailorResult={result}
          />
        </div>
      )}
      </div>
    </div>
  );
}

export default function ResumeTailorPage() {
  return (
    <Suspense>
      <ResumeTailorContent />
    </Suspense>
  );
}
