"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { notifyAdminsOfRegistration, notifyTeachersOfNewStudent } from "@/lib/email/notifications";
import { assertRole } from "@/lib/auth";
import { requestClient } from "@/lib/authn/request";
import * as registrations from "@/lib/repo/registrations";
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

    if (!(await registrations.submitRegistration(data, await requestClient()))) {
      return { ok: false, error: "Too many registrations from this device. Please try again in an hour." };
    }
    // emailed after the response; a failed email never undoes the registration
    after(() => notifyAdminsOfRegistration({ ...data, id: null }));
    revalidatePath("/admin/registrations");
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}

/** Admin: approve -> creates the student with the next admission number (in one DB transaction). */
export async function approveRegistration(input: unknown): Promise<ActionResult<{ studentId: string }>> {
  try {
    const user = await assertRole("admin");
    const studentId = await registrations.approveRegistration(user, approveRegistrationSchema.parse(input));
    after(() => notifyTeachersOfNewStudent(studentId, user.id));
    revalidatePath("/admin/registrations");
    revalidatePath("/admin/students");
    revalidatePath("/admin");
    return { ok: true, data: { studentId }, message: "Student created." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function rejectRegistration(input: unknown): Promise<ActionResult> {
  try {
    const user = await assertRole("admin");
    await registrations.rejectRegistration(user, rejectRegistrationSchema.parse(input));
    revalidatePath("/admin/registrations");
    revalidatePath("/admin");
    return { ok: true, message: "Registration rejected." };
  } catch (e) {
    return toActionError(e);
  }
}
