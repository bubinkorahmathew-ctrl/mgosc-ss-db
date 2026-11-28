/**
 * Email templates: simple, mobile-friendly HTML (inline styles, one column, max 560px) and a
 * plain-text version of each. Every value from a person (names, notes) is HTML-escaped.
 */
import { APP_NAME } from "@/lib/config";

export type Rendered = { subject: string; html: string; text: string };

const NAVY = "#183B70";
const GOLD = "#C6A04A";

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** The shared frame: title, paragraphs (already escaped), an optional button, and a footer. */
function layout(title: string, paragraphs: string[], button?: { label: string; url: string }, footer?: string): string {
  const p = (html: string) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:#1f2937">${html}</p>`;
  const cta = button
    ? `<p style="margin:22px 0"><a href="${escapeHtml(button.url)}" style="display:inline-block;background:${NAVY};color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 22px;border-radius:10px;border-bottom:3px solid ${GOLD}">${escapeHtml(button.label)}</a></p>
       <p style="margin:0 0 14px;font-size:12px;line-height:1.5;color:#6b7280">If the button doesn't work, copy this link into your browser:<br><span style="word-break:break-all">${escapeHtml(button.url)}</span></p>`
    : "";
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#FFF9ED">
  <div style="max-width:560px;margin:0 auto;padding:24px 16px;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif">
    <div style="background:#ffffff;border:1px solid #eadfc4;border-radius:14px;padding:24px">
      <p style="margin:0 0 6px;font-size:12px;letter-spacing:1.5px;text-transform:uppercase;color:${GOLD};font-weight:700">${escapeHtml(APP_NAME)}</p>
      <h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;color:${NAVY}">${escapeHtml(title)}</h1>
      ${paragraphs.map(p).join("")}
      ${cta}
    </div>
    <p style="margin:14px 4px 0;font-size:12px;line-height:1.5;color:#6b7280">${footer ?? "Mar Gregorios Orthodox Syrian Church · OSSAE (Thrissur Diocese) Sunday School"}</p>
  </div>
</body></html>`;
}

const lines = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join("\n");

// ---------------------------------------------------------------------------
// Password reset
// ---------------------------------------------------------------------------

export function passwordResetEmail({ name, link }: { name: string; link: string }): Rendered {
  const subject = `Reset your ${APP_NAME} password`;
  return {
    subject,
    html: layout("Reset your password", [
      `Hello ${escapeHtml(name)},`,
      "Someone (hopefully you) asked to reset the password of your staff account. The link below works once, for 1 hour.",
    ], { label: "Choose a new password", url: link },
    "If you didn't ask for this, you can ignore this email: your password stays the same."),
    text: lines(
      `Hello ${name},`, "",
      "Someone (hopefully you) asked to reset the password of your staff account.",
      "Open this link within 1 hour to choose a new password (it works once):", link, "",
      "If you didn't ask for this, you can ignore this email: your password stays the same.",
    ),
  };
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

export type RegistrationSummary = {
  childName: string; dob: string; schoolClass: string; fatherName: string; phone: string; email: string | null; prayerUnit: string | null;
};

export function newRegistrationEmail(r: RegistrationSummary, link: string): Rendered {
  const details = [
    ["Child", r.childName], ["Date of birth", r.dob], ["School class", r.schoolClass], ["Father", r.fatherName],
    ["Phone", r.phone], ["Email", r.email], ["Prayer unit", r.prayerUnit],
  ].filter(([, v]) => v) as [string, string][];
  return {
    subject: `New registration: ${r.childName}`,
    html: layout("New student registration", [
      `${escapeHtml(r.childName)} was registered on the public form and is waiting for review.`,
      details.map(([k, v]) => `<strong>${escapeHtml(k)}:</strong> ${escapeHtml(v)}`).join("<br>"),
    ], { label: "Review the registration", url: link },
    "You get this because email notifications are on for your account (Account page)."),
    text: lines(
      `${r.childName} was registered on the public form and is waiting for review.`, "",
      ...details.map(([k, v]) => `${k}: ${v}`), "",
      `Review it: ${link}`, "",
      "You get this because email notifications are on for your account (Account page).",
    ),
  };
}

export type StudentSummary = { name: string; admissionNo: string; className: string };

export function newStudentInClassEmail(s: StudentSummary, link: string): Rendered {
  return {
    subject: `New student in ${s.className}: ${s.name}`,
    html: layout(`New student in ${s.className}`, [
      `<strong>${escapeHtml(s.name)}</strong> (${escapeHtml(s.admissionNo)}) has been added to your class, ${escapeHtml(s.className)}.`,
    ], { label: "Open the student", url: link },
    "You get this because email notifications are on for your account (Account page)."),
    text: lines(
      `${s.name} (${s.admissionNo}) has been added to your class, ${s.className}.`, "",
      `Open the student: ${link}`, "",
      "You get this because email notifications are on for your account (Account page).",
    ),
  };
}
