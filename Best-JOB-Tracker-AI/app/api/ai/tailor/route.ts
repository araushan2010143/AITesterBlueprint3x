import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { chatCompletion, parseJSON } from '@/lib/ai';
import { z } from 'zod';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const schema = z.object({
  applicationId: z.uuid(),
  resumeText: z.string().min(100).max(8000),
});

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: z.flattenError(parsed.error) }, { status: 400 });

  const { applicationId, resumeText } = parsed.data;

  // Check daily limit
  const today = new Date().toISOString().split('T')[0];
  const { data: usage } = await supabase
    .from('ai_usage')
    .select('count')
    .eq('user_id', user.id)
    .eq('action_type', 'resume_tailor')
    .eq('date', today)
    .maybeSingle();

  if ((usage?.count ?? 0) >= 20) {
    return NextResponse.json({ error: 'Daily AI limit reached (20/day)' }, { status: 429 });
  }

  // Fetch job description
  const { data: app } = await supabase
    .from('applications')
    .select('company, role_title, notes')
    .eq('id', applicationId)
    .eq('user_id', user.id)
    .single();

  if (!app) return NextResponse.json({ error: 'Application not found' }, { status: 404 });

  try {
    const jd = app.notes ?? `${app.role_title} at ${app.company}`;

    // Stage 1: Extract keywords (score + bullets both depend on these)
    const keywordsText = await chatCompletion({
      json: true,
      temperature: 0.1,
      max_tokens: 500,
      messages: [
        { role: 'system', content: 'You are an ATS expert. Extract keywords from a job description.' },
        { role: 'user', content: `Extract must-have and nice-to-have keywords from this JD:\n\n${jd.substring(0, 2000)}\n\nReturn: {"must_have": ["keyword1"], "nice_to_have": ["keyword1"]}` },
      ],
    });
    const keywords = parseJSON(keywordsText, { must_have: [] as string[], nice_to_have: [] as string[] });

    // Stage 2: Score + Tailor in parallel (both use keywords from stage 1)
    const [scoreText, tailorText] = await Promise.all([
      chatCompletion({
        json: true,
        temperature: 0.1,
        max_tokens: 300,
        messages: [
          { role: 'system', content: 'You are an ATS scoring expert. Score a resume against a JD.' },
          { role: 'user', content: `Score this resume (0-100) against the job at ${app.company} for ${app.role_title}.\n\nResume:\n${resumeText.substring(0, 3000)}\n\nKeywords needed: ${keywords.must_have?.join(', ')}\n\nReturn: {"score": 75, "gaps": ["missing skill 1"]}` },
        ],
      }),
      chatCompletion({
        json: true,
        temperature: 0.3,
        max_tokens: 1500,
        messages: [
          {
            role: 'system',
            content: `You are a senior ATS Resume Expert. Rewrite resume bullet points to match the job description.
Rules:
- Keep achievements quantified (numbers/percentages)
- NEVER fabricate data or credentials
- Use keywords from the JD naturally
- Keep the same meaning, improve phrasing`,
          },
          {
            role: 'user',
            content: `Rewrite these resume bullets for ${app.role_title} at ${app.company}.
Must-have keywords: ${keywords.must_have?.join(', ')}

Resume text:
${resumeText.substring(0, 3000)}

Return: {"bullets": [{"original": "old text", "tailored": "new text", "improvement": "what changed"}]}`,
          },
        ],
      }),
    ]);
    const scoreData = parseJSON(scoreText, { score: 50, gaps: [] as string[] });
    const tailorData = parseJSON(tailorText, { bullets: [] as { original: string; tailored: string; improvement: string }[] });

    // Track usage
    await supabase.from('ai_usage').upsert(
      { user_id: user.id, action_type: 'resume_tailor', date: today, count: (usage?.count ?? 0) + 1 },
      { onConflict: 'user_id,action_type,date', ignoreDuplicates: false }
    );

    // Update match score on application
    await supabase
      .from('applications')
      .update({ ai_match_score: scoreData.score })
      .eq('id', applicationId)
      .eq('user_id', user.id);

    return NextResponse.json({
      score: scoreData.score,
      gaps: scoreData.gaps ?? [],
      keywords: keywords.must_have ?? [],
      bullets: tailorData.bullets ?? [],
    });
  } catch (err) {
    console.error('[tailor]', err);
    const message = err instanceof Error ? err.message : 'AI request failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
