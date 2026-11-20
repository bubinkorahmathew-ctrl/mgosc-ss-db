import { z } from "zod";

export const signInSchema = z.object({
  email: z.email("Enter a valid email address.").trim().toLowerCase(),
  password: z.string().min(1, "Enter your password.").max(200),
  next: z.string().optional(),
});
export type SignInInput = z.infer<typeof signInSchema>;

/** Only allow same-site relative redirects like /teacher/attendance. */
export function safeNext(next: string | undefined | null): string | null {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return null;
  return next;
}
