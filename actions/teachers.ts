"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertRole } from "@/lib/auth";
import { generateTempPassword } from "@/lib/password";
import { createTeacherSchema, teacherIdSchema, updateTeacherSchema } from "@/lib/validation/staff";
import { toActionError, type ActionResult } from "@/lib/action-result";

const BAN_FOREVER = "876000h"; // ~100 years

function revalidateTeachers() {
  revalidatePath("/admin/teachers");
  revalidatePath("/admin/classes");
}

/**
 * Sync the teacher's assignments for the CURRENT academic year only
 * (the form only shows current classes; past-year assignments are history and are kept).
 */
async function syncTeacherClasses(teacherId: string, classIds: string[]) {
  const supabase = await createClient();
  const { data: currentClasses, error: cErr } = await supabase
    .from("classes").select("id, academic_years!inner(is_current)").eq("academic_years.is_current", true);
  if (cErr) throw cErr;
  const currentIds = new Set((currentClasses ?? []).map((c) => c.id));
  if (classIds.some((id) => !currentIds.has(id))) throw new Error("not allowed: class is not in the current year");

  const { data: existing, error } = await supabase.from("class_teachers").select("class_id").eq("teacher_id", teacherId);
  if (error) throw error;
  const have = new Set((existing ?? []).map((r) => r.class_id).filter((id) => currentIds.has(id)));
  const want = new Set(classIds);
  const remove = [...have].filter((c) => !want.has(c));
  const add = [...want].filter((c) => !have.has(c));
  if (remove.length) {
    const { error: e } = await supabase.from("class_teachers").delete().eq("teacher_id", teacherId).in("class_id", remove);
    if (e) throw e;
  }
  if (add.length) {
    const { error: e } = await supabase.from("class_teachers").insert(add.map((c) => ({ class_id: c, teacher_id: teacherId })));
    if (e) throw e;
  }
}

/** Load the target and make sure it is a teacher (never the headmaster). */
async function loadTeacher(id: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("id, role, full_name").eq("id", id).maybeSingle();
  if (!data || data.role !== "teacher") throw new Error("not allowed: not a teacher");
  return data;
}

export async function createTeacher(input: unknown): Promise<ActionResult<{ email: string; password: string }>> {
  try {
    await assertRole("headmaster");
    const { full_name, email, phone, class_ids } = createTeacherSchema.parse(input);
    const admin = createAdminClient();
    const password = generateTempPassword();

    const { data: created, error } = await admin.auth.admin.createUser({
      email, password, email_confirm: true,
      app_metadata: { role: "teacher" },
      user_metadata: { full_name },
    });
    if (error || !created.user) {
      if (/already|registered|exists/i.test(error?.message ?? "")) {
        return { ok: false, error: "A user with this email already exists." };
      }
      throw error ?? new Error("createUser failed");
    }

    // Profile + classes as the headmaster (RLS). Roll back the auth user if this fails.
    const supabase = await createClient();
    const { error: pErr } = await supabase.from("profiles")
      .insert({ id: created.user.id, full_name, phone, role: "teacher" });
    if (pErr) {
      await admin.auth.admin.deleteUser(created.user.id);
      throw pErr;
    }
    await syncTeacherClasses(created.user.id, class_ids);

    revalidateTeachers();
    return { ok: true, data: { email, password }, message: "Teacher account created." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function updateTeacher(input: unknown): Promise<ActionResult> {
  try {
    await assertRole("headmaster");
    const { id, full_name, phone, class_ids } = updateTeacherSchema.parse(input);
    await loadTeacher(id);
    const supabase = await createClient();
    const { error } = await supabase.from("profiles").update({ full_name, phone }).eq("id", id);
    if (error) throw error;
    await syncTeacherClasses(id, class_ids);
    revalidateTeachers();
    return { ok: true, message: "Teacher updated." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function setTeacherActive(input: unknown, active: boolean): Promise<ActionResult> {
  try {
    await assertRole("headmaster");
    const { id } = teacherIdSchema.parse(input);
    await loadTeacher(id);
    const supabase = await createClient();
    const { error } = await supabase.from("profiles").update({ active: !!active }).eq("id", id);
    if (error) throw error;
    // Ban/unban in Auth so existing sessions cannot refresh and new sign-ins fail.
    const { error: aErr } = await createAdminClient().auth.admin.updateUserById(id, {
      ban_duration: active ? "none" : BAN_FOREVER,
    });
    if (aErr) throw aErr;
    revalidateTeachers();
    return { ok: true, message: active ? "Teacher re-activated." : "Teacher deactivated." };
  } catch (e) {
    return toActionError(e);
  }
}

/** Sets a new temporary password and returns it once, for the headmaster to share. */
export async function resetTeacherPassword(input: unknown): Promise<ActionResult<{ password: string }>> {
  try {
    await assertRole("headmaster");
    const { id } = teacherIdSchema.parse(input);
    await loadTeacher(id);
    const password = generateTempPassword();
    const { error } = await createAdminClient().auth.admin.updateUserById(id, { password });
    if (error) throw error;
    return { ok: true, data: { password }, message: "New temporary password set." };
  } catch (e) {
    return toActionError(e);
  }
}
