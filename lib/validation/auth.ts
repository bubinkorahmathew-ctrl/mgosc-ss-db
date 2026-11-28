import { z } from "zod";

export const PASSWORD_MIN = 10;
/** bcrypt only reads the first 72 bytes; a Malayalam letter takes 3. */
const PASSWORD_MAX_BYTES = 72;

export const signInSchema = z.object({
  // trimmed first: phone keyboards add a space after an autocompleted address
  email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address.").max(254)),
  password: z.string().min(1, "Enter your password.").max(200),
  next: z.string().max(500).optional(),
  /** stay signed in for 14 days; otherwise 12 hours */
  remember: z.boolean().default(true),
});
export type SignInInput = z.infer<typeof signInSchema>;

/**
 * What Auth.js hands to authorize(): every field arrives as text, plus extras such as
 * callbackUrl and remember ("true"/"false"). Only email and password are checked here.
 */
export const credentialsSchema = signInSchema.pick({ email: true, password: true });

/** A new password, chosen by the person (never a default). */
export const newPasswordSchema = z.string()
  .min(PASSWORD_MIN, `Use at least ${PASSWORD_MIN} characters.`)
  .refine((v) => new TextEncoder().encode(v.normalize("NFC")).length <= PASSWORD_MAX_BYTES, "Password is too long.");

export const changePasswordSchema = z.object({
  current: z.string().min(1, "Enter your current password.").max(200),
  password: newPasswordSchema,
  confirm: z.string(),
})
  .refine((v) => v.password === v.confirm, { message: "Passwords do not match.", path: ["confirm"] })
  .refine((v) => v.password !== v.current, { message: "The new password must be different.", path: ["password"] });
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

/** Only allow same-site relative redirects like /teacher/attendance. */
export function safeNext(next: string | undefined | null): string | null {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return null;
  return next;
}
