"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/db/server";
import { getDatabase } from "@/lib/db";
import { registrationAttempts } from "@/lib/db/system";
import { assertRole } from "@/lib/auth";
import { checkAndRecord, clientIp, hashIp } from "@/lib/rate-limit";
import {
  approveRegistrationSchema, registrationSchema, rejectRegistrationSchema,
} from "@/lib/validation/registration";
import { toActionError, type ActionResult } from "@/lib/action-result";

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
    const allowed = await checkAndRecord(registrationAttempts(getDatabase()), ipKey);
    if (!allowed) {
      return { ok: false, error: "Too many registrations from this device. Please try again in an hour." };
    }

    // Insert as the visitor: the policies allow INSERT only, and the rules force "pending".
    // No .select() afterwards - visitors may not read registrations back.
    const dbc = await createClient();
    const { error } = await dbc.from("registrations").insert(data);
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
    const dbc = await createClient();
    const { data, error } = await dbc.call((db) => db.approveRegistration(registration_id, class_id));
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
    const dbc = await createClient();
    const { data, error } = await dbc.from("registrations")
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
