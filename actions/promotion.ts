"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { assertRole } from "@/lib/auth";
import { promotionSchema } from "@/lib/validation/academics";
import { toActionError, type ActionResult } from "@/lib/action-result";

/**
 * Move ticked students from one class to another (usually next year's class), or mark them
 * as passed out. Unticked students (held back) stay where they are.
 * Attendance, marks and certificates keep pointing at the old class, so history is preserved.
 */
export async function promoteStudents(input: unknown): Promise<ActionResult<{ moved: number }>> {
  try {
    await assertRole("headmaster");
    const { from_class_id, target, student_ids } = promotionSchema.parse(input);
    const supabase = await createClient();

    if (target !== "passed_out") {
      const { data: cls } = await supabase.from("classes").select("id").eq("id", target).maybeSingle();
      if (!cls) return { ok: false, error: "Target class not found." };
    }

    // only active students that are still in the source class are touched
    const base = supabase.from("students")
      .update(target === "passed_out" ? { status: "passed_out" as const } : { class_id: target });
    const { data, error } = await base.eq("class_id", from_class_id).eq("status", "active").in("id", student_ids).select("id");
    if (error) throw error;
    const moved = data?.length ?? 0;
    if (!moved) return { ok: false, error: "None of the selected students are active in that class any more." };

    for (const p of ["/admin/promotion", "/admin/students", "/admin/classes", "/admin"]) revalidatePath(p);
    const skipped = student_ids.length - moved;
    const verb = target === "passed_out" ? "marked as passed out" : "moved";
    return {
      ok: true, data: { moved },
      message: `${moved} student${moved === 1 ? "" : "s"} ${verb}.${skipped ? ` ${skipped} skipped (no longer in the class).` : ""}`,
    };
  } catch (e) {
    return toActionError(e);
  }
}
