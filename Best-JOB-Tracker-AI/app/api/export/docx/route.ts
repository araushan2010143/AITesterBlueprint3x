import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  BorderStyle,
  ShadingType,
  convertInchesToTwip,
} from 'docx';
import type { ResumeSection } from '@/app/api/ai/generate-resume/route';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

function rule() {
  return new Paragraph({
    border: { bottom: { color: '4F46E5', size: 6, style: BorderStyle.SINGLE } },
    spacing: { after: 120 },
  });
}

function sectionHeading(text: string) {
  return new Paragraph({
    children: [new TextRun({ text: text.toUpperCase(), bold: true, color: '4F46E5', size: 22 })],
    spacing: { before: 240, after: 60 },
    heading: HeadingLevel.HEADING_2,
  });
}

function bullet(text: string) {
  return new Paragraph({
    bullet: { level: 0 },
    children: [new TextRun({ text, size: 20 })],
    spacing: { after: 40 },
    indent: { left: convertInchesToTwip(0.25) },
  });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let resume: ResumeSection;
  let role: string;
  try {
    const body = await request.json();
    resume = body.resume as ResumeSection;
    role = body.role ?? 'Role';
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const { personalInfo, summary, skills, experience, education, certifications } = resume;

  const contactParts = [
    personalInfo.email,
    personalInfo.phone,
    personalInfo.location,
    personalInfo.linkedin,
    personalInfo.github,
  ].filter(Boolean).join('  |  ');

  const children: Paragraph[] = [
    // Name header
    new Paragraph({
      children: [new TextRun({ text: personalInfo.name, bold: true, size: 52, color: '1E1B4B' })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 80 },
      shading: { type: ShadingType.CLEAR, fill: 'EEF2FF' },
    }),
    new Paragraph({
      children: [new TextRun({ text: contactParts, size: 18, color: '4B5563' })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 160 },
    }),

    // Summary
    sectionHeading('Professional Summary'),
    rule(),
    new Paragraph({
      children: [new TextRun({ text: summary, size: 20 })],
      spacing: { after: 120 },
    }),

    // Skills
    sectionHeading('Core Competencies'),
    rule(),
    ...skills.flatMap((group) => [
      new Paragraph({
        children: [
          new TextRun({ text: `${group.category}: `, bold: true, size: 20 }),
          new TextRun({ text: group.items.join(', '), size: 20 }),
        ],
        spacing: { after: 60 },
      }),
    ]),

    // Experience
    sectionHeading('Professional Experience'),
    rule(),
    ...experience.flatMap((job) => [
      new Paragraph({
        children: [new TextRun({ text: job.company, bold: true, size: 22 })],
        spacing: { before: 120, after: 0 },
      }),
      new Paragraph({
        children: [
          new TextRun({ text: job.role, bold: true, italics: true, size: 20, color: '4F46E5' }),
          new TextRun({ text: `  |  ${job.duration}`, size: 20, color: '6B7280' }),
          job.location ? new TextRun({ text: `  |  ${job.location}`, size: 20, color: '6B7280' }) : new TextRun({ text: '' }),
        ],
        spacing: { after: 60 },
      }),
      ...job.bullets.map((b) => bullet(b)),
    ]),

    // Education
    ...(education.length > 0
      ? [
          sectionHeading('Education'),
          rule(),
          ...education.map(
            (ed) =>
              new Paragraph({
                children: [
                  new TextRun({ text: `${ed.degree}`, bold: true, size: 20 }),
                  new TextRun({ text: `  —  ${ed.institution}`, size: 20 }),
                  new TextRun({ text: `  (${ed.year})`, size: 20, color: '6B7280' }),
                ],
                spacing: { after: 80 },
              })
          ),
        ]
      : []),

    // Certifications
    ...(certifications.length > 0
      ? [
          sectionHeading('Certifications'),
          rule(),
          ...certifications.map((c) => bullet(c)),
        ]
      : []),
  ];

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: { font: 'Calibri', size: 20 },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: convertInchesToTwip(0.75),
              right: convertInchesToTwip(0.75),
              bottom: convertInchesToTwip(0.75),
              left: convertInchesToTwip(0.75),
            },
          },
        },
        children,
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  const fileName = `${personalInfo.name.replace(/\s+/g, '_')}_${role.replace(/\s+/g, '_')}_Resume.docx`;

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="${fileName}"`,
    },
  });
}
