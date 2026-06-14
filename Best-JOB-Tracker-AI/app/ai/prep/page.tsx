'use client';

import { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ApplicationSelector } from '@/components/ai/ApplicationSelector';
import { AIPageHeader } from '@/components/ai/AIPageHeader';
import type { Application } from '@/types';

interface Question {
  question: string;
  category: string;
  difficulty: string;
  starGuide?: string;
  tip: string;
}

const DIFFICULTY_COLORS: Record<string, string> = {
  easy: 'bg-green-100 text-green-700',
  medium: 'bg-yellow-100 text-yellow-700',
  hard: 'bg-red-100 text-red-700',
};

function InterviewPrepContent() {
  const searchParams = useSearchParams();
  const [applicationId, setApplicationId] = useState(searchParams.get('id') ?? '');
  const [selectedApp, setSelectedApp] = useState<Application | null>(null);
  const [roundType, setRoundType] = useState('technical');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ company: string; role: string; questions: Question[] } | null>(null);
  const [practiced, setPracticed] = useState<Set<number>>(new Set());

  async function handleGenerate() {
    setLoading(true);
    setPracticed(new Set());
    try {
      const res = await fetch('/api/ai/prep', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ applicationId, roundType }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error ?? `Request failed (${res.status})`);
      }
      setResult(await res.json());
      toast.success('Questions generated!');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <AIPageHeader page="prep" />
      <div className="p-6 max-w-3xl mx-auto">

      <div className="flex flex-wrap gap-4 mb-8 items-end">
        <div className="space-y-1.5 flex-1 min-w-64">
          <Label>Application</Label>
          <ApplicationSelector
            value={applicationId}
            onChange={(id, app) => {
              setApplicationId(id);
              setSelectedApp(app);
              setResult(null);
              setPracticed(new Set());
            }}
          />
        </div>
        <div className="space-y-1.5 w-48">
          <Label>Round Type</Label>
          <Select value={roundType} onValueChange={(v) => v && setRoundType(v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="phone">Phone Screen</SelectItem>
              <SelectItem value="technical">Technical</SelectItem>
              <SelectItem value="system_design">System Design</SelectItem>
              <SelectItem value="hr">HR / Behavioral</SelectItem>
              <SelectItem value="culture_fit">Culture Fit</SelectItem>
              <SelectItem value="offer">Offer Discussion</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button
          onClick={handleGenerate}
          className="bg-indigo-600 hover:bg-indigo-700"
          disabled={loading || !applicationId}
        >
          {loading ? 'Generating…' : 'Generate Questions'}
        </Button>
      </div>

      {result && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-muted-foreground">
              {result.questions.length} questions for{' '}
              <span className="text-foreground font-semibold">
                {selectedApp?.role_title ?? result.role}
              </span>{' '}
              at{' '}
              <span className="text-foreground font-semibold">
                {selectedApp?.company ?? result.company}
              </span>
            </p>
            <p className="text-xs text-muted-foreground">
              {practiced.size}/{result.questions.length} practiced
            </p>
          </div>

          {result.questions.map((q, i) => (
            <Card key={i} className={practiced.has(i) ? 'opacity-60' : ''}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-sm font-normal leading-snug">{q.question}</CardTitle>
                  <div className="flex gap-1.5 shrink-0">
                    <Badge className={`text-xs ${DIFFICULTY_COLORS[q.difficulty] ?? ''}`}>
                      {q.difficulty}
                    </Badge>
                    <button
                      onClick={() =>
                        setPracticed((prev) => {
                          const next = new Set(prev);
                          if (next.has(i)) { next.delete(i); } else { next.add(i); }
                          return next;
                        })
                      }
                      className={`text-xs px-2 py-0.5 rounded border transition-colors ${
                        practiced.has(i)
                          ? 'bg-green-600 text-white border-green-600'
                          : 'border-border text-muted-foreground hover:border-green-600'
                      }`}
                    >
                      {practiced.has(i) ? '✓ Practiced' : 'Mark Practiced'}
                    </button>
                  </div>
                </div>
              </CardHeader>
              {(q.starGuide || q.tip) && (
                <CardContent className="space-y-2">
                  {q.starGuide && (
                    <div className="text-xs bg-blue-50 dark:bg-blue-950 rounded p-2 text-blue-800 dark:text-blue-200">
                      <span className="font-medium">STAR Guide: </span>{q.starGuide}
                    </div>
                  )}
                  {q.tip && (
                    <p className="text-xs text-muted-foreground">💡 {q.tip}</p>
                  )}
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}
      </div>
    </div>
  );
}

export default function InterviewPrepPage() {
  return (
    <Suspense>
      <InterviewPrepContent />
    </Suspense>
  );
}
