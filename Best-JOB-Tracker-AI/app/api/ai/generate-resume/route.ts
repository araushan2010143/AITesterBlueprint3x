import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { chatCompletion, parseJSON } from '@/lib/ai';
import { z } from 'zod';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const schema = z.object({
  applicationId: z.uuid(),
  resumeText: z.string().min(50).max(10000),
  tailoredBullets: z.array(z.object({
    original: z.string(),
    tailored: z.string(),
    improvement: z.string(),
  })).optional().default([]),
  keywords: z.array(z.string()).optional().default([]),
  contactInfo: z.object({
    phone: z.string().optional(),
    linkedin: z.string().optional(),
    github: z.string().optional(),
    location: z.string().optional(),
  }).optional().default({}),
});

export interface ResumeSection {
  personalInfo: {
    name: string;
    email: string;
    phone: string;
    location: string;
    linkedin: string;
    github: string;
  };
  summary: string;
  skills: { category: string; items: string[] }[];
  experience: {
    company: string;
    role: string;
    duration: string;
    location: string;
    bullets: string[];
  }[];
  education: {
    institution: string;
    degree: string;
    year: string;
  }[];
  certifications: string[];
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: z.flattenError(parsed.error) }, { status: 400 });
  }

  const { applicationId, resumeText, tailoredBullets, keywords, contactInfo } = parsed.data;

  const { data: app } = await supabase
    .from('applications')
    .select('company, role_title, notes')
    .eq('id', applicationId)
    .eq('user_id', user.id)
    .single();

  if (!app) return NextResponse.json({ error: 'Application not found' }, { status: 404 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .single();

  const tailoredBulletsText = tailoredBullets.length > 0
    ? `\n\nTailored bullets to use:\n${tailoredBullets.map(b => `- ${b.tailored}`).join('\n')}`
    : '';

  const keywordsText = keywords.length > 0
    ? `\n\nKeywords to naturally include: ${keywords.join(', ')}`
    : '';

  try {
    const resumeText_ai = await chatCompletion({
      json: true,
      temperature: 0.2,
      max_tokens: 3000,
      messages: [
        {
          role: 'system',
          content: `You are an expert ATS Resume Writer. Parse the given resume and restructure it as a complete, job-ready resume tailored to a specific role.
Rules:
- NEVER fabricate credentials, companies, or dates — only use what's in the original resume
- Weave provided keywords naturally into bullets
- Use strong action verbs
- Keep bullets concise (one line each)
- Extract ALL work experience, education, certifications from the original
- Generate a 2-3 sentence professional summary tailored to the target role`,
        },
        {
          role: 'user',
          content: `Parse this resume and restructure it for: ${app.role_title} at ${app.company}

Original Resume:
${resumeText.substring(0, 6000)}
${tailoredBulletsText}
${keywordsText}

Candidate name: ${profile?.full_name ?? 'Not provided'}
Email: ${user.email ?? ''}
Phone: ${contactInfo.phone ?? 'Not provided'}
Location: ${contactInfo.location ?? 'Not provided'}
LinkedIn: ${contactInfo.linkedin ?? ''}
GitHub: ${contactInfo.github ?? ''}

Return this exact JSON structure:
{
  "personalInfo": {
    "name": "Full Name",
    "email": "email@example.com",
    "phone": "+91 XXXXX XXXXX",
    "location": "City, Country",
    "linkedin": "linkedin.com/in/username",
    "github": "github.com/username"
  },
  "summary": "2-3 sentence professional summary tailored to the role...",
  "skills": [
    { "category": "Test Automation", "items": ["Playwright", "Selenium", "Cypress"] },
    { "category": "Languages", "items": ["Java", "TypeScript", "Python"] }
  ],
  "experience": [
    {
      "company": "Company Name",
      "role": "Job Title",
      "duration": "Jan 2023 – Present",
      "location": "City / Remote",
      "bullets": ["Action verb + what you did + impact/metric", "..."]
    }
  ],
  "education": [
    { "institution": "University Name", "degree": "B.Tech Computer Science", "year": "2017" }
  ],
  "certifications": ["CSTAA – Certified Software Test Automation Architect", "Oracle Certified Professional: Java SE"]
}`,
        },
      ],
    });

    const resume = parseJSON<ResumeSection>(resumeText_ai, {
      personalInfo: {
        name: profile?.full_name ?? '',
        email: user.email ?? '',
        phone: contactInfo.phone ?? '',
        location: contactInfo.location ?? '',
        linkedin: contactInfo.linkedin ?? '',
        github: contactInfo.github ?? '',
      },
      summary: '',
      skills: [],
      experience: [],
      education: [],
      certifications: [],
    });

    // Guarantee personalInfo fields are set
    resume.personalInfo.email = resume.personalInfo.email || (user.email ?? '');
    resume.personalInfo.name = resume.personalInfo.name || (profile?.full_name ?? '');

    return NextResponse.json({ resume, company: app.company, role: app.role_title });
  } catch (err) {
    console.error('[generate-resume]', err);
    const message = err instanceof Error ? err.message : 'AI request failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
