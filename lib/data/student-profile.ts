import "server-only";
import { createClient } from "@/lib/db/server";

/** Everything shown on a student profile. RLS decides whether the caller may see it. */
export async function getStudentProfile(id: string) {
  const dbc = await createClient();
  const { data: student } = await dbc
    .from("students").select("*, classes(id, name, section, academic_years(name)), prayer_units(name)")
    .eq("id", id).maybeSingle();
  if (!student) return null;

  const [{ data: attendance }, { data: marks }, { data: activities }, { data: certificates }] = await Promise.all([
    dbc.from("attendance").select("date, status, remark").eq("student_id", id).order("date", { ascending: false }),
    dbc.from("marks")
      .select("marks_obtained, remarks, exams(id, name, exam_date), subjects(id, name, max_marks, sort_order)")
      .eq("student_id", id),
    dbc.from("activities").select("id, type, title, activity_date, score, notes")
      .or([
        ["student_id", "eq", id],
        { and: [["student_id", "is", null], ["class_id", "eq", student.class_id ?? "00000000-0000-0000-0000-000000000000"]] },
      ])
      .order("activity_date", { ascending: false }).limit(100),
    dbc.from("certificates").select("id, certificate_no, type, title, issued_on, revoked")
      .eq("student_id", id).order("issued_on", { ascending: false }),
  ]);

  const att = { present: 0, late: 0, absent: 0 };
  for (const a of attendance ?? []) att[a.status]++;
  const totalDays = att.present + att.late + att.absent;

  // group marks by exam
  type ExamGroup = {
    id: string; name: string; exam_date: string | null;
    subjects: { name: string; max: number; obtained: number; remarks: string | null; order: number }[];
  };
  const exams = new Map<string, ExamGroup>();
  for (const m of marks ?? []) {
    if (!m.exams || !m.subjects) continue;
    const g = exams.get(m.exams.id) ?? { id: m.exams.id, name: m.exams.name, exam_date: m.exams.exam_date, subjects: [] };
    g.subjects.push({
      name: m.subjects.name, max: Number(m.subjects.max_marks), obtained: Number(m.marks_obtained),
      remarks: m.remarks, order: m.subjects.sort_order,
    });
    exams.set(m.exams.id, g);
  }
  const examResults = [...exams.values()]
    .map((g) => {
      g.subjects.sort((a, b) => a.order - b.order);
      const total = g.subjects.reduce((s, x) => s + x.obtained, 0);
      const max = g.subjects.reduce((s, x) => s + x.max, 0);
      return { ...g, total, max };
    })
    .sort((a, b) => (b.exam_date ?? "").localeCompare(a.exam_date ?? ""));

  return {
    student,
    attendance: { ...att, totalDays, recent: (attendance ?? []).slice(0, 20), all: attendance ?? [] },
    examResults,
    activities: activities ?? [],
    certificates: certificates ?? [],
  };
}
export type StudentProfile = NonNullable<Awaited<ReturnType<typeof getStudentProfile>>>;
