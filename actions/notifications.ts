"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertRole } from "@/lib/auth";
import { setEmailNotifications } from "@/lib/repo/notify";
import { toActionError, type ActionResult } from "@/lib/action-result";

/** The signed-in person's own choice: notification emails on or off. */
export async function setMyEmailNotifications(input: unknown): Promise<ActionResult> {
  try {
    const user = await assertRole("admin", "teacher");
    const { on } = z.object({ on: z.boolean() }).parse(input);
    await setEmailNotifications(user, on);
    revalidatePath("/admin/account");
    revalidatePath("/teacher/account");
    return { ok: true, message: on ? "You'll get notification emails." : "Notification emails switched off." };
  } catch (e) {
    return toActionError(e);
  }
}
