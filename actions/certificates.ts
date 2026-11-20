"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { assertClassAccess, assertRole, AuthError } from "@/lib/auth";
import { uuid } from "@/lib/validation/common";
import { issueCertificatesSchema } from "@/lib/validation/certificates";
import { fillTemplate, unfilledPlaceholders, PLACEHOLDER_HELP, type Placeholder } from "@/lib/certificates";
import { getExamResults } from "@/lib/data/results";
import { classLabel } from "@/lib/format";
import { ordinal } from "@/lib/results";
import { toActionError, type ActionResult } from "@/lib/action-result";

function revalidateCerts() {
  revalidatePath("/admin/certificates");
  revalidatePath("/teacher/certificates");
}

export async function issueCertificates(input: unknown): Promise<ActionResult<{ ids: string[] }>> {
  try {
    const user = await assertRole("teacher", "headmaster");
    const v = issueCertificatesSchema.parse(input);
    await assertClassAccess(user, v.class_id);
    const supabase = await createClient();

    const { data: cls } = await supabase.from("classes")
      .select("id, name, section, academic_years(name)").eq("id", v.class_id).maybeSingle();
    if (!cls) throw new AuthError("That class is not available to you.");

    const { data: students, error: sErr } = await supabase.from("students")
      .select("id, full_name, class_id").in("id", v.student_ids);
    if (sErr) throw sErr;
    if ((students ?? []).length !== v.student_ids.length) throw new AuthError("Some students are not available to you.");
    if (user.profile.role !== "headmaster" && students!.some((s) => s.class_id !== v.class_id)) {
      throw new AuthError("Some students are not in this class.");
    }

    // what {exam} and {rank} mean for this certificate
    let examText: string | undefined;
    let ranks = new Map<string, number | null>();
    if (v.exam_id) {
      const results = await getExamResults(v.exam_id);
      if (!results || results.exam.class_id !== v.class_id) return { ok: false, error: "That exam is not for this class." };
      examText = results.exam.name;
      ranks = new Map(results.results.map((r) => [r.id, r.rank]));
    }
    if (v.activity_id) {
      const { data: act } = await supabase.from("activities").select("title, class_id").eq("id", v.activity_id).maybeSingle();
      if (!act || act.class_id !== v.class_id) return { ok: false, error: "That activity is not for this class." };
      examText = act.title;
    }

    const base = { class: classLabel(cls), year: cls.academic_years?.name ?? "", exam: examText };
    const rows = [];
    for (const s of students!) {
      const rank = ranks.get(s.id);
      const vars: Partial<Record<Placeholder, string>> = { ...base, student_name: s.full_name, rank: rank ? ordinal(rank) : undefined };
      const missing = unfilledPlaceholders(v.template, vars);
      if (missing.length) {
        const why = missing.includes("rank") && v.exam_id
          ? `${s.full_name} has no marks in this exam, so there is no rank.`
          : `The wording uses {${missing[0]}} (${PLACEHOLDER_HELP[missing[0]]}), but this certificate has none. Remove it or choose the ${missing[0] === "rank" ? "exam" : "exam/activity"}.`;
        return { ok: false, error: why, fieldErrors: { template: [why] } };
      }
      rows.push({
        student_id: s.id, class_id: v.class_id, type: v.type, title: v.title,
        body_text: fillTemplate(v.template, vars), exam_id: v.exam_id, activity_id: v.activity_id,
        issued_on: v.issued_on, issued_by: user.id,
      });
    }

    // one statement = one transaction: numbers are assigned by the database, gap-free
    const { data: inserted, error } = await supabase.from("certificates").insert(rows).select("id");
    if (error) throw error;
    revalidateCerts();
    for (const s of students!) revalidatePath(`/admin/students/${s.id}`);
    const n = inserted?.length ?? 0;
    return { ok: true, data: { ids: (inserted ?? []).map((r) => r.id) }, message: `${n} certificate${n === 1 ? "" : "s"} issued.` };
  } catch (e) {
    return toActionError(e);
  }
}

const revokeSchema = z.object({ id: uuid, revoked: z.boolean() });

export async function setCertificateRevoked(input: unknown): Promise<ActionResult> {
  try {
    await assertRole("headmaster");
    const { id, revoked } = revokeSchema.parse(input);
    const supabase = await createClient();
    const { data, error } = await supabase.from("certificates").update({ revoked }).eq("id", id).select("id");
    if (error) throw error;
    if (!data?.length) return { ok: false, error: "Certificate not found." };
    revalidateCerts();
    return { ok: true, message: revoked ? "Certificate revoked. Verification will now show it as not valid." : "Certificate restored." };
  } catch (e) {
    return toActionError(e);
  }
}
