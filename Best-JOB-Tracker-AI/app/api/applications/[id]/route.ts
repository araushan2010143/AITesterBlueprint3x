import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';
import { sendEmail, APP_URL } from '@/lib/email';
import { milestoneEmail } from '@/lib/emails/templates';

export const maxDuration = 10;

const updateSchema = z.object({
  company: z.string().min(1).max(200).optional(),
  role_title: z.string().min(1).max(200).optional(),
  job_url: z.url().optional().nullable(),
  status: z.enum(['bookmarked', 'applied', 'phone_screen', 'technical', 'final_round', 'offer', 'rejected', 'ghosted', 'withdrawn']).optional(),
  applied_at: z.string().optional().nullable(),
  deadline: z.string().optional().nullable(),
  salary_min: z.number().optional().nullable(),
  salary_max: z.number().optional().nullable(),
  salary_currency: z.enum(['INR', 'USD', 'GBP']).optional(),
  location: z.string().optional().nullable(),
  remote_type: z.enum(['remote', 'hybrid', 'onsite']).optional(),
  notes: z.string().optional().nullable(),
  ai_match_score: z.number().min(0).max(100).optional().nullable(),
  priority: z.enum(['urgent', 'high', 'medium', 'low']).optional(),
});

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('applications')
    .select('*, interviews(*)')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (error) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ data });
}

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: z.flattenError(parsed.error) }, { status: 400 });
  }

  // Fetch existing record so we can detect a status change
  const { data: existing } = await supabase
    .from('applications')
    .select('status, company, role_title')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  const { data, error } = await supabase
    .from('applications')
    .update(parsed.data)
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Fire milestone email when status advances to a key stage
  const MILESTONES = new Set(['phone_screen', 'technical', 'final_round', 'offer']);
  const newStatus = parsed.data.status;
  if (newStatus && MILESTONES.has(newStatus) && existing?.status !== newStatus) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, email, email_notifications')
      .eq('id', user.id)
      .single();

    const emailEnabled = profile?.email_notifications !== false; // default on
    const toEmail = profile?.email ?? user.email;

    if (emailEnabled && toEmail) {
      const email = milestoneEmail({
        toName: profile?.full_name ?? toEmail.split('@')[0],
        company: existing?.company ?? data.company,
        role: existing?.role_title ?? data.role_title,
        newStatus,
        appUrl: APP_URL,
        applicationId: id,
      });
      if (email) void sendEmail({ to: toEmail, ...email });
    }
  }

  return NextResponse.json({ data });
}

export async function DELETE(_req: Request, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { error } = await supabase
    .from('applications')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
