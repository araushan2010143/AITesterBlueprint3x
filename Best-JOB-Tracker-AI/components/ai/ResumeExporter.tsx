'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { ResumeSection } from '@/app/api/ai/generate-resume/route';

interface TailorResult {
  score: number;
  gaps: string[];
  keywords: string[];
  bullets: { original: string; tailored: string; improvement: string }[];
}

interface Props {
  applicationId: string;
  resumeText: string;
  tailorResult: TailorResult;
}

export function ResumeExporter({ applicationId, resumeText, tailorResult }: Props) {
  const [phone, setPhone] = useState('');
  const [location, setLocation] = useState('');
  const [linkedin, setLinkedin] = useState('');
  const [github, setGithub] = useState('');
  const [generating, setGenerating] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [resume, setResume] = useState<ResumeSection | null>(null);
  const [role, setRole] = useState('');

  async function handleGenerate() {
    setGenerating(true);
    try {
      const res = await fetch('/api/ai/generate-resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          applicationId,
          resumeText,
          tailoredBullets: tailorResult.bullets,
          keywords: tailorResult.keywords,
          contactInfo: { phone, location, linkedin, github },
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        const err = data as { error?: string };
        throw new Error(err.error ?? `Failed (${res.status})`);
      }
      setResume(data.resume as ResumeSection);
      setRole(data.role as string);
      toast.success('Resume generated — ready to download!');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to generate resume');
    } finally {
      setGenerating(false);
    }
  }

  async function handleDownloadDocx() {
    if (!resume) return;
    setDownloading(true);
    try {
      const res = await fetch('/api/export/docx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resume, role }),
      });
      if (!res.ok) throw new Error('DOCX generation failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${resume.personalInfo.name.replace(/\s+/g, '_')}_${role.replace(/\s+/g, '_')}_Resume.docx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('DOCX downloaded!');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Download failed');
    } finally {
      setDownloading(false);
    }
  }

  function handlePrintPdf() {
    window.print();
  }

  return (
    <div className="mt-10 space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-border" />
        <span className="text-sm font-semibold text-indigo-600 uppercase tracking-wide">Generate Full Resume</span>
        <div className="h-px flex-1 bg-border" />
      </div>

      {/* Contact info collection */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Contact Details <span className="font-normal text-muted-foreground">(optional — enhances your resume)</span></CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Phone</Label>
            <Input placeholder="+91 98765 43210" value={phone} onChange={(e) => setPhone(e.target.value)} className="h-8 text-sm" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Location</Label>
            <Input placeholder="Bengaluru, India" value={location} onChange={(e) => setLocation(e.target.value)} className="h-8 text-sm" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">LinkedIn URL</Label>
            <Input placeholder="linkedin.com/in/your-name" value={linkedin} onChange={(e) => setLinkedin(e.target.value)} className="h-8 text-sm" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">GitHub URL</Label>
            <Input placeholder="github.com/your-username" value={github} onChange={(e) => setGithub(e.target.value)} className="h-8 text-sm" />
          </div>
        </CardContent>
      </Card>

      <Button
        className="bg-indigo-600 hover:bg-indigo-700 w-full"
        onClick={handleGenerate}
        disabled={generating}
      >
        {generating ? 'Generating your resume…' : '✨ Generate Job-Ready Resume'}
      </Button>

      {/* Resume preview + download */}
      {resume && (
        <>
          {/* Download buttons */}
          <div className="flex gap-3 print:hidden">
            <Button onClick={handleDownloadDocx} disabled={downloading} variant="outline" className="flex-1 border-indigo-300 text-indigo-700 hover:bg-indigo-50">
              {downloading ? 'Creating…' : '⬇ Download DOCX'}
            </Button>
            <Button onClick={handlePrintPdf} variant="outline" className="flex-1 border-rose-300 text-rose-700 hover:bg-rose-50">
              🖨 Print / Save as PDF
            </Button>
          </div>

          {/* Formatted resume preview — also serves as print view */}
          <div id="resume-preview" className="bg-white text-gray-900 rounded-xl border shadow-sm p-8 space-y-5 print:shadow-none print:border-none print:p-0 font-[Calibri,Arial,sans-serif]">
            {/* Header */}
            <div className="text-center border-b-2 border-indigo-600 pb-4">
              <h1 className="text-3xl font-bold text-gray-900 tracking-wide">{resume.personalInfo.name}</h1>
              <p className="text-sm text-gray-500 mt-1 flex flex-wrap justify-center gap-x-3 gap-y-0.5">
                {[resume.personalInfo.email, resume.personalInfo.phone, resume.personalInfo.location].filter(Boolean).map((v, i) => (
                  <span key={i}>{v}</span>
                ))}
              </p>
              {(resume.personalInfo.linkedin || resume.personalInfo.github) && (
                <p className="text-sm text-indigo-600 mt-0.5 flex flex-wrap justify-center gap-x-3">
                  {resume.personalInfo.linkedin && <span>{resume.personalInfo.linkedin}</span>}
                  {resume.personalInfo.github && <span>{resume.personalInfo.github}</span>}
                </p>
              )}
            </div>

            {/* Summary */}
            {resume.summary && (
              <section>
                <h2 className="text-xs font-bold uppercase tracking-widest text-indigo-600 border-b border-indigo-200 pb-1 mb-2">Professional Summary</h2>
                <p className="text-sm leading-relaxed">{resume.summary}</p>
              </section>
            )}

            {/* Skills */}
            {resume.skills.length > 0 && (
              <section>
                <h2 className="text-xs font-bold uppercase tracking-widest text-indigo-600 border-b border-indigo-200 pb-1 mb-2">Core Competencies</h2>
                <div className="space-y-1">
                  {resume.skills.map((group, i) => (
                    <p key={i} className="text-sm">
                      <span className="font-semibold">{group.category}:</span>{' '}
                      <span className="text-gray-700">{group.items.join(', ')}</span>
                    </p>
                  ))}
                </div>
              </section>
            )}

            {/* Experience */}
            {resume.experience.length > 0 && (
              <section>
                <h2 className="text-xs font-bold uppercase tracking-widest text-indigo-600 border-b border-indigo-200 pb-1 mb-3">Professional Experience</h2>
                <div className="space-y-4">
                  {resume.experience.map((job, i) => (
                    <div key={i}>
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-bold text-sm">{job.company}</p>
                          <p className="text-sm text-indigo-600 font-medium italic">{job.role}</p>
                        </div>
                        <div className="text-right text-xs text-gray-500 shrink-0 ml-2">
                          <p>{job.duration}</p>
                          {job.location && <p>{job.location}</p>}
                        </div>
                      </div>
                      <ul className="mt-1.5 space-y-0.5">
                        {job.bullets.map((b, j) => (
                          <li key={j} className="text-sm text-gray-700 flex gap-1.5">
                            <span className="text-indigo-400 shrink-0 mt-0.5">•</span>
                            <span>{b}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Education */}
            {resume.education.length > 0 && (
              <section>
                <h2 className="text-xs font-bold uppercase tracking-widest text-indigo-600 border-b border-indigo-200 pb-1 mb-2">Education</h2>
                {resume.education.map((ed, i) => (
                  <p key={i} className="text-sm">
                    <span className="font-semibold">{ed.degree}</span> — {ed.institution}
                    {ed.year && <span className="text-gray-500"> ({ed.year})</span>}
                  </p>
                ))}
              </section>
            )}

            {/* Certifications */}
            {resume.certifications.length > 0 && (
              <section>
                <h2 className="text-xs font-bold uppercase tracking-widest text-indigo-600 border-b border-indigo-200 pb-1 mb-2">Certifications</h2>
                <ul className="space-y-0.5">
                  {resume.certifications.map((c, i) => (
                    <li key={i} className="text-sm text-gray-700 flex gap-1.5">
                      <span className="text-indigo-400 shrink-0">•</span>
                      <span>{c}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <p className="text-xs text-center text-gray-400 pt-2 print:hidden">
              Tailored for <span className="font-medium text-indigo-500">{role}</span> · Generated by Best JOB Tracker AI
            </p>
          </div>

          {/* ATS score badge */}
          <div className="flex items-center gap-2 justify-center print:hidden">
            <Badge variant="secondary">ATS Score: {tailorResult.score}/100</Badge>
            <Badge variant="outline">{tailorResult.keywords.length} keywords matched</Badge>
          </div>
        </>
      )}

      {/* Print-only: hide everything except the resume */}
      <style>{`
        @media print {
          body > * { display: none !important; }
          #resume-preview { display: block !important; position: fixed; top: 0; left: 0; width: 100%; }
        }
      `}</style>
    </div>
  );
}
