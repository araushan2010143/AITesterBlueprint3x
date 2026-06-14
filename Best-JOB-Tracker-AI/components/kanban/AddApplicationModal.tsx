'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAppStore } from '@/store/useAppStore';
import { useApplications } from '@/hooks/useApplications';

const schema = z.object({
  company:          z.string().min(1, 'Company is required'),
  role_title:       z.string().min(1, 'Role title is required'),
  job_url:          z.string().optional(),
  status:           z.enum(['bookmarked', 'applied', 'phone_screen', 'technical', 'final_round', 'offer', 'rejected', 'ghosted', 'withdrawn']),
  priority:         z.enum(['urgent', 'high', 'medium', 'low']),
  remote_type:      z.enum(['remote', 'hybrid', 'onsite']),
  location:         z.string().optional(),
  salary_min:       z.number().optional(),
  salary_max:       z.number().optional(),
  deadline:         z.string().optional(),
  applied_at:       z.string().optional(),
  resume_version:   z.string().optional(),
  notes:            z.string().optional(),
});

type FormData = z.infer<typeof schema>;

export function AddApplicationModal() {
  const { isAddModalOpen, setAddModalOpen } = useAppStore();
  const { createApplication } = useApplications();
  const [loading, setLoading] = useState(false);

  const { register, handleSubmit, formState: { errors }, setValue, reset } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { status: 'bookmarked', priority: 'medium', remote_type: 'hybrid' },
  });

  async function onSubmit(data: FormData) {
    setLoading(true);
    try {
      await createApplication({
        ...data,
        job_url:        data.job_url        || null,
        salary_min:     data.salary_min     || null,
        salary_max:     data.salary_max     || null,
        location:       data.location       || null,
        deadline:       data.deadline       || null,
        applied_at:     data.applied_at     || null,
        resume_version: data.resume_version || null,
        notes:          data.notes          || null,
        priority:       data.priority       ?? 'medium',
      });
      toast.success(`${data.role_title} at ${data.company} added to your board!`);
      reset();
      setAddModalOpen(false);
    } catch {
      toast.error('Failed to add application. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={isAddModalOpen} onOpenChange={setAddModalOpen}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Job Application</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">

          {/* Core fields */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="company">Company *</Label>
              <Input id="company" placeholder="Google" {...register('company')} />
              {errors.company && <p className="text-xs text-destructive">{errors.company.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="role_title">Role Title *</Label>
              <Input id="role_title" placeholder="Senior Engineer" {...register('role_title')} />
              {errors.role_title && <p className="text-xs text-destructive">{errors.role_title.message}</p>}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="job_url">Job URL</Label>
            <Input id="job_url" placeholder="https://careers.google.com/..." {...register('job_url')} />
            {errors.job_url && <p className="text-xs text-destructive">{errors.job_url.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select defaultValue="bookmarked" onValueChange={(v) => setValue('status', v as FormData['status'])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['bookmarked', 'applied', 'phone_screen', 'technical', 'final_round', 'offer'].map((s) => (
                    <SelectItem key={s} value={s}>{s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Priority</Label>
              <Select defaultValue="medium" onValueChange={(v) => setValue('priority', v as FormData['priority'])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="urgent">🔴 Urgent</SelectItem>
                  <SelectItem value="high">🟠 High</SelectItem>
                  <SelectItem value="medium">🟡 Medium</SelectItem>
                  <SelectItem value="low">⚪ Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Work Type</Label>
            <Select defaultValue="hybrid" onValueChange={(v) => setValue('remote_type', v as FormData['remote_type'])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="remote">Remote</SelectItem>
                <SelectItem value="hybrid">Hybrid</SelectItem>
                <SelectItem value="onsite">Onsite</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="location">Location</Label>
              <Input id="location" placeholder="Bangalore" {...register('location')} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="salary_min">Min Salary (₹)</Label>
              <Input id="salary_min" type="number" placeholder="1500000" {...register('salary_min', { valueAsNumber: true })} />
            </div>
          </div>

          {/* Divider */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border" /></div>
            <div className="relative flex justify-center">
              <span className="bg-background px-2 text-xs text-muted-foreground">Optional details</span>
            </div>
          </div>

          {/* Optional fields */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="salary_max">Max Salary (₹)</Label>
              <Input id="salary_max" type="number" placeholder="2000000" {...register('salary_max', { valueAsNumber: true })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="applied_at">Date Applied</Label>
              <Input id="applied_at" type="date" {...register('applied_at')} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="deadline">Application Deadline</Label>
            <Input id="deadline" type="date" {...register('deadline')} />
            <p className="text-xs text-muted-foreground">Set a reminder so you do not miss the window</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="resume_version">Resume Link</Label>
            <Input
              id="resume_version"
              placeholder="https://drive.google.com/... or Dropbox link"
              {...register('resume_version')}
            />
            <p className="text-xs text-muted-foreground">Paste a Google Drive, Dropbox, or OneDrive link to the resume you used</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              placeholder="Referral from Priya, 5 YOE required, DSA heavy interview…"
              className="min-h-20 resize-none text-sm"
              {...register('notes')}
            />
          </div>

          <div className="flex gap-3 pt-1">
            <Button type="button" variant="outline" className="flex-1" onClick={() => { reset(); setAddModalOpen(false); }}>
              Cancel
            </Button>
            <Button type="submit" className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white" disabled={loading}>
              {loading ? 'Adding…' : 'Add to Board'}
            </Button>
          </div>

        </form>
      </DialogContent>
    </Dialog>
  );
}
