import "server-only";
/** The public registration form and the admins' review of it. */
import type { z } from "zod";
import { UserError } from "@/lib/user-error";
import type { RegistrationStatus } from "@/lib/db/types";
import type { approveRegistrationSchema, registrationSchema, rejectRegistrationSchema } from "@/lib/validation/registration";
import { queryAs, requireRole, type Viewer } from "./access";
import { takeRateLimit } from "./rate-limits";

type Registration = Omit<z.output<typeof registrationSchema>, "website">;

/**
 * Public (no user). Returns false when this device is over the limit. Inserted as a visitor:
 * the policies allow INSERT only and the rules force "pending"; nothing is read back.
 */
export async function submitRegistration(data: Registration, client: { device: string; secret: string }): Promise<boolean> {
  if (!(await takeRateLimit("registration", client.device, client.secret))) return false;
  const { error } = await queryAs(null).from("registrations").insert(data);
  if (error) throw error;
  return true;
}

/** Creates the student with the next admission number and marks the registration approved, in one transaction. */
export async function approveRegistration(user: Viewer, input: z.output<typeof approveRegistrationSchema>): Promise<string> {
  requireRole(user, "admin");
  const { data, error } = await queryAs(user).call((db) => db.approveRegistration(input.registration_id, input.class_id));
  if (error) {
    if (/already reviewed/.test(error.message)) throw new UserError("This registration was already reviewed.");
    throw error;
  }
  return data;
}

export async function rejectRegistration(user: Viewer, input: z.output<typeof rejectRegistrationSchema>): Promise<void> {
  requireRole(user, "admin");
  const { data, error } = await queryAs(user).from("registrations")
    .update({ status: "rejected", review_note: input.review_note, reviewed_by: user.id, reviewed_at: new Date().toISOString() })
    .eq("id", input.registration_id).eq("status", "pending")
    .select("id");
  if (error) throw error;
  if (!data?.length) throw new UserError("This registration was already reviewed.");
}

export async function listRegistrations(user: Viewer, status: RegistrationStatus) {
  const { data } = await queryAs(user).from("registrations")
    .select("id, full_name, full_name_ml, dob, school_class, guardian_phone, status, submitted_at")
    .eq("status", status).order("submitted_at", { ascending: status === "pending" }).limit(200);
  return data ?? [];
}

export async function getRegistration(user: Viewer, id: string) {
  const { data } = await queryAs(user).from("registrations")
    .select("*, reviewer:profiles!registrations_reviewed_by_fkey(full_name), prayer_units(name)").eq("id", id).maybeSingle();
  return data;
}
