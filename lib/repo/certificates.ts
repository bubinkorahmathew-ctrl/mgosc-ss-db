import "server-only";
import { UserError } from "@/lib/user-error";
import type { CertificateType } from "@/lib/db/types";
import { assertTeacherOfClass, queryAs, requireRole, type Viewer } from "./access";
import type { CertificateRow } from "@/lib/db/types";
import { fillTemplate, unfilledPlaceholders, PLACEHOLDER_HELP, type Placeholder } from "@/lib/certificates";
import { getExamResults, getGradeScale } from "@/lib/repo/results";
import { classLabel } from "@/lib/format";
import { gradeFor } from "@/lib/grades";
import { formatPercent, ordinal } from "@/lib/results";
import type { issueCertificatesSchema } from "@/lib/validation/certificates";
import type { z } from "zod";

type Issue = z.output<typeof issueCertificatesSchema>;

/** What the PDF needs of a certificate. Issued ones come from the stored snapshot. */
export type PdfCertificate = Pick<CertificateRow,
  "certificate_no" | "type" | "title" | "body_text" | "student_name" | "student_name_ml" | "class_name" | "year_name"
  | "issued_on" | "revoked" | "student_id" | "class_id" | "exam_id"> & { key: string; academic_year_id: string; topper_id?: string | null };

export const PDF_CERTIFICATE_COLUMNS =
  "id, certificate_no, type, title, body_text, student_name, student_name_ml, class_name, year_name, issued_on, revoked, student_id, class_id, exam_id, topper_id, academic_year_id";

/** A student's attendance % in a class over a period: (present + late) / days marked. */
async function attendanceShare(user: Viewer, studentId: string, classId: string, from: string, to: string): Promise<number | null> {
  const dbc = queryAs(user);
  const { data } = await dbc.from("attendance").select("status").eq("student_id", studentId)
    .eq("class_id", classId).gte("date", from).lte("date", to);
  if (!data?.length) return null;
  return Math.round((data.filter((r) => r.status !== "absent").length / data.length) * 100);
}

/**
 * The rows a certificate issue would insert, with the wording filled in per student. Used to
 * issue and, unsaved, to preview. Reads through the caller's policies.
 * Placeholders: {student_name} {class} {year} always; {exam} {rank} {grade} {percentage} from the
 * chosen exam or the topper; {attendance_percent} from the topper or the student's attendance.
 */
export async function prepareCertificates(user: Viewer, v: Issue): Promise<
  | { ok: true; rows: (Omit<PdfCertificate, "certificate_no" | "revoked" | "key"> & { activity_id: string | null; topper_id: string | null })[] }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> }
> {
  const dbc = queryAs(user);
  const { data: cls } = await dbc.from("classes")
    .select("id, name, section, academic_year_id, academic_years(name, start_date, end_date)").eq("id", v.class_id).maybeSingle();
  if (!cls?.academic_years) return { ok: false, error: "That class is not available to you." };

  const { data: students, error } = await dbc.from("students").select("id, full_name, full_name_ml").in("id", v.student_ids);
  if (error) throw error;
  if ((students ?? []).length !== v.student_ids.length) return { ok: false, error: "Some students are not available to you." };

  const scale = await getGradeScale(user);
  // per student: what {rank} {grade} {percentage} {attendance_percent} mean for this certificate
  const perStudent = new Map<string, Partial<Record<Placeholder, string>>>();
  let examText: string | undefined;
  let examId = v.exam_id;

  if (v.topper_id) {
    const { data: t } = await dbc.from("toppers").select("id, class_id, student_id, type, value, exam_id, period_start, period_end, exams(name)")
      .eq("id", v.topper_id).maybeSingle();
    const kind = v.type === "class_topper" ? "marks" : "attendance";
    if (!t || t.class_id !== v.class_id || t.student_id !== v.student_ids[0] || t.type !== kind) {
      return { ok: false, error: "That confirmed topper does not match this certificate." };
    }
    const value = Number(t.value);
    examId = t.exam_id;
    examText = t.type === "marks" ? (t.exams?.name ?? "the annual result") : undefined;
    perStudent.set(t.student_id, t.type === "marks"
      ? { rank: ordinal(1), percentage: formatPercent(value), grade: gradeFor(value, scale)?.grade }
      : { attendance_percent: `${Math.round(value * 100) / 100}%` });
  } else if (v.exam_id) {
    const results = await getExamResults(user, v.exam_id);
    if (!results || results.exam.class_id !== v.class_id) return { ok: false, error: "That exam is not for this class." };
    examText = results.exam.name;
    for (const r of results.results) {
      if (r.examAbsent) continue;
      perStudent.set(r.id, {
        rank: r.rank ? ordinal(r.rank) : undefined,
        percentage: r.percentage !== null ? formatPercent(r.percentage) : undefined,
        grade: r.grade ?? undefined,
      });
    }
  }
  if (v.activity_id) {
    const { data: act } = await dbc.from("activities").select("title, class_id").eq("id", v.activity_id).maybeSingle();
    if (!act || act.class_id !== v.class_id) return { ok: false, error: "That activity is not for this class." };
    examText = act.title;
  }

  const className = classLabel(cls);
  const yearName = cls.academic_years.name;
  const base = { class: className, year: yearName, exam: examText };
  const needsAttendance = !v.topper_id && v.template.includes("{attendance_percent}");
  const order = new Map(v.student_ids.map((id, i) => [id, i]));
  const rows = [];
  for (const s of [...students!].sort((a, b) => order.get(a.id)! - order.get(b.id)!)) {
    const vars: Partial<Record<Placeholder, string>> = { ...base, student_name: s.full_name, ...perStudent.get(s.id) };
    if (needsAttendance) {
      const share = await attendanceShare(user, s.id, v.class_id, cls.academic_years.start_date, cls.academic_years.end_date);
      if (share !== null) vars.attendance_percent = `${share}%`;
    }
    const missing = unfilledPlaceholders(v.template, vars);
    if (missing.length) {
      const m = missing[0];
      const why = (m === "rank" || m === "grade" || m === "percentage") && v.exam_id
        ? `${s.full_name} has no ${m} in this exam (no marks yet, or absent).`
        : m === "attendance_percent"
          ? `${s.full_name} has no attendance marked this year, so {attendance_percent} is empty.`
          : `The wording uses {${m}} (${PLACEHOLDER_HELP[m]}), but this certificate has none. Remove it or choose the ${m === "exam" ? "exam/activity" : "exam"}.`;
      return { ok: false, error: why, fieldErrors: { template: [why] } };
    }
    rows.push({
      student_id: s.id, class_id: v.class_id, type: v.type, title: v.title,
      body_text: fillTemplate(v.template, vars), exam_id: examId, activity_id: v.activity_id, topper_id: v.topper_id,
      issued_on: v.issued_on,
      // what the database snapshots on insert, so a preview matches the issued certificate
      student_name: s.full_name, student_name_ml: s.full_name_ml, class_name: className, year_name: yearName,
      academic_year_id: cls.academic_year_id,
    });
  }
  return { ok: true, rows };
}

/**
 * The facts row under the wording: Class and Academic Year always; Rank, Percentage and Grade when
 * the certificate is for an exam; the topper's percentage for a topper certificate; the student's
 * Attendance for attendance certificates. Read through the caller's policies.
 */
export async function certificateDetails(user: Viewer, certs: PdfCertificate[]): Promise<Map<string, { label: string; value: string }[]>> {
  const dbc = queryAs(user);
  const scale = await getGradeScale(user);
  const exams = [...new Set(certs.filter((c) => !c.topper_id).map((c) => c.exam_id).filter((e): e is string => !!e))];
  const results = new Map(await Promise.all(exams.map(async (id) => [id, await getExamResults(user, id)] as const)));
  const topperIds = [...new Set(certs.map((c) => c.topper_id).filter((t): t is string => !!t))];
  const { data: toppers } = topperIds.length
    ? await dbc.from("toppers").select("id, type, value").in("id", topperIds)
    : { data: [] as { id: string; type: "marks" | "attendance"; value: number }[] };

  const attendanceCerts = certs.filter((c) => c.type === "attendance" && !c.topper_id);
  const attendance = new Map<string, string>();
  if (attendanceCerts.length) {
    const yearIds = [...new Set(attendanceCerts.map((c) => c.academic_year_id))];
    const { data: years } = await dbc.from("academic_years").select("id, start_date, end_date").in("id", yearIds);
    for (const c of attendanceCerts) {
      const y = years?.find((x) => x.id === c.academic_year_id);
      if (!y || !c.class_id) continue;
      const share = await attendanceShare(user, c.student_id, c.class_id, y.start_date, y.end_date);
      if (share !== null) attendance.set(c.key, `${share}%`);
    }
  }

  return new Map(certs.map((c) => {
    const d = [{ label: "Class", value: c.class_name }, { label: "Academic Year", value: c.year_name }];
    const t = c.topper_id ? toppers?.find((x) => x.id === c.topper_id) : undefined;
    if (t?.type === "marks") {
      const value = Number(t.value);
      d.push({ label: "Percentage", value: `${value}%` });
      const g = gradeFor(value, scale)?.grade;
      if (g) d.push({ label: "Grade", value: g });
    } else if (t?.type === "attendance") {
      d.push({ label: "Attendance", value: `${Number(t.value)}%` });
    }
    const r = !t && c.exam_id ? results.get(c.exam_id)?.results.find((x) => x.id === c.student_id) : undefined;
    if (r && !r.examAbsent && r.grade) d.push({ label: "Grade", value: r.grade });
    if (r && !r.examAbsent && r.rank) d.push({ label: "Rank", value: String(r.rank) });
    if (r && !r.examAbsent && r.percentage !== null) d.push({ label: "Percentage", value: `${r.percentage}%` });
    const a = attendance.get(c.key);
    if (a) d.push({ label: "Attendance", value: a });
    return [c.key, d];
  }));
}

// ---------------------------------------------------------------------------
// Issuing, revoking and finding issued certificates
// ---------------------------------------------------------------------------

/**
 * Issues prepared certificates in one statement (one transaction): the database layer fills the
 * snapshot columns and assigns gap-free numbers. Admins only.
 */
export async function issueCertificates(user: Viewer, prepared: Extract<Awaited<ReturnType<typeof prepareCertificates>>, { ok: true }>) {
  requireRole(user, "admin");
  const insert = prepared.rows.map((r) => ({
    student_id: r.student_id, class_id: r.class_id, type: r.type, title: r.title, body_text: r.body_text,
    exam_id: r.exam_id, activity_id: r.activity_id, topper_id: r.topper_id, issued_on: r.issued_on, issued_by: user.id,
  }));
  const { data, error } = await queryAs(user).from("certificates").insert(insert).select("id, certificate_no, student_id");
  if (error) throw error;
  return data ?? [];
}

export async function setCertificateRevoked(user: Viewer, id: string, revoked: boolean): Promise<void> {
  requireRole(user, "admin");
  const { data, error } = await queryAs(user).from("certificates").update({ revoked }).eq("id", id).select("id");
  if (error) throw error;
  if (!data?.length) throw new UserError("Certificate not found.");
}

/** One issued certificate by number, ready for the PDF; null if missing or not visible. */
export async function certificateByNumber(user: Viewer, no: string) {
  const { data, error } = await queryAs(user).from("certificates").select(PDF_CERTIFICATE_COLUMNS).eq("certificate_no", no).maybeSingle();
  if (error) throw error;
  return data;
}

/** Certificates by id in the given order; null unless every one is visible (no silent partial batches). */
export async function certificatesByIds(user: Viewer, ids: string[]) {
  const { data, error } = await queryAs(user).from("certificates").select(PDF_CERTIFICATE_COLUMNS).in("id", ids);
  if (error) throw error;
  if (!data?.length || data.length !== new Set(ids).size) return null;
  const order = new Map(ids.map((id, i) => [id, i]));
  return data.sort((a, b) => order.get(a.id)! - order.get(b.id)!);
}

/** Every valid certificate of a type for a class, by student name (at most `limit`). Class teachers or admins. */
export async function classCertificates(user: Viewer, classId: string, type: CertificateType, limit: number) {
  await assertTeacherOfClass(user, classId);
  const { data, error } = await queryAs(user).from("certificates").select(PDF_CERTIFICATE_COLUMNS)
    .eq("class_id", classId).eq("type", type).eq("revoked", false)
    .order("student_name").order("certificate_no").limit(limit);
  if (error) throw error;
  return data ?? [];
}

/** The certificate list page, newest first. */
export async function listCertificates(
  user: Viewer, f: { classId?: string; type?: CertificateType | ""; q?: string; page: number; pageSize: number },
) {
  let query = queryAs(user).from("certificates")
    .select("id, certificate_no, type, title, student_name, class_name, year_name, issued_on, revoked", { count: "exact" })
    .order("created_at", { ascending: false });
  if (f.classId) query = query.eq("class_id", f.classId);
  if (f.type) query = query.eq("type", f.type);
  if (f.q) query = query.or([["student_name", "ilike", `%${f.q}%`], ["certificate_no", "ilike", `%${f.q}%`]]);
  const { data, count } = await query.range((f.page - 1) * f.pageSize, f.page * f.pageSize - 1);
  return { rows: data ?? [], count: count ?? 0 };
}
/** For the issue form: a confirmed topper (to issue a topper certificate), or null. */
export async function topperForCertificate(user: Viewer, topperId: string) {
  const { data } = await queryAs(user).from("toppers")
    .select("id, type, class_id, student_id, value, students(full_name), exams(name)").eq("id", topperId).maybeSingle();
  return data;
}

/** For the issue form: the class's name and its recent activities (not notes). */
export async function issueFormData(user: Viewer, classId: string) {
  const dbc = queryAs(user);
  const [{ data: activities }, { data: cls }] = await Promise.all([
    dbc.from("activities").select("id, title, activity_date, students(full_name)").eq("class_id", classId)
      .neq("type", "note").order("activity_date", { ascending: false }).limit(150),
    dbc.from("classes").select("name, section").eq("id", classId).maybeSingle(),
  ]);
  return { activities: activities ?? [], cls };
}