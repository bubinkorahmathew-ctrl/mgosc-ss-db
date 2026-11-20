"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertRole } from "@/lib/auth";
import { checkAndRecord, clientIp, hashIp, type AttemptStore } from "@/lib/rate-limit";
import {
  approveRegistrationSchema, registrationSchema, rejectRegistrationSchema,
} from "@/lib/validation/registration";
import { toActionError, type ActionResult } from "@/lib/action-result";

function dbAttemptStore(): AttemptStore {
  const admin = createAdminClient();
  return {
    async count(key, since) {
      const { count, error } = await admin.from("registration_attempts")
        .select("id", { count: "exact", head: true })
        .eq("ip_hash", key).gte("created_at", since.toISOString());
      if (error) throw error;
      return count ?? 0;
    },
    async record(key) {
      const { error } = await admin.from("registration_attempts").insert({ ip_hash: key });
      if (error) throw error;
    },
    async purgeOlderThan(before) {
      await admin.from("registration_attempts").delete().lt("created_at", before.toISOString());
    },
  };
}

/** Public: submit a registration. */
export async function submitRegistration(input: unknown): Promise<ActionResult> {
  try {
    const parsed = registrationSchema.safeParse(input);
    if (!parsed.success) return toActionError(parsed.error);
    const { website, ...data } = parsed.data;

    // Honeypot: pretend success so bots learn nothing.
    if (website && website.trim() !== "") return { ok: true };

    const salt = process.env.RATE_LIMIT_SALT;
    if (!salt) throw new Error("RATE_LIMIT_SALT is not set");
    const ipKey = hashIp(clientIp(await headers()), salt);
    const allowed = await checkAndRecord(dbAttemptStore(), ipKey);
    if (!allowed) {
      return { ok: false, error: "Too many registrations from this device. Please try again in an hour." };
    }

    // Insert as the visitor (anon role): RLS allows INSERT only, and the trigger forces "pending".
    // No .select() afterwards - visitors may not read registrations back.
    const supabase = await createClient();
    const { error } = await supabase.from("registrations").insert(data);
    if (error) throw error;
    revalidatePath("/admin/registrations");
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}

/** Headmaster: approve -> creates the student with the next admission number (in one DB transaction). */
export async function approveRegistration(input: unknown): Promise<ActionResult<{ studentId: string }>> {
  try {
    await assertRole("headmaster");
    const { registration_id, class_id } = approveRegistrationSchema.parse(input);
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("approve_registration", {
      p_registration_id: registration_id, p_class_id: class_id,
    });
    if (error) {
      if (/already reviewed/.test(error.message)) return { ok: false, error: "This registration was already reviewed." };
      throw error;
    }
    revalidatePath("/admin/registrations");
    revalidatePath("/admin/students");
    revalidatePath("/admin");
    return { ok: true, data: { studentId: data }, message: "Student created." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function rejectRegistration(input: unknown): Promise<ActionResult> {
  try {
    const user = await assertRole("headmaster");
    const { registration_id, review_note } = rejectRegistrationSchema.parse(input);
    const supabase = await createClient();
    const { data, error } = await supabase.from("registrations")
      .update({ status: "rejected", review_note, reviewed_by: user.id, reviewed_at: new Date().toISOString() })
      .eq("id", registration_id).eq("status", "pending")
      .select("id");
    if (error) throw error;
    if (!data?.length) return { ok: false, error: "This registration was already reviewed." };
    revalidatePath("/admin/registrations");
    revalidatePath("/admin");
    return { ok: true, message: "Registration rejected." };
  } catch (e) {
    return toActionError(e);
  }
}
