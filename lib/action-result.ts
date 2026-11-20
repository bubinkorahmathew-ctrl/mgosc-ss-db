import { z } from "zod";
import { AuthError } from "@/lib/auth";

export type ActionResult<T = undefined> =
  | { ok: true; data?: T; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

/** Turns thrown errors into friendly messages; never leaks internals. */
export function toActionError(e: unknown): { ok: false; error: string; fieldErrors?: Record<string, string[]> } {
  if (e instanceof z.ZodError) {
    return {
      ok: false,
      error: "Please check the highlighted fields.",
      fieldErrors: z.flattenError(e).fieldErrors as Record<string, string[]>,
    };
  }
  if (e instanceof AuthError) return { ok: false, error: e.message };
  const msg = (e as { message?: string })?.message ?? "";
  if (/duplicate key/i.test(msg)) return { ok: false, error: "That record already exists." };
  if (/row-level security|not allowed|permission denied/i.test(msg))
    return { ok: false, error: "You are not allowed to do that." };
  console.error(e);
  return { ok: false, error: "Something went wrong. Please try again." };
}
