"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertRole } from "@/lib/auth";
import * as toppers from "@/lib/repo/toppers";
import { scaleProblems } from "@/lib/grades";
import { gradeScaleSchema, topperQuerySchema } from "@/lib/validation/toppers";
import { toActionError, type ActionResult } from "@/lib/action-result";

function revalidateResults() {
  for (const p of ["/admin/settings", "/admin/report-cards", "/admin/toppers", "/teacher/toppers", "/teacher/reports", "/teacher/marks", "/admin/reports"]) {
    revalidatePath(p);
  }
}

/** Replace the whole grade scale. Admins only; bands must cover 0-100 with no gap or overlap. */
export async function saveGradeScale(input: unknown): Promise<ActionResult> {
  try {
    const user = await assertRole("headmaster");
    const bands = gradeScaleSchema.parse(input);
    const problems = scaleProblems(bands);
    if (problems.length) return { ok: false, error: problems[0], fieldErrors: { scale: problems } };
    await toppers.saveGradeScale(user, bands);
    revalidateResults();
    return { ok: true, message: "Grade scale saved." };
  } catch (e) {
    return toActionError(e);
  }
}

const minPctSchema = z.object({ attendance_topper_min_pct: z.number().int().min(0).max(100) });

/** How many of a period's Sundays must have had attendance for an attendance topper. */
export async function saveTopperSettings(input: unknown): Promise<ActionResult> {
  try {
    const user = await assertRole("headmaster");
    await toppers.saveTopperSettings(user, minPctSchema.parse(input));
    revalidateResults();
    return { ok: true, message: "Saved." };
  } catch (e) {
    return toActionError(e);
  }
}

/** Assign (confirm) the calculated toppers; the values are worked out again on the server. */
export async function confirmToppers(input: unknown): Promise<ActionResult<{ confirmed: number }>> {
  try {
    const user = await assertRole("headmaster");
    const { confirmed, names } = await toppers.confirmToppers(user, topperQuerySchema.parse(input));
    revalidateResults();
    revalidatePath("/admin");
    revalidatePath("/teacher");
    return { ok: true, data: { confirmed }, message: `Confirmed: ${names.join(", ")}.` };
  } catch (e) {
    return toActionError(e);
  }
}
