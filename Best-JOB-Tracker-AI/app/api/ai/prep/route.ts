import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { chatCompletion, parseJSON } from '@/lib/ai';
import { z } from 'zod';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const schema = z.object({
  applicationId: z.uuid(),
  roundType: z.enum(['phone', 'technical', 'system_design', 'hr', 'culture_fit', 'offer']),
});

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: z.flattenError(parsed.error) }, { status: 400 });

  const { applicationId, roundType } = parsed.data;

  const today = new Date().toISOString().split('T')[0];
  const { data: usage } = await supabase
    .from('ai_usage')
    .select('count')
    .eq('user_id', user.id)
    .eq('action_type', 'prep_questions')
    .eq('date', today)
    .maybeSingle();

  if ((usage?.count ?? 0) >= 20) {
    return NextResponse.json({ error: 'Daily AI limit reached (20/day)' }, { status: 429 });
  }

  const { data: app } = await supabase
    .from('applications')
    .select('company, role_title, notes')
    .eq('id', applicationId)
    .eq('user_id', user.id)
    .single();

  if (!app) return NextResponse.json({ error: 'Application not found' }, { status: 404 });

  const roundInstructions: Record<string, string> = {
    phone: '5 screening questions about background, motivation, and logistics',
    technical: '8 technical questions based on the role requirements, with code examples where relevant',
    system_design: '5 system design questions appropriate for the seniority level',
    hr: '5 behavioral questions in STAR format about teamwork, conflict, and leadership',
    culture_fit: '5 culture and values questions specific to the company',
    offer: '3 questions about negotiating the offer, role scope, and team dynamics',
  };

  try {
    const prepText = await chatCompletion({
      json: true,
      temperature: 0.4,
      max_tokens: 2000,
      messages: [
        {
          role: 'system',
          content: `You are a Technical Interview Coach with 10 years of FAANG and startup experience.
Generate interview prep questions that are specific to the company and role.
For behavioral questions, provide a STAR framework guide.`,
        },
        {
          role: 'user',
          content: `Generate interview prep for ${app.role_title} at ${app.company}.
Round type: ${roundType}
Instructions: ${roundInstructions[roundType] ?? '10 relevant questions'}
${app.notes ? `Job context: ${app.notes.substring(0, 500)}` : ''}

Return: {
  "questions": [
    {
      "question": "...",
      "category": "behavioral|technical|system_design|culture",
      "difficulty": "easy|medium|hard",
      "starGuide": "Situation: ..., Task: ..., Action: ..., Result: ...",
      "tip": "what interviewers look for"
    }
  ]
}`,
        },
      ],
    });

    const result = parseJSON(prepText, { questions: [] });

    await supabase.from('ai_usage').upsert(
      { user_id: user.id, action_type: 'prep_questions', date: today, count: (usage?.count ?? 0) + 1 },
      { onConflict: 'user_id,action_type,date', ignoreDuplicates: false }
    );

    return NextResponse.json({
      company: app.company,
      role: app.role_title,
      roundType,
      questions: result.questions ?? [],
    });
  } catch (err) {
    console.error('[prep]', err);
    const message = err instanceof Error ? err.message : 'AI request failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
