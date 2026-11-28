"use server";

import { revalidatePath } from "next/cache";
import { assertRole } from "@/lib/auth";
import { promotionSchema } from "@/lib/validation/academics";
import { promoteStudents as promote } from "@/lib/repo/students";
import { toActionError, type ActionResult } from "@/lib/action-result";

/**
 * Move ticked students from one class to another (usually next year's class), or mark them
 * as passed out. Unticked students (held back) stay where they are.
 */
export async function promoteStudents(input: unknown): Promise<ActionResult<{ moved: number }>> {
  try {
    const user = await assertRole("admin");
    const data = promotionSchema.parse(input);
    const moved = await promote(user, data);
    for (const p of ["/admin/promotion", "/admin/students", "/admin/classes", "/admin"]) revalidatePath(p);
    const skipped = data.student_ids.length - moved;
    const verb = data.target === "passed_out" ? "marked as passed out" : "moved";
    return {
      ok: true, data: { moved },
      message: `${moved} student${moved === 1 ? "" : "s"} ${verb}.${skipped ? ` ${skipped} skipped (no longer in the class).` : ""}`,
    };
  } catch (e) {
    return toActionError(e);
  }
}
