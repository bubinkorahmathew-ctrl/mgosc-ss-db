import { createClient } from "@/lib/db/server";
import { getClassStudents } from "@/lib/data/teacher-context";
import { EmptyState } from "@/components/page-header";
import { MarksGrid } from "@/app/teacher/marks/marks-grid";
import { ExamAttendancePanel } from "./exam-attendance-panel";

/**
 * Marks entry for one exam, in two steps: who sat it, then the marks. Students marked absent
 * show AB with their inputs disabled. Used by teachers and admins (admins may clear a mark).
 */
export async function MarksEntry({ examId, classId, canClear = false }: { examId: string; classId: string; canClear?: boolean }) {
  const dbc = await createClient();
  const [{ data: subjects }, students, { data: marks }, { data: examAttendance }] = await Promise.all([
    dbc.from("subjects").select("id, name, max_marks").order("sort_order").order("name"),
    getClassStudents(classId),
    dbc.from("marks").select("student_id, subject_id, marks_obtained, is_absent").eq("exam_id", examId),
    dbc.from("exam_attendance").select("student_id, status, remark").eq("exam_id", examId),
  ]);
  if (!subjects?.length) return <EmptyState title="No subjects have been set up yet." />;
  if (!students.length) return <EmptyState title="There are no active students in this class." />;

  const initial: Record<string, Record<string, number | "AB">> = {};
  for (const m of marks ?? []) (initial[m.student_id] ??= {})[m.subject_id] = m.is_absent ? "AB" : Number(m.marks_obtained);
  const saved = Object.fromEntries((examAttendance ?? []).map((a) => [a.student_id, { status: a.status, remark: a.remark }]));
  const taken = students.some((s) => saved[s.id]);
  const sheetStudents = students.map((s) => ({ id: s.id, name: s.full_name, nameMl: s.full_name_ml, admissionNo: s.admission_no }));

  return (
    <div className="space-y-4">
      <ExamAttendancePanel key={`${examId}:${taken}`} examId={examId} students={sheetStudents} saved={saved} />
      <section aria-labelledby="marks-step" className="space-y-3">
        <h2 id="marks-step" className="font-medium">Step 2 · Marks</h2>
        {!taken ? (
          <EmptyState title="Mark exam attendance first.">Save step 1, then enter marks for the students who sat the exam.</EmptyState>
        ) : (
          <MarksGrid key={examId} examId={examId} canClear={canClear} initial={initial}
            examAbsent={(examAttendance ?? []).filter((a) => a.status === "absent").map((a) => a.student_id)}
            subjects={subjects.map((s) => ({ id: s.id, name: s.name, max: Number(s.max_marks) }))}
            students={students.map((s) => ({ id: s.id, name: s.full_name, nameMl: s.full_name_ml }))} />
        )}
      </section>
    </div>
  );
}
