"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/db/server";
import { assertRole } from "@/lib/auth";
import { uuid } from "@/lib/validation/common";
import { issueCertificatesSchema } from "@/lib/validation/certificates";
import { prepareCertificates } from "@/lib/data/certificates";
import { toActionError, type ActionResult } from "@/lib/action-result";

function revalidateCerts() {
  revalidatePath("/admin/certificates");
  revalidatePath("/teacher/certificates");
}

export async function issueCertificates(input: unknown): Promise<ActionResult<{ ids: string[]; numbers: string[] }>> {
  try {
    const user = await assertRole("headmaster");
    const v = issueCertificatesSchema.parse(input);
    const prepared = await prepareCertificates(v);
    if (!prepared.ok) return prepared;

    // the snapshot columns (names, class, year) are filled by the database layer on insert
    const rows = prepared.rows.map((r) => ({
      student_id: r.student_id, class_id: r.class_id, type: r.type, title: r.title, body_text: r.body_text,
      exam_id: r.exam_id, activity_id: v.activity_id, issued_on: r.issued_on, issued_by: user.id,
    }));

    // one statement = one transaction: numbers are assigned by the database, gap-free
    const dbc = await createClient();
    const { data: inserted, error } = await dbc.from("certificates").insert(rows).select("id, certificate_no");
    if (error) throw error;
    revalidateCerts();
    for (const r of rows) revalidatePath(`/admin/students/${r.student_id}`);
    const n = inserted?.length ?? 0;
    return {
      ok: true,
      data: { ids: (inserted ?? []).map((r) => r.id), numbers: (inserted ?? []).map((r) => r.certificate_no) },
      message: `${n} certificate${n === 1 ? "" : "s"} issued.`,
    };
  } catch (e) {
    return toActionError(e);
  }
}

const revokeSchema = z.object({ id: uuid, revoked: z.boolean() });

export async function setCertificateRevoked(input: unknown): Promise<ActionResult> {
  try {
    await assertRole("headmaster");
    const { id, revoked } = revokeSchema.parse(input);
    const dbc = await createClient();
    const { data, error } = await dbc.from("certificates").update({ revoked }).eq("id", id).select("id");
    if (error) throw error;
    if (!data?.length) return { ok: false, error: "Certificate not found." };
    revalidateCerts();
    return { ok: true, message: revoked ? "Certificate revoked. Verification will now show it as not valid." : "Certificate restored." };
  } catch (e) {
    return toActionError(e);
  }
}
