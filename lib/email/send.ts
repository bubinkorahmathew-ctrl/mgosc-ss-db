import "server-only";
/**
 * Sending email through Gmail SMTP (server only: server actions, route handlers, after()).
 * The connection is made on first use, so a build or a page that never sends needs none of
 * the SMTP settings. Free Gmail allows about 500 emails a day: no bulk sending here.
 */
import nodemailer, { type Transporter } from "nodemailer";

export type Email = { to: string | string[]; subject: string; html: string; text?: string; replyTo?: string };

const REQUIRED = ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "EMAIL_FROM"] as const;

let transporter: Transporter | undefined;

function getTransporter(): Transporter {
  if (transporter) return transporter;
  const missing = REQUIRED.filter((k) => !process.env[k]);
  if (missing.length) {
    // names only: never the values
    const message = `Email is not set up: missing ${missing.join(", ")} (see .env.example).`;
    console.error(`[email] ${message}`);
    throw new Error(message);
  }
  const port = Number(process.env.SMTP_PORT);
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465, // 465: TLS from the start; 587 would upgrade with STARTTLS
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  return transporter;
}

/** The public address of the app, for links in emails (APP_URL, else NEXT_PUBLIC_SITE_URL). */
export function appUrl(): string {
  const url = process.env.APP_URL || process.env.NEXT_PUBLIC_SITE_URL;
  if (!url) throw new Error("APP_URL is not set (see .env.example).");
  return url.replace(/\/+$/, "");
}

/** Sends one email. Throws on failure; callers that must not fail wrap it (see notifications.ts). */
export async function sendEmail({ to, subject, html, text, replyTo }: Email): Promise<void> {
  await getTransporter().sendMail({ from: process.env.EMAIL_FROM, to, subject, html, text, replyTo });
}
