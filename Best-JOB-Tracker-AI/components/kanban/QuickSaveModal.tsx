'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAppStore } from '@/store/useAppStore';
import { useApplications } from '@/hooks/useApplications';
import type { ApplicationSource } from '@/types';

// ── Platform detection from URL ──────────────────────────────────────────────
const PLATFORMS: { match: string; source: ApplicationSource; label: string; icon: string; badge: string }[] = [
  { match: 'linkedin.com',   source: 'linkedin',  label: 'LinkedIn',  icon: '💼', badge: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300' },
  { match: 'naukri.com',     source: 'naukri',    label: 'Naukri',    icon: '🇮🇳', badge: 'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300' },
  { match: 'indeed.com',     source: 'manual',    label: 'Indeed',    icon: '🔍', badge: 'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300' },
  { match: 'glassdoor.com',  source: 'manual',    label: 'Glassdoor', icon: '🪟', badge: 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300' },
  { match: 'internshala.com',source: 'manual',    label: 'Internshala', icon: '🎓', badge: 'bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300' },
  { match: 'unstop.com',     source: 'manual',    label: 'Unstop',    icon: '🏆', badge: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300' },
  { match: 'wellfound.com',  source: 'manual',    label: 'Wellfound', icon: '🚀', badge: 'bg-pink-100 text-pink-700 dark:bg-pink-950 dark:text-pink-300' },
  { match: 'shine.com',      source: 'manual',    label: 'Shine',     icon: '✨', badge: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300' },
];

function detectPlatform(url: string) {
  const lower = url.toLowerCase();
  return PLATFORMS.find(p => lower.includes(p.match)) ?? {
    source: 'manual' as ApplicationSource,
    label: 'Other',
    icon: '🌐',
    badge: 'bg-muted text-muted-foreground',
  };
}

export function QuickSaveModal() {
  const { isQuickSaveOpen, setQuickSaveOpen } = useAppStore();
  const { createApplication } = useApplications();

  const [url, setUrl]         = useState('');
  const [company, setCompany] = useState('');
  const [role, setRole]       = useState('');
  const [loading, setLoading] = useState(false);

  const platform = url.trim() ? detectPlatform(url) : null;

  function handleClose() {
    setUrl(''); setCompany(''); setRole('');
    setQuickSaveOpen(false);
  }

  async function handleSave() {
    if (!company.trim() || !role.trim()) {
      toast.error('Company and role title are required');
      return;
    }
    setLoading(true);
    try {
      await createApplication({
        company:    company.trim(),
        role_title: role.trim(),
        job_url:    url.trim() || null,
        source:     platform?.source ?? 'manual',
        status:     'bookmarked',
        priority:   'medium',
      });
      toast.success(`"${role.trim()}" at ${company.trim()} saved for later!`);
      handleClose();
    } catch {
      toast.error('Failed to save job');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={isQuickSaveOpen} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span>💾</span> Save Job for Later
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          <p className="text-xs text-muted-foreground">
            Paste the job URL and we will detect the platform automatically. Fill in the details and save — you can apply later from your Saved Jobs list.
          </p>

          {/* URL + platform badge */}
          <div className="space-y-1.5">
            <Label htmlFor="qs-url">Job URL</Label>
            <Input
              id="qs-url"
              placeholder="https://linkedin.com/jobs/view/..."
              value={url}
              onChange={e => setUrl(e.target.value)}
              autoFocus
            />
            {platform && (
              <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${platform.badge}`}>
                <span>{platform.icon}</span>
                <span>Detected: {platform.label}</span>
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="qs-company">Company *</Label>
              <Input
                id="qs-company"
                placeholder="Google"
                value={company}
                onChange={e => setCompany(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="qs-role">Role Title *</Label>
              <Input
                id="qs-role"
                placeholder="SWE-3"
                value={role}
                onChange={e => setRole(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSave(); }}
              />
            </div>
          </div>

          <div className="flex gap-3 pt-1">
            <Button variant="outline" className="flex-1" onClick={handleClose}>
              Cancel
            </Button>
            <Button
              className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white"
              onClick={handleSave}
              disabled={loading || !company.trim() || !role.trim()}
            >
              {loading ? 'Saving…' : '💾 Save Job'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
