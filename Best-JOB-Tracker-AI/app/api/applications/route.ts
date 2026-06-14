import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createBearerClient } from '@supabase/supabase-js';
import { z } from 'zod';

// Accepts both cookie sessions (web app) and Bearer tokens (Chrome extension)
async function getSupabaseAndUser(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) return { supabase, user };

  const auth = request.headers.get('Authorization') ?? '';
  if (auth.startsWith('Bearer ')) {
    const token = auth.slice(7);
    // Pass token as global header so RLS sees the user on every DB query
    const client = createBearerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    );
    const { data: { user: tokenUser } } = await client.auth.getUser();
    if (tokenUser) return { supabase: client, user: tokenUser };
  }
  return { supabase, user: null };
}

export const maxDuration = 10;

const createSchema = z.object({
  company: z.string().min(1).max(200),
  role_title: z.string().min(1).max(200),
  job_url: z.url().optional().nullable(),
  source: z.enum(['linkedin', 'naukri', 'email', 'referral', 'manual', 'extension']).default('manual'),
  status: z.enum(['bookmarked', 'applied', 'phone_screen', 'technical', 'final_round', 'offer', 'rejected', 'ghosted', 'withdrawn']).default('bookmarked'),
  applied_at: z.string().optional().nullable(),
  deadline: z.string().optional().nullable(),
  salary_min: z.number().optional().nullable(),
  salary_max: z.number().optional().nullable(),
  salary_currency: z.enum(['INR', 'USD', 'GBP']).default('INR'),
  location: z.string().optional().nullable(),
  remote_type: z.enum(['remote', 'hybrid', 'onsite']).default('hybrid'),
  notes: z.string().optional().nullable(),
  resume_version: z.string().optional().nullable(),
  cover_letter_url: z.url().optional().nullable(),
  priority: z.enum(['urgent', 'high', 'medium', 'low']).default('medium'),
});

export async function GET(request: Request) {
  const { supabase, user } = await getSupabaseAndUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');
  const search = searchParams.get('search');

  let query = supabase
    .from('applications')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (status && status !== 'all') {
    query = query.eq('status', status);
  }
  if (search) {
    query = query.or(`company.ilike.%${search}%,role_title.ilike.%${search}%`);
  }

  const { data, error } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(request: Request) {
  const { supabase, user } = await getSupabaseAndUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Guarantee profile row exists — handles users created before the migration ran
  await supabase.from('profiles').upsert(
    { id: user.id, email: user.email ?? '' },
    { onConflict: 'id', ignoreDuplicates: true }
  );

  const body = await request.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: z.flattenError(parsed.error) }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('applications')
    .insert({ ...parsed.data, user_id: user.id })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}
