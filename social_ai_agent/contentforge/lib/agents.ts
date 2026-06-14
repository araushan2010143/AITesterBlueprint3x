import Groq from 'groq-sdk';
import fs from 'fs';
import path from 'path';
import { excelManager } from './excelManager';
import type { ContentRow } from './types';

// ── Lazy API clients ──────────────────────────────────────────────────────────

function getGroq(): Groq {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error('GROQ_API_KEY is not set');
  return new Groq({ apiKey: key });
}


async function groqComplete(prompt: string, maxTokens = 4096): Promise<string> {
  const groq = getGroq();
  const completion = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [{ role: 'user', content: prompt }],
    max_tokens: maxTokens,
    temperature: 0.7,
  });
  return completion.choices[0]?.message?.content?.trim() ?? '';
}

const KEYWORD_POOL = [
  'QA', 'MCP', 'RAG', 'LLM', 'AI Agents', 'n8n', 'LangFlow',
  'Crew AI', 'DeepEval', 'LangChain', 'AI Harness', 'LLM Eval',
];

// ── Agent 1: Topic Generator ──────────────────────────────────────────────────

export async function agent1GenerateTopic(): Promise<string> {
  console.log('[Agent1] Generating topic...');

  const existing = await excelManager.readAll();
  const existingTopics = existing.map((r) => r.topic).filter(Boolean);
  const today = todayDate();

  // Check if today already has a row
  const todayRow = existing.find((r) => r.date === today);
  if (todayRow?.topic) {
    console.log(`[Agent1] Today already has topic: ${todayRow.topic}`);
    return todayRow.topic;
  }

  const avoidList = existingTopics.slice(-20).join(', ');
  const prompt = `You are a technical content strategist.

Pick ONE topic title from this keyword pool: ${KEYWORD_POOL.join(', ')}

Rules:
- The title must be specific and actionable (e.g. "Building RAG Pipelines with LangChain and FAISS" not just "RAG")
- Avoid these recently used topics: ${avoidList || 'none yet'}
- Return ONLY the topic title, nothing else, no quotes, no punctuation at the end

Topic:`;

  const topic = await groqComplete(prompt, 100);
  const cleanTopic = topic.replace(/^["']|["']$/g, '').trim();

  await excelManager.appendRow({
    date: today,
    topic: cleanTopic,
    status: 'Pending',
  });

  console.log(`[Agent1] Topic generated: ${cleanTopic}`);
  return cleanTopic;
}

// ── Agent 2: Content Writer ───────────────────────────────────────────────────

export async function agent2WriteContent(topic: string): Promise<Partial<ContentRow>> {
  console.log(`[Agent2] Writing content for: ${topic}`);
  const today = todayDate();

  // Skip if content already written (e.g. retrying after image failure)
  const existing = await excelManager.readByDate(today);
  if (existing?.linkedinPost) {
    console.log('[Agent2] Content already exists, skipping re-generation');
    return {
      linkedinPost: existing.linkedinPost,
      mediumArticle: existing.mediumArticle,
      igScript: existing.igScript,
      ytScript: existing.ytScript,
      devtoArticle: existing.devtoArticle,
    };
  }

  await excelManager.updateRow(today, { status: 'Writing', updatedBy: 'Agent2-ContentWriter' });

  const voice = `Writing style: direct, opinionated, technical. Short paragraphs. Real code examples.
No filler phrases like "game-changer", "dive deep", "revolutionary", or "in today's world".
Assume the reader is a senior developer. Get to the point immediately.`;

  // Run all 5 content pieces in parallel
  const [linkedinPost, mediumArticle, igScript, ytScript, devtoArticle] = await Promise.all([
    groqComplete(`${voice}

Write a LinkedIn post about: "${topic}"

Format:
- Opening hook (first line grabs attention — a bold claim or stat, no question)
- 3-4 short paragraphs with substance
- 1 concrete takeaway
- 3-5 relevant hashtags at the end

Target length: 150-200 words. No em-dashes. Post:`, 600),

    groqComplete(`${voice}

Write a complete Medium article about: "${topic}"

Requirements:
- 3000 words minimum
- Use markdown: ## headings, ### subheadings, code blocks with language tags
- Structure: Introduction → Problem → Solution (3+ sections) → Real Implementation → Pitfalls → Conclusion
- Include at least 2 code examples
- No fluff introductions like "In this article we will explore..."

Article:`, 4096),

    groqComplete(`${voice}

Write an Instagram Reel/Carousel script about: "${topic}"

Format:
SLIDE 1 (Hook): [text]
SLIDE 2: [text]
SLIDE 3: [text]
SLIDE 4: [text]
SLIDE 5: [text]
SLIDE 6 (CTA): [text]

Caption: [100-word caption with hashtags]

Each slide: max 40 words. Punchy. Visual-first thinking.

Script:`, 800),

    groqComplete(`${voice}

Write a complete YouTube video script about: "${topic}"

Format:
[00:00] INTRO (30 seconds)
[00:30] HOOK — why this matters right now
[01:00] SECTION 1: [title]
[XX:XX] SECTION 2: [title]
[XX:XX] SECTION 3: [title]
[XX:XX] DEMO / CODE WALKTHROUGH
[XX:XX] OUTRO — subscribe CTA + next video

Target length: 10-12 minute video (~1500-2000 words spoken).
Include actual spoken words, not just outline bullets.

Script:`, 3000),

    groqComplete(`${voice}

Write a complete Dev.to article about: "${topic}"

Requirements:
- 2000 words
- Use markdown with frontmatter:
---
title: [title]
tags: [tag1, tag2, tag3]
---
- Technical depth: real implementation, not theory
- Include code blocks with proper language tags
- Structure: Problem → Setup → Implementation → Testing → Gotchas
- End with a resources/links section

Article:`, 4096),
  ]);

  const updates: Partial<ContentRow> = {
    linkedinPost,
    mediumArticle,
    igScript,
    ytScript,
    devtoArticle,
    status: 'Imaging',
    updatedBy: 'Agent2-ContentWriter',
  };

  await excelManager.updateRow(today, updates);
  console.log('[Agent2] Content writing complete');
  return updates;
}

// ── Agent 3: Image Generator ──────────────────────────────────────────────────
// Uses Hugging Face Inference API (free tier) if HF_API_KEY is set,
// otherwise generates professional SVG placeholders.

export async function agent3GenerateImages(topic: string): Promise<Partial<ContentRow>> {
  console.log(`[Agent3] Generating images for: ${topic}`);
  const today = todayDate();

  const imagesDir = path.join(process.cwd(), 'public', 'images');
  if (!fs.existsSync(imagesDir)) fs.mkdirSync(imagesDir, { recursive: true });

  const hfKey = process.env.HF_API_KEY;
  const useHF = Boolean(hfKey?.trim());
  console.log(`[Agent3] Mode: ${useHF ? 'Hugging Face AI' : 'SVG placeholder'}`);

  const imageSpecs: Array<{
    key: keyof Pick<ContentRow, 'mediumImage' | 'linkedinImage' | 'igImage'>;
    filename: string;
    width: number;
    height: number;
    style: 'medium' | 'linkedin' | 'instagram';
    prompt: string;
  }> = [
    {
      key: 'mediumImage',
      filename: `${today}-medium.png`,
      width: 1200, height: 630,
      style: 'medium',
      prompt: `professional blog cover art for a technical article titled "${topic}", dark navy background, indigo purple gradient, abstract geometric tech patterns, circuit board elements, clean modern design, no text, no people`,
    },
    {
      key: 'linkedinImage',
      filename: `${today}-linkedin.png`,
      width: 1200, height: 627,
      style: 'linkedin',
      prompt: `professional linkedin article header for "${topic}", dark navy background, subtle indigo gradient, minimal tech iconography, network nodes, data flow visualization, corporate modern design, no text`,
    },
    {
      key: 'igImage',
      filename: `${today}-instagram.png`,
      width: 1080, height: 1080,
      style: 'instagram',
      prompt: `vibrant instagram tech post background for "${topic}", dark background, neon purple and indigo accents, bold geometric shapes, modern gen-z tech aesthetic, glowing elements, square format, no text`,
    },
  ];

  const results: Partial<ContentRow> = {};

  for (const spec of imageSpecs) {
    let saved: string | null = null;

    if (useHF) {
      const pngFilename = spec.filename; // already .png
      saved = await hfImageGenerate({ ...spec, filename: pngFilename }, imagesDir, hfKey!);
    }

    // Always fall back to SVG if HF is off or failed
    if (!saved) {
      const svgFilename = spec.filename.replace('.png', '.svg');
      saved = svgPlaceholder({ ...spec, filename: svgFilename }, imagesDir, topic);
    }

    results[spec.key] = saved;
  }

  const successCount = imageSpecs.filter((s) => results[s.key]).length;
  const finalUpdates: Partial<ContentRow> = {
    ...results,
    status: 'Done',
    updatedBy: 'Agent3-ImageGenerator',
  };

  await excelManager.updateRow(today, finalUpdates);
  console.log(`[Agent3] ${successCount}/${imageSpecs.length} images saved.`);
  return finalUpdates;
}

async function hfImageGenerate(
  spec: { key: string; filename: string; width: number; height: number; prompt: string },
  imagesDir: string,
  hfKey: string,
): Promise<string | null> {
  try {
    console.log(`[Agent3] HF generating ${spec.key}...`);
    const res = await fetch(
      'https://api-inference.huggingface.co/models/black-forest-labs/FLUX.1-schnell',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${hfKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          inputs: spec.prompt,
          parameters: { width: spec.width, height: spec.height },
        }),
        signal: AbortSignal.timeout(120_000),
      }
    );
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`HF API ${res.status}: ${text.slice(0, 200)}`);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    const outPath = path.join(imagesDir, spec.filename);
    fs.writeFileSync(outPath, buf);
    console.log(`[Agent3] HF saved ${spec.key}: /images/${spec.filename} (${(buf.length / 1024).toFixed(0)} KB)`);
    return `/images/${spec.filename}`;
  } catch (err) {
    console.error(`[Agent3] HF failed for ${spec.key}:`, err instanceof Error ? err.message : err);
    return null;
  }
}

function svgPlaceholder(
  spec: { key: string; filename: string; width: number; height: number; style: 'medium' | 'linkedin' | 'instagram' },
  imagesDir: string,
  topic: string,
): string {
  const colors = {
    medium:    { from: '#0f172a', to: '#1e1b4b', accent: '#6366f1', dot: '#818cf8' },
    linkedin:  { from: '#0f172a', to: '#172554', accent: '#3b82f6', dot: '#60a5fa' },
    instagram: { from: '#0f172a', to: '#2d1b69', accent: '#a855f7', dot: '#c084fc' },
  };
  const c = colors[spec.style];
  const { width: w, height: h } = spec;
  const cx = w / 2;
  const cy = h / 2;

  // Wrap topic text across 2 lines if long
  const words = topic.split(' ');
  const mid = Math.ceil(words.length / 2);
  const line1 = words.slice(0, mid).join(' ');
  const line2 = words.slice(mid).join(' ');
  const fontSize = w >= 1080 ? 52 : 40;
  const lineH = fontSize * 1.3;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${c.from}"/>
      <stop offset="100%" stop-color="${c.to}"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="${c.accent}" stop-opacity="0.15"/>
      <stop offset="100%" stop-color="${c.accent}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#bg)"/>
  <rect width="${w}" height="${h}" fill="url(#glow)"/>
  <!-- Grid lines -->
  ${Array.from({ length: Math.floor(w / 80) }, (_, i) => `<line x1="${i * 80}" y1="0" x2="${i * 80}" y2="${h}" stroke="${c.accent}" stroke-width="0.5" opacity="0.08"/>`).join('\n  ')}
  ${Array.from({ length: Math.floor(h / 80) }, (_, i) => `<line x1="0" y1="${i * 80}" x2="${w}" y2="${i * 80}" stroke="${c.accent}" stroke-width="0.5" opacity="0.08"/>`).join('\n  ')}
  <!-- Corner dots -->
  <circle cx="40" cy="40" r="4" fill="${c.dot}" opacity="0.6"/>
  <circle cx="${w - 40}" cy="40" r="4" fill="${c.dot}" opacity="0.6"/>
  <circle cx="40" cy="${h - 40}" r="4" fill="${c.dot}" opacity="0.6"/>
  <circle cx="${w - 40}" cy="${h - 40}" r="4" fill="${c.dot}" opacity="0.6"/>
  <!-- Accent bar -->
  <rect x="${cx - 40}" y="${cy - lineH * 1.8}" width="80" height="4" rx="2" fill="${c.accent}" opacity="0.9"/>
  <!-- Topic text -->
  <text x="${cx}" y="${cy - lineH * 0.3}" text-anchor="middle" dominant-baseline="middle"
    font-family="system-ui,-apple-system,sans-serif" font-size="${fontSize}" font-weight="700"
    fill="white" opacity="0.95">${escXml(line1)}</text>
  ${line2 ? `<text x="${cx}" y="${cy + lineH * 0.7}" text-anchor="middle" dominant-baseline="middle"
    font-family="system-ui,-apple-system,sans-serif" font-size="${fontSize}" font-weight="700"
    fill="white" opacity="0.95">${escXml(line2)}</text>` : ''}
  <!-- Watermark -->
  <text x="${cx}" y="${h - 24}" text-anchor="middle"
    font-family="system-ui,-apple-system,sans-serif" font-size="14" fill="${c.dot}" opacity="0.4">ContentForge</text>
</svg>`;

  const outPath = path.join(imagesDir, spec.filename);
  fs.writeFileSync(outPath, svg, 'utf8');
  console.log(`[Agent3] SVG placeholder saved: /images/${spec.filename}`);
  return `/images/${spec.filename}`;
}

function escXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function todayDate(): string {
  return new Date().toISOString().split('T')[0] ?? '';
}

export async function checkApiKeys(): Promise<{ groq: boolean; gemini: boolean }> {
  let groq = false;
  let gemini = false;

  try {
    const g = getGroq();
    await g.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: 'ping' }],
      max_tokens: 1,
    });
    groq = true;
  } catch {
    groq = false;
  }

  // For Gemini just check the key is set (avoid burning quota on health check)
  gemini = Boolean(process.env.GEMINI_API_KEY?.trim());

  return { groq, gemini };
}
