import { createClient } from "@/lib/supabase/server";
import { getSettings } from "@/lib/data/settings";
import { getClassExams } from "@/lib/data/results";
import { getClassStudents } from "@/lib/data/teacher-context";
import { formatDate } from "@/lib/dates";
import { EmptyState } from "@/components/page-header";
import { IssueForm } from "./issue-form";

/** Loads everything the issue form needs for one class (RLS applies). */
export async function IssuePage({ classes, classId, listHref }: {
  classes: { id: string; label: string; yearName: string }[]; classId: string | undefined; listHref: string;
}) {
  const cls = classes.find((c) => c.id === classId) ?? classes[0];
  if (!cls) return <EmptyState title="No classes available." />;

  const supabase = await createClient();
  const [settings, students, exams, { data: activities }, { data: clsRow }] = await Promise.all([
    getSettings(),
    getClassStudents(cls.id),
    getClassExams(cls.id),
    supabase.from("activities").select("id, title, activity_date, students(full_name)").eq("class_id", cls.id)
      .neq("type", "note").order("activity_date", { ascending: false }).limit(150),
    supabase.from("classes").select("name, section").eq("id", cls.id).maybeSingle(),
  ]);

  return (
    <IssueForm key={cls.id}
      classes={classes.map((c) => ({ id: c.id, label: c.label }))}
      classId={cls.id}
      className={clsRow ? (clsRow.section ? `${clsRow.name} - ${clsRow.section}` : clsRow.name) : cls.label}
      yearName={cls.yearName}
      students={students.map((s) => ({ id: s.id, name: s.full_name, admissionNo: s.admission_no }))}
      exams={exams.map((e) => ({ id: e.id, title: e.name, label: e.exam_date ? `${e.name} (${formatDate(e.exam_date)})` : e.name }))}
      activities={(activities ?? []).map((a) => ({
        id: a.id, title: a.title,
        label: `${a.title} (${formatDate(a.activity_date)})${a.students ? ` · ${a.students.full_name}` : ""}`,
      }))}
      wording={settings.certificate_wording}
      listHref={listHref} />
  );
}
