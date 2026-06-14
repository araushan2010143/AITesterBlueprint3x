import { Resend } from 'resend';

// Use verified domain in production; Resend's onboarding address works for testing
const FROM = process.env.RESEND_FROM_EMAIL ?? 'onboarding@resend.dev';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

export { APP_URL };

export async function sendEmail({
  to,
  subject,
  html,
}: {
  to: string;
  subject: string;
  html: string;
}) {
  if (!process.env.RESEND_API_KEY) return; // no-op if not configured
  // Lazy-init: only construct when the key is present so build-time import
  // doesn't throw when RESEND_API_KEY is absent from the build environment.
  const resend = new Resend(process.env.RESEND_API_KEY);
  try {
    await resend.emails.send({ from: FROM, to, subject, html });
  } catch (err) {
    // Email failures must never break the main request
    console.error('[email] send failed:', err);
  }
}
