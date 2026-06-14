import OpenAI from 'openai';

// Groq is OpenAI-compatible and has a free tier — no billing required
const client = new OpenAI({
  apiKey: process.env.GROQ_API_KEY ?? '',
  baseURL: 'https://api.groq.com/openai/v1',
});

export const AI_MODEL = 'llama-3.3-70b-versatile';
export const AI_MODEL_HEAVY = 'llama-3.3-70b-versatile';

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface ChatOptions {
  messages: Message[];
  max_tokens?: number;
  temperature?: number;
  json?: boolean;
}

export async function chatCompletion(options: ChatOptions): Promise<string> {
  const { messages, max_tokens = 1000, temperature = 0.5, json = false } = options;

  const augmented = json
    ? messages.map((m) =>
        m.role === 'system'
          ? { ...m, content: m.content + '\n\nIMPORTANT: Return ONLY valid JSON. No markdown code fences, no explanation.' }
          : m
      )
    : messages;

  const response = await client.chat.completions.create({
    model: AI_MODEL,
    max_tokens,
    temperature,
    messages: augmented,
    ...(json ? { response_format: { type: 'json_object' as const } } : {}),
  });

  return response.choices[0].message.content ?? '';
}

export function parseJSON<T>(text: string, fallback: T): T {
  try {
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
    return JSON.parse(cleaned) as T;
  } catch {
    return fallback;
  }
}
