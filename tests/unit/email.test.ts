import { afterEach, describe, expect, it, vi } from "vitest";
import { escapeHtml, newRegistrationEmail, newStudentInClassEmail, passwordResetEmail } from "@/lib/email/templates";
import { forgotPasswordSchema, resetPasswordSchema } from "@/lib/validation/auth";

describe("email templates", () => {
  it("escape anything a person typed", () => {
    expect(escapeHtml(`<script>"&'`)).toBe("&lt;script&gt;&quot;&amp;&#39;");
    const mail = newRegistrationEmail({
      childName: "<b>Evil</b>", dob: "01/01/2015", schoolClass: "Grade 3", fatherName: "Dad", phone: "966500000000",
      email: null, prayerUnit: null,
    }, "https://example.org/admin/registrations");
    expect(mail.html).not.toContain("<b>Evil</b>");
    expect(mail.html).toContain("&lt;b&gt;Evil&lt;/b&gt;");
    expect(mail.text).toContain("<b>Evil</b>"); // plain text needs no escaping
  });

  it("have an HTML and a plain-text version with the link in both", () => {
    const link = "https://example.org/reset-password?token=abc";
    for (const m of [passwordResetEmail({ name: "Anu", link }), newStudentInClassEmail({ name: "Aaron", admissionNo: "SS-2026-0001", className: "Class 1" }, link)]) {
      expect(m.subject.length).toBeGreaterThan(5);
      expect(m.html).toContain(link.replace(/&/g, "&amp;"));
      expect(m.text).toContain(link);
      expect(m.html).toContain('name="viewport"');
    }
  });
});

describe("email sending", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("without the SMTP settings it fails with a clear message naming them, never their values", async () => {
    for (const k of ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "EMAIL_FROM"]) vi.stubEnv(k, "");
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const { sendEmail } = await import("@/lib/email/send");
    await expect(sendEmail({ to: "x@example.org", subject: "s", html: "<p>h</p>" })).rejects.toThrow(/missing SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_FROM/);
    errors.mockRestore();
  });

  it("loading the module needs no settings (builds work without them)", async () => {
    for (const k of ["SMTP_HOST", "SMTP_PASS"]) vi.stubEnv(k, "");
    await expect(import("@/lib/email/send")).resolves.toBeTruthy();
  });
});

describe("forgot / reset password forms", () => {
  it("accept an email with spaces and the honeypot; the new password follows the usual rules", () => {
    expect(forgotPasswordSchema.parse({ email: " Anu@Example.com " }).email).toBe("anu@example.com");
    expect(resetPasswordSchema.safeParse({ password: "short", confirm: "short" }).success).toBe(false);
    expect(resetPasswordSchema.safeParse({ password: "a-long-enough-one", confirm: "a-different-one" }).success).toBe(false);
    expect(resetPasswordSchema.safeParse({ password: "a-long-enough-one", confirm: "a-long-enough-one" }).success).toBe(true);
  });
});
