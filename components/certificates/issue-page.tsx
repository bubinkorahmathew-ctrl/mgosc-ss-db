import type { CurrentUser } from "@/lib/auth";
import { issueFormData, topperForCertificate } from "@/lib/repo/certificates";
import { getSettings } from "@/lib/repo/settings";
import { getClassExams } from "@/lib/repo/results";
import { getClassStudents } from "@/lib/repo/teacher-context";
import { formatDate } from "@/lib/dates";
import { EmptyState } from "@/components/page-header";
import { IssueForm, type TopperPick } from "./issue-form";
import { getGradeScale } from "@/lib/repo/results";
import { gradeFor } from "@/lib/grades";

/** Loads everything the issue form needs for one class (RLS applies). `topperId`: issue for that confirmed topper. */
export async function IssuePage({ user, classes, classId, listHref, topperId }: {
  user: CurrentUser; classes: { id: string; label: string; yearName: string }[]; classId: string | undefined; listHref: string; topperId?: string;
}) {
  let topper: TopperPick | undefined;
  let chosenClass = classId;
  if (topperId && /^[0-9a-f-]{36}$/i.test(topperId)) {
    const t = await topperForCertificate(user, topperId);
    if (t) {
      const value = Number(t.value);
      topper = {
        id: t.id, type: t.type === "marks" ? "class_topper" : "attendance_topper", studentId: t.student_id,
        studentName: t.students?.full_name ?? "", what: t.type === "marks" ? t.exams?.name ?? "Annual result" : "Attendance",
        value, grade: t.type === "marks" ? gradeFor(value, await getGradeScale(user))?.grade ?? null : null,
      };
      chosenClass = t.class_id;
    }
  }
  const cls = classes.find((c) => c.id === chosenClass) ?? classes[0];
  if (!cls) return <EmptyState title="No classes available." />;

  const [settings, students, exams, { activities, cls: clsRow }] = await Promise.all([
    getSettings(user),
    getClassStudents(user, cls.id),
    getClassExams(user, cls.id),
    issueFormData(user, cls.id),
  ]);

  return (
    <IssueForm key={`${cls.id}:${topper?.id ?? ""}`} topper={topper}
      classes={classes.map((c) => ({ id: c.id, label: c.label }))}
      classId={cls.id}
      className={clsRow ? (clsRow.section ? `${clsRow.name} - ${clsRow.section}` : clsRow.name) : cls.label}
      yearName={cls.yearName}
      students={students.map((s) => ({ id: s.id, name: s.full_name, admissionNo: s.admission_no }))}
      exams={exams.map((e) => ({ id: e.id, title: e.name, label: e.exam_date ? `${e.name} (${formatDate(e.exam_date)})` : e.name }))}
      activities={activities.map((a) => ({
        id: a.id, title: a.title,
        label: `${a.title} (${formatDate(a.activity_date)})${a.students ? ` · ${a.students.full_name}` : ""}`,
      }))}
      wording={settings.certificate_wording}
      listHref={listHref} />
  );
}
