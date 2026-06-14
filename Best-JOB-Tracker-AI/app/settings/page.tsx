'use client';

import { useState, useEffect } from 'react';
import { useTheme } from 'next-themes';
import { Sun, Moon, Monitor } from 'lucide-react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { Profile } from '@/types';

const supabase = createClient();

const STATUS_OPTIONS = [
  { value: 'active',  label: '🟢 Actively looking' },
  { value: 'passive', label: '🟡 Open to opportunities' },
  { value: 'paused',  label: '🔴 Not looking right now' },
];

const THEME_OPTIONS = [
  { value: 'light',  label: 'Light',  icon: Sun },
  { value: 'dark',   label: 'Dark',   icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
] as const;

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const [profile, setProfile] = useState<Partial<Profile>>({});
  const [email, setEmail]     = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setEmail(user.email ?? '');

      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (data) setProfile(data);
      setLoading(false);
    }
    load();
  }, []);

  async function save() {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not logged in');

      const { error } = await supabase
        .from('profiles')
        .upsert({
          id:                 user.id,
          email:              user.email,
          full_name:          profile.full_name,
          target_role:        profile.target_role,
          job_search_status:  profile.job_search_status ?? 'active',
          updated_at:         new Date().toISOString(),
        });

      if (error) throw error;
      toast.success('Profile saved!');
    } catch (e: unknown) {
      toast.error((e as Error).message ?? 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = '/login';
  }

  if (loading) {
    return (
      <div className="p-6 max-w-xl space-y-4">
        <div className="h-8 w-32 bg-muted rounded animate-pulse" />
        {[1,2,3].map(i => <div key={i} className="h-12 bg-muted rounded animate-pulse" />)}
      </div>
    );
  }

  return (
    <div className="p-6 max-w-xl space-y-8">
      <div>
        <h2 className="text-xl font-bold text-foreground">Settings</h2>
        <p className="text-sm text-muted-foreground mt-1">Manage your profile and job search preferences</p>
      </div>

      {/* Profile */}
      <section className="space-y-4">
        <h3 className="text-sm font-semibold text-foreground border-b border-border pb-2">Profile</h3>

        <div className="space-y-1.5">
          <Label>Email</Label>
          <Input value={email} disabled className="bg-muted/50 cursor-not-allowed" />
          <p className="text-xs text-muted-foreground">Email is managed by your sign-in provider</p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="full_name">Full Name</Label>
          <Input
            id="full_name"
            placeholder="Your name"
            value={profile.full_name ?? ''}
            onChange={e => setProfile(p => ({ ...p, full_name: e.target.value }))}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="target_role">Target Role</Label>
          <Input
            id="target_role"
            placeholder="e.g. Senior Software Engineer"
            value={profile.target_role ?? ''}
            onChange={e => setProfile(p => ({ ...p, target_role: e.target.value }))}
          />
          <p className="text-xs text-muted-foreground">Used by AI features to personalise your outputs</p>
        </div>

        <div className="space-y-1.5">
          <Label>Job Search Status</Label>
          <Select
            value={profile.job_search_status ?? 'active'}
            onValueChange={v => setProfile(p => ({ ...p, job_search_status: v as Profile['job_search_status'] }))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map(o => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button
          onClick={save}
          disabled={saving}
          className="bg-indigo-600 hover:bg-indigo-700 text-white w-full sm:w-auto"
        >
          {saving ? 'Saving…' : 'Save Profile'}
        </Button>
      </section>

      {/* Appearance */}
      <section className="space-y-4">
        <h3 className="text-sm font-semibold text-foreground border-b border-border pb-2">Appearance</h3>
        <p className="text-sm text-muted-foreground">Choose how the app looks to you.</p>
        <div className="grid grid-cols-3 gap-3">
          {THEME_OPTIONS.map(({ value, label, icon: Icon }) => {
            const active = (theme ?? 'system') === value;
            return (
              <button
                key={value}
                onClick={() => setTheme(value)}
                aria-pressed={active}
                className={`flex flex-col items-center gap-2 rounded-xl border p-4 text-sm font-medium transition-colors ${
                  active
                    ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300'
                    : 'border-border text-muted-foreground hover:border-indigo-300 hover:text-foreground'
                }`}
              >
                <Icon className="h-5 w-5" />
                {label}
              </button>
            );
          })}
        </div>
      </section>

      {/* Email notifications */}
      <section className="space-y-4">
        <h3 className="text-sm font-semibold text-foreground border-b border-border pb-2">Email Notifications</h3>
        <div className="space-y-3">
          {[
            {
              key: 'email_notifications' as const,
              label: 'Milestone alerts',
              desc: 'Get notified when you reach Phone Screen, Final Round, or receive an Offer.',
            },
          ].map(({ key, label, desc }) => {
            const enabled = !!(profile as Record<string, unknown>)[key];
            return (
              <div key={key} className="flex items-start justify-between gap-4 p-4 rounded-xl border border-border">
                <div>
                  <p className="text-sm font-medium text-foreground">{label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
                </div>
                <button
                  role="switch"
                  aria-checked={enabled}
                  onClick={() => setProfile(p => ({ ...p, [key]: !enabled }))}
                  className={`relative shrink-0 h-5 w-9 rounded-full transition-colors ${
                    enabled ? 'bg-indigo-600' : 'bg-muted-foreground/30'
                  }`}
                >
                  <span className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
                    enabled ? 'translate-x-4' : 'translate-x-0'
                  }`} />
                </button>
              </div>
            );
          })}

          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              const res = await fetch('/api/email/weekly-digest', { method: 'POST' });
              if (res.ok) toast.success('Weekly digest sent to your email!');
              else toast.error('Failed to send digest');
            }}
          >
            Send me a weekly digest now
          </Button>
        </div>
      </section>

      {/* Extension */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground border-b border-border pb-2">Chrome Extension</h3>
        <div className="bg-muted/40 rounded-xl p-4 text-sm space-y-2">
          <p className="text-foreground font-medium">Extension ID</p>
          <code className="text-xs text-indigo-500 break-all">aclbjngcllfilkdjhbjpdfjdhifgbjod</code>
          <p className="text-xs text-muted-foreground">
            Load from <code className="text-foreground">extension/</code> in Chrome → Extensions → Developer mode → Load unpacked
          </p>
        </div>
      </section>

      {/* Danger zone */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground border-b border-border pb-2">Account</h3>
        <Button
          variant="outline"
          className="text-destructive border-destructive/30 hover:bg-destructive/10"
          onClick={signOut}
        >
          Sign Out
        </Button>
      </section>
    </div>
  );
}
