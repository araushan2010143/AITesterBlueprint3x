// Shared HTML email templates — all inline styles for maximum email client compatibility

const BRAND = '#4F46E5';

function base(body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>JOB Tracker AI</title></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:40px 16px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">

        <!-- Logo header -->
        <tr>
          <td align="center" style="padding-bottom:24px;">
            <table cellpadding="0" cellspacing="0">
              <tr>
                <td style="background:${BRAND};border-radius:12px;width:44px;height:44px;text-align:center;vertical-align:middle;">
                  <span style="color:white;font-weight:800;font-size:14px;letter-spacing:-0.5px;">JT</span>
                </td>
                <td style="padding-left:10px;vertical-align:middle;">
                  <span style="font-size:16px;font-weight:700;color:#1e293b;">JOB Tracker AI</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Card -->
        <tr>
          <td style="background:#ffffff;border-radius:16px;border:1px solid #e2e8f0;padding:40px 40px 32px;">
            ${body}
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td align="center" style="padding-top:24px;">
            <p style="margin:0;font-size:12px;color:#94a3b8;">
              JOB Tracker AI · AI Career Operating System<br>
              <a href="{APP_URL}/settings" style="color:#94a3b8;">Manage email preferences</a>
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function cta(label: string, url: string): string {
  return `<a href="${url}" style="display:inline-block;background:${BRAND};color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 24px;border-radius:8px;margin-top:24px;">${label}</a>`;
}

function badge(text: string, color = BRAND): string {
  return `<span style="display:inline-block;background:${color}20;color:${color};border:1px solid ${color}40;font-size:11px;font-weight:600;padding:3px 10px;border-radius:999px;letter-spacing:0.5px;text-transform:uppercase;">${text}</span>`;
}

// ── Welcome ──────────────────────────────────────────────────────────────────

export function welcomeEmail({
  name,
  appUrl,
}: {
  name: string;
  appUrl: string;
}): { subject: string; html: string } {
  const subject = 'Welcome to JOB Tracker AI — let\'s land your next role';
  const html = base(`
    <h1 style="margin:0 0 8px;font-size:24px;font-weight:800;color:#0f172a;">Welcome, ${name}! 👋</h1>
    <p style="margin:0 0 24px;font-size:15px;color:#475569;line-height:1.6;">
      Your AI-powered career OS is ready. Here's what you can do from day one:
    </p>

    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
      <tr style="background:#f8fafc;border-bottom:1px solid #e2e8f0;">
        <td style="padding:16px;">
          <p style="margin:0;font-size:13px;font-weight:700;color:#0f172a;">📋 Track every application</p>
          <p style="margin:4px 0 0;font-size:13px;color:#64748b;">Kanban board, status pipeline, CSV export — all in one place.</p>
        </td>
      </tr>
      <tr style="background:#ffffff;border-bottom:1px solid #e2e8f0;">
        <td style="padding:16px;">
          <p style="margin:0;font-size:13px;font-weight:700;color:#0f172a;">✨ AI tailoring in seconds</p>
          <p style="margin:4px 0 0;font-size:13px;color:#64748b;">Paste your resume → get ATS score + tailored bullets + DOCX download.</p>
        </td>
      </tr>
      <tr style="background:#f8fafc;">
        <td style="padding:16px;">
          <p style="margin:0;font-size:13px;font-weight:700;color:#0f172a;">🎯 Prep for every interview</p>
          <p style="margin:4px 0 0;font-size:13px;color:#64748b;">Company-specific questions with STAR frameworks, difficulty tags, and coaching tips.</p>
        </td>
      </tr>
    </table>

    <div style="text-align:center;">
      ${cta('Open your dashboard →', appUrl + '/tracker')}
    </div>

    <p style="margin:24px 0 0;font-size:13px;color:#94a3b8;text-align:center;">
      Tip: install the Chrome extension to capture jobs from LinkedIn in one click.
    </p>
  `);
  return { subject, html };
}

// ── Status milestone ──────────────────────────────────────────────────────────

const MILESTONE_CONFIG: Record<string, { emoji: string; headline: string; body: string; cta_label: string; cta_path: string; color: string }> = {
  applied: {
    emoji: '🚀',
    headline: 'Application submitted!',
    body: "You took the leap and applied. Great first step — now stay on top of it. Use AI Prep to get ready in case they reach out fast.",
    cta_label: 'Track your application →',
    cta_path: '/tracker',
    color: '#4F46E5',
  },
  phone_screen: {
    emoji: '📞',
    headline: 'You got a phone screen!',
    body: 'A recruiter reached out — that means your application stood out. Use Interview Prep to get ready for the call.',
    cta_label: 'Prep for the call →',
    cta_path: '/ai/prep',
    color: '#3B82F6',
  },
  technical: {
    emoji: '💻',
    headline: 'Technical interview unlocked',
    body: "You've cleared the first hurdle. Time to sharpen your technical skills — generate a tailored set of interview questions.",
    cta_label: 'Generate interview questions →',
    cta_path: '/ai/prep',
    color: '#8B5CF6',
  },
  final_round: {
    emoji: '🏁',
    headline: "You're in the final round!",
    body: "This is it — final round at your target company. You've earned this. Prep hard, stay confident, and go show them what you've got.",
    cta_label: 'Prep for final round →',
    cta_path: '/ai/prep',
    color: '#F59E0B',
  },
  offer: {
    emoji: '🎉',
    headline: 'You got an OFFER!',
    body: "Congratulations — your hard work paid off. An offer is on the table. Take your time, review the details carefully, and celebrate this win.",
    cta_label: 'View your application →',
    cta_path: '/tracker',
    color: '#10B981',
  },
};

export function milestoneEmail({
  toName,
  company,
  role,
  newStatus,
  appUrl,
  applicationId,
}: {
  toName: string;
  company: string;
  role: string;
  newStatus: string;
  appUrl: string;
  applicationId: string;
}): { subject: string; html: string } | null {
  const m = MILESTONE_CONFIG[newStatus];
  if (!m) return null;

  const subject = `${m.emoji} ${m.headline} — ${company}`;
  const targetUrl = `${appUrl}${m.cta_path}?id=${applicationId}`;

  const html = base(`
    <div style="text-align:center;margin-bottom:28px;">
      <div style="font-size:48px;line-height:1;margin-bottom:12px;">${m.emoji}</div>
      ${badge(newStatus.replace('_', ' '), m.color)}
      <h1 style="margin:16px 0 8px;font-size:22px;font-weight:800;color:#0f172a;">${m.headline}</h1>
      <p style="margin:0;font-size:14px;color:#64748b;font-weight:600;">${role} at ${company}</p>
    </div>

    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:20px;margin-bottom:4px;">
      <p style="margin:0;font-size:14px;color:#475569;line-height:1.7;">
        Hi ${toName}, ${m.body}
      </p>
    </div>

    <div style="text-align:center;">
      ${cta(m.cta_label, targetUrl)}
    </div>

    <p style="margin:24px 0 0;font-size:12px;color:#cbd5e1;text-align:center;">
      You're receiving this because milestone notifications are enabled in your account.
    </p>
  `);

  return { subject, html };
}

// ── Weekly digest ─────────────────────────────────────────────────────────────

export function weeklyDigestEmail({
  toName,
  appUrl,
  stats,
}: {
  toName: string;
  appUrl: string;
  stats: {
    total: number;
    active: number;
    interviews: number;
    offers: number;
    responseRate: number;
    topCompanies: string[];
  };
}): { subject: string; html: string } {
  const subject = `Your weekly job search report — ${stats.total} applications tracked`;

  const html = base(`
    <h1 style="margin:0 0 4px;font-size:22px;font-weight:800;color:#0f172a;">Weekly Report 📊</h1>
    <p style="margin:0 0 28px;font-size:14px;color:#64748b;">Hi ${toName}, here's your job search snapshot.</p>

    <!-- Stats grid -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      <tr>
        ${[
          { label: 'Total Apps', value: stats.total, color: BRAND },
          { label: 'Active', value: stats.active, color: '#3B82F6' },
          { label: 'Interviews', value: stats.interviews, color: '#8B5CF6' },
          { label: 'Offers', value: stats.offers, color: '#10B981' },
        ].map(s => `
          <td width="25%" style="padding:0 4px;">
            <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px 12px;text-align:center;">
              <p style="margin:0;font-size:26px;font-weight:800;color:${s.color};">${s.value}</p>
              <p style="margin:4px 0 0;font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;">${s.label}</p>
            </div>
          </td>
        `).join('')}
      </tr>
    </table>

    <!-- Response rate -->
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:16px 20px;margin-bottom:24px;">
      <p style="margin:0;font-size:13px;color:#166534;">
        <strong>Response rate:</strong> ${stats.responseRate}% of your applications converted to an interview.
        ${stats.responseRate >= 20 ? ' Excellent! Keep it up.' : ' Tip: try tailoring your resume with the AI tool before applying.'}
      </p>
    </div>

    ${stats.topCompanies.length > 0 ? `
    <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#0f172a;">Active at these companies:</p>
    <p style="margin:0 0 24px;font-size:13px;color:#475569;">${stats.topCompanies.slice(0, 5).join(' · ')}</p>
    ` : ''}

    <div style="text-align:center;">
      ${cta('View full analytics →', appUrl + '/analytics')}
    </div>
  `);

  return { subject, html };
}
