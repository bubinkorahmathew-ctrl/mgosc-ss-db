"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertRole } from "@/lib/auth";
import { uuid } from "@/lib/validation/common";
import { issueCertificatesSchema } from "@/lib/validation/certificates";
import * as certificates from "@/lib/repo/certificates";
import { toActionError, type ActionResult } from "@/lib/action-result";

function revalidateCerts() {
  revalidatePath("/admin/certificates");
  revalidatePath("/teacher/certificates");
}

export async function issueCertificates(input: unknown): Promise<ActionResult<{ ids: string[]; numbers: string[] }>> {
  try {
    const user = await assertRole("admin");
    const prepared = await certificates.prepareCertificates(user, issueCertificatesSchema.parse(input));
    if (!prepared.ok) return prepared;
    const inserted = await certificates.issueCertificates(user, prepared);
    revalidateCerts();
    for (const r of inserted) revalidatePath(`/admin/students/${r.student_id}`);
    const n = inserted.length;
    return {
      ok: true,
      data: { ids: inserted.map((r) => r.id), numbers: inserted.map((r) => r.certificate_no) },
      message: `${n} certificate${n === 1 ? "" : "s"} issued.`,
    };
  } catch (e) {
    return toActionError(e);
  }
}

const revokeSchema = z.object({ id: uuid, revoked: z.boolean() });

export async function setCertificateRevoked(input: unknown): Promise<ActionResult> {
  try {
    const user = await assertRole("admin");
    const { id, revoked } = revokeSchema.parse(input);
    await certificates.setCertificateRevoked(user, id, revoked);
    revalidateCerts();
    return { ok: true, message: revoked ? "Certificate revoked. Verification will now show it as not valid." : "Certificate restored." };
  } catch (e) {
    return toActionError(e);
  }
}
