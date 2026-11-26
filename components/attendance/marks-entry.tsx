import type { CurrentUser } from "@/lib/auth";
import { examEntry } from "@/lib/repo/teaching";
import { getClassStudents } from "@/lib/repo/teacher-context";
import { getGradeScale, getResultSubjects } from "@/lib/repo/results";
import { EmptyState } from "@/components/page-header";
import { MarksGrid } from "@/app/teacher/marks/marks-grid";
import { ExamAttendancePanel } from "./exam-attendance-panel";

/**
 * Marks entry for one exam, in two steps: who sat it, then the marks. Students marked absent
 * show AB with their inputs disabled. Used by teachers and admins (admins may clear a mark).
 */
export async function MarksEntry({ user, examId, classId, canClear = false }: {
  user: CurrentUser; examId: string; classId: string; canClear?: boolean;
}) {
  const [subjects, scale, students, { marks, examAttendance }] = await Promise.all([
    getResultSubjects(user),
    getGradeScale(user),
    getClassStudents(user, classId),
    examEntry(user, examId),
  ]);
  if (!subjects.length) return <EmptyState title="No subjects have been set up yet." />;
  if (!students.length) return <EmptyState title="There are no active students in this class." />;

  const initial: Record<string, Record<string, number | "AB">> = {};
  for (const m of marks ?? []) (initial[m.student_id] ??= {})[m.subject_id] = m.is_absent ? "AB" : Number(m.marks_obtained);
  const saved = Object.fromEntries(examAttendance.map((a) => [a.student_id, { status: a.status, remark: a.remark }]));
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
          <MarksGrid key={examId} examId={examId} canClear={canClear} initial={initial} scale={scale}
            examAbsent={examAttendance.filter((a) => a.status === "absent").map((a) => a.student_id)}
            subjects={subjects.map((s) => ({ id: s.id, name: s.name, max: s.max, passPercent: s.passPercent ?? 40 }))}
            students={students.map((s) => ({ id: s.id, name: s.full_name, nameMl: s.full_name_ml }))} />
        )}
      </section>
    </div>
  );
}
