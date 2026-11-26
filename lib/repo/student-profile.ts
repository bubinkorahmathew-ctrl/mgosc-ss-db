import "server-only";
import { queryAs, type Viewer } from "./access";
import { getExamResults, getGradeScale, getResultSubjects } from "@/lib/repo/results";
import { listConfirmedToppers } from "@/lib/repo/toppers";

/** Everything shown on a student profile. RLS decides whether the caller may see it. */
export async function getStudentProfile(user: Viewer, id: string) {
  const dbc = queryAs(user);
  const { data: student } = await dbc
    .from("students").select("*, classes(id, name, section, academic_years(name)), prayer_units(name)")
    .eq("id", id).maybeSingle();
  if (!student) return null;

  const [{ data: attendance }, { data: marks }, { data: activities }, { data: certificates }, { data: sat }, toppers] = await Promise.all([
    dbc.from("attendance").select("date, status, remark").eq("student_id", id).order("date", { ascending: false }),
    dbc.from("marks")
      .select("exam_id, subject_id, remarks")
      .eq("student_id", id),
    dbc.from("activities").select("id, type, title, activity_date, score, notes")
      .or([
        ["student_id", "eq", id],
        { and: [["student_id", "is", null], ["class_id", "eq", student.class_id ?? "00000000-0000-0000-0000-000000000000"]] },
      ])
      .order("activity_date", { ascending: false }).limit(100),
    dbc.from("certificates").select("id, certificate_no, type, title, issued_on, revoked")
      .eq("student_id", id).order("issued_on", { ascending: false }),
    dbc.from("exam_attendance").select("exam_id").eq("student_id", id),
    listConfirmedToppers(user, { studentId: id, limit: 50 }),
  ]);

  const att = { present: 0, late: 0, absent: 0 };
  for (const a of attendance ?? []) att[a.status]++;
  const totalDays = att.present + att.late + att.absent;

  // each exam the student sat or was marked for, with grade, result and rank in the class
  const examIds = [...new Set([...(marks ?? []).map((m) => m.exam_id), ...(sat ?? []).map((s) => s.exam_id)])];
  const remarks = new Map((marks ?? []).map((m) => [`${m.exam_id}:${m.subject_id}`, m.remarks]));
  const [scale, subjects] = await Promise.all([getGradeScale(user), getResultSubjects(user)]);
  const perExam = await Promise.all(examIds.map((e) => getExamResults(user, e, { scale, subjects })));
  const examResults = perExam.flatMap((r) => {
    const mine = r?.results.find((x) => x.id === id);
    if (!r || !mine) return [];
    return [{
      id: r.exam.id, name: r.exam.name, exam_date: r.exam.exam_date,
      total: mine.total, max: mine.max, percentage: mine.percentage, grade: mine.grade, result: mine.result,
      rank: mine.rank, ranked: r.results.filter((x) => x.rank !== null).length, examAbsent: mine.examAbsent,
      subjects: r.subjects.filter((s) => mine.marks[s.id] !== null).map((s) => ({
        name: s.name, max: s.max, obtained: mine.marks[s.id], grade: mine.subjectGrades[s.id],
        failed: mine.failedSubjects.includes(s.id), remarks: remarks.get(`${r.exam.id}:${s.id}`) ?? null,
      })),
    }];
  }).sort((a, b) => (b.exam_date ?? "").localeCompare(a.exam_date ?? ""));

  return {
    student,
    attendance: { ...att, totalDays, recent: (attendance ?? []).slice(0, 20), all: attendance ?? [] },
    examResults,
    activities: activities ?? [],
    certificates: certificates ?? [],
    toppers,
  };
}
export type StudentProfile = NonNullable<Awaited<ReturnType<typeof getStudentProfile>>>;
