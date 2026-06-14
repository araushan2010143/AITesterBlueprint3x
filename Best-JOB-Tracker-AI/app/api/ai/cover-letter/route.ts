import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { chatCompletion } from '@/lib/ai';
import { searchCompanyNews } from '@/lib/tavily';
import { z } from 'zod';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const schema = z.object({
  applicationId: z.uuid(),
  userName: z.string().optional(),
  userBackground: z.string().optional(),
});

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: z.flattenError(parsed.error) }, { status: 400 });

  const { applicationId, userName, userBackground } = parsed.data;

  const today = new Date().toISOString().split('T')[0];
  const { data: usage } = await supabase
    .from('ai_usage')
    .select('count')
    .eq('user_id', user.id)
    .eq('action_type', 'cover_letter')
    .eq('date', today)
    .maybeSingle();

  if ((usage?.count ?? 0) >= 20) {
    return NextResponse.json({ error: 'Daily AI limit reached (20/day)' }, { status: 429 });
  }

  const { data: app } = await supabase
    .from('applications')
    .select('company, role_title, notes, location')
    .eq('id', applicationId)
    .eq('user_id', user.id)
    .single();

  if (!app) return NextResponse.json({ error: 'Application not found' }, { status: 404 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .single();

  try {
    const companyNews = await searchCompanyNews(app.company);
    const newsContext = companyNews.length > 0
      ? `Recent news about ${app.company}:\n${companyNews.join('\n')}`
      : '';

    const name = userName ?? profile?.full_name ?? 'the candidate';

    const coverLetter = await chatCompletion({
      temperature: 0.7,
      max_tokens: 800,
      messages: [
        {
          role: 'system',
          content: `You are a Career Marketing Specialist who writes compelling cover letters.
Write in a warm, professional, direct tone. Never sycophantic. Max 3 paragraphs, ~250 words.
Structure:
P1: Opening hook — reference something specific about the company (from news if available)
P2: Why you're the right fit — 2-3 specific achievements mapped to the role requirements
P3: Closing — specific ask + cultural fit signal`,
        },
        {
          role: 'user',
          content: `Write a cover letter for ${name} applying to ${app.role_title} at ${app.company}.

${newsContext}

Job context: ${(app.notes ?? app.role_title).substring(0, 1000)}
${userBackground ? `Candidate background: ${userBackground}` : ''}

Keep it under 250 words. Don't start with "I am writing to express my interest."`,
        },
      ],
    });

    await supabase.from('ai_usage').upsert(
      { user_id: user.id, action_type: 'cover_letter', date: today, count: (usage?.count ?? 0) + 1 },
      { onConflict: 'user_id,action_type,date', ignoreDuplicates: false }
    );

    return NextResponse.json({
      coverLetter,
      companyNews,
      company: app.company,
      role: app.role_title,
    });
  } catch (err) {
    console.error('[cover-letter]', err);
    const message = err instanceof Error ? err.message : 'AI request failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
