import OpenAI from 'openai';

export function getOpenAI(): OpenAI {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

export const AI_MODEL = 'gpt-4o-mini';
export const AI_MODEL_HEAVY = 'gpt-4o';

export async function checkAIUsage(
  supabase: ReturnType<typeof import('./supabase/server').createClient> extends Promise<infer T> ? T : never,
  userId: string,
  actionType: string,
  dailyLimit = 20
): Promise<{ allowed: boolean; remaining: number }> {
  const today = new Date().toISOString().split('T')[0];

  const { data } = await supabase
    .from('ai_usage')
    .select('count')
    .eq('user_id', userId)
    .eq('action_type', actionType)
    .eq('date', today)
    .single();

  const used = data?.count ?? 0;
  const remaining = dailyLimit - used;

  return { allowed: remaining > 0, remaining };
}

export async function incrementAIUsage(
  supabase: ReturnType<typeof import('./supabase/server').createClient> extends Promise<infer T> ? T : never,
  userId: string,
  actionType: string
): Promise<void> {
  const today = new Date().toISOString().split('T')[0];

  await supabase.from('ai_usage').upsert(
    { user_id: userId, action_type: actionType, date: today, count: 1 },
    {
      onConflict: 'user_id,action_type,date',
      ignoreDuplicates: false,
    }
  );

  await supabase.rpc('increment_ai_usage', {
    p_user_id: userId,
    p_action_type: actionType,
    p_date: today,
  });
}
