import "server-only";
import { createClient } from "@/lib/db/server";
import type { CertificateRow } from "@/lib/db/types";
import { fillTemplate, unfilledPlaceholders, PLACEHOLDER_HELP, type Placeholder } from "@/lib/certificates";
import { getExamResults } from "@/lib/data/results";
import { classLabel } from "@/lib/format";
import { ordinal } from "@/lib/results";
import type { issueCertificatesSchema } from "@/lib/validation/certificates";
import type { z } from "zod";

type Issue = z.output<typeof issueCertificatesSchema>;

/** What the PDF needs of a certificate. Issued ones come from the stored snapshot. */
export type PdfCertificate = Pick<CertificateRow,
  "certificate_no" | "type" | "title" | "body_text" | "student_name" | "student_name_ml" | "class_name" | "year_name"
  | "issued_on" | "revoked" | "student_id" | "class_id" | "exam_id"> & { key: string; academic_year_id: string };

export const PDF_CERTIFICATE_COLUMNS =
  "id, certificate_no, type, title, body_text, student_name, student_name_ml, class_name, year_name, issued_on, revoked, student_id, class_id, exam_id, academic_year_id";

/**
 * The rows a certificate issue would insert, with the wording filled in per student. Used to
 * issue and, unsaved, to preview. Reads through the caller's policies.
 */
export async function prepareCertificates(v: Issue): Promise<
  | { ok: true; rows: Omit<PdfCertificate, "certificate_no" | "revoked" | "key">[] }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> }
> {
  const dbc = await createClient();
  const { data: cls } = await dbc.from("classes")
    .select("id, name, section, academic_year_id, academic_years(name)").eq("id", v.class_id).maybeSingle();
  if (!cls) return { ok: false, error: "That class is not available to you." };

  const { data: students, error } = await dbc.from("students").select("id, full_name, full_name_ml").in("id", v.student_ids);
  if (error) throw error;
  if ((students ?? []).length !== v.student_ids.length) return { ok: false, error: "Some students are not available to you." };

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
    const { data: act } = await dbc.from("activities").select("title, class_id").eq("id", v.activity_id).maybeSingle();
    if (!act || act.class_id !== v.class_id) return { ok: false, error: "That activity is not for this class." };
    examText = act.title;
  }

  const className = classLabel(cls);
  const yearName = cls.academic_years?.name ?? "";
  const base = { class: className, year: yearName, exam: examText };
  const order = new Map(v.student_ids.map((id, i) => [id, i]));
  const rows = [];
  for (const s of [...students!].sort((a, b) => order.get(a.id)! - order.get(b.id)!)) {
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
      issued_on: v.issued_on,
      // what the database snapshots on insert, so a preview matches the issued certificate
      student_name: s.full_name, student_name_ml: s.full_name_ml, class_name: className, year_name: yearName,
      academic_year_id: cls.academic_year_id,
    });
  }
  return { ok: true, rows };
}

/**
 * The facts row under the wording: Class and Academic Year always; Rank and Percentage when the
 * certificate is for an exam; the student's Attendance for attendance certificates. (Grade will
 * join once grades exist.) Read through the caller's policies.
 */
export async function certificateDetails(certs: PdfCertificate[]): Promise<Map<string, { label: string; value: string }[]>> {
  const dbc = await createClient();
  const exams = [...new Set(certs.map((c) => c.exam_id).filter((e): e is string => !!e))];
  const results = new Map(await Promise.all(exams.map(async (id) => [id, await getExamResults(id)] as const)));

  const attendanceCerts = certs.filter((c) => c.type === "attendance" || (c.type as string) === "attendance_topper");
  const attendance = new Map<string, string>();
  if (attendanceCerts.length) {
    const yearIds = [...new Set(attendanceCerts.map((c) => c.academic_year_id))];
    const { data: years } = await dbc.from("academic_years").select("id, start_date, end_date").in("id", yearIds);
    for (const c of attendanceCerts) {
      const y = years?.find((x) => x.id === c.academic_year_id);
      if (!y || !c.class_id) continue;
      const { data: rows } = await dbc.from("attendance").select("status").eq("student_id", c.student_id)
        .eq("class_id", c.class_id).gte("date", y.start_date).lte("date", y.end_date);
      if (rows?.length) {
        const attended = rows.filter((r) => r.status !== "absent").length;
        attendance.set(c.key, `${Math.round((attended / rows.length) * 100)}%`);
      }
    }
  }

  return new Map(certs.map((c) => {
    const d = [{ label: "Class", value: c.class_name }, { label: "Academic Year", value: c.year_name }];
    const r = c.exam_id ? results.get(c.exam_id)?.results.find((x) => x.id === c.student_id) : undefined;
    if (r && !r.examAbsent && r.rank) d.push({ label: "Rank", value: String(r.rank) });
    if (r && !r.examAbsent && r.percentage !== null) d.push({ label: "Percentage", value: `${r.percentage}%` });
    const a = attendance.get(c.key);
    if (a) d.push({ label: "Attendance", value: a });
    return [c.key, d];
  }));
}
