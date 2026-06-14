import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { chatCompletion, parseJSON } from '@/lib/ai';
import { searchCompanyNews } from '@/lib/tavily';
import { z } from 'zod';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const schema = z.object({
  applicationId: z.uuid(),
  hiringManagerName: z.string().optional(),
  yourTopAchievement: z.string().optional(),
});

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: z.flattenError(parsed.error) }, { status: 400 });

  const { applicationId, hiringManagerName, yourTopAchievement } = parsed.data;

  const today = new Date().toISOString().split('T')[0];
  const { data: usage } = await supabase
    .from('ai_usage')
    .select('count')
    .eq('user_id', user.id)
    .eq('action_type', 'cold_email')
    .eq('date', today)
    .maybeSingle();

  if ((usage?.count ?? 0) >= 20) {
    return NextResponse.json({ error: 'Daily AI limit reached (20/day)' }, { status: 429 });
  }

  const { data: app } = await supabase
    .from('applications')
    .select('company, role_title')
    .eq('id', applicationId)
    .eq('user_id', user.id)
    .single();

  if (!app) return NextResponse.json({ error: 'Application not found' }, { status: 404 });

  const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', user.id).single();

  try {
    const companyNews = await searchCompanyNews(app.company, 2);
    const newsHook = companyNews[0] ? companyNews[0].split(':')[0] : `${app.company}'s growth`;

    const emailText = await chatCompletion({
      json: true,
      temperature: 0.5,
      max_tokens: 300,
      messages: [
        {
          role: 'system',
          content: `You are an Executive Outreach Expert. Write 5-line AIDA cold emails that get replies.
Format (exactly 5 lines, no greetings like "Dear"):
Line 1: Company-specific compliment (based on real news)
Line 2: Who you are in one sentence
Line 3: Your single best achievement (quantified)
Line 4: Specific ask (30-min call, not vague "connect")
Line 5: Easy out (removes pressure)
Also generate a subject line.`,
        },
        {
          role: 'user',
          content: `Write a cold email for ${profile?.full_name ?? 'the candidate'} applying to ${app.role_title} at ${app.company}.
${hiringManagerName ? `Addressed to: ${hiringManagerName}` : 'No specific recipient name.'}
Company news hook: "${newsHook}"
${yourTopAchievement ? `Top achievement to highlight: ${yourTopAchievement}` : ''}

Return JSON: {"subject": "...", "body": "line1\\nline2\\nline3\\nline4\\nline5"}`,
        },
      ],
    });

    const result = parseJSON(emailText, { subject: '', body: '' });

    await supabase.from('ai_usage').upsert(
      { user_id: user.id, action_type: 'cold_email', date: today, count: (usage?.count ?? 0) + 1 },
      { onConflict: 'user_id,action_type,date', ignoreDuplicates: false }
    );

    return NextResponse.json({
      subject: result.subject,
      body: result.body,
      companyNews,
    });
  } catch (err) {
    console.error('[cold-email]', err);
    const message = err instanceof Error ? err.message : 'AI request failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
