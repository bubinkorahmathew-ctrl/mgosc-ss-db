import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getClassStudents, getTeacherClassContext } from "@/lib/data/teacher-context";
import { formatDate } from "@/lib/dates";
import { EmptyState, PageHeader } from "@/components/page-header";
import { ClassSwitcher } from "@/components/teacher/class-switcher";
import { ExamPicker } from "./exam-picker";
import { MarksGrid } from "./marks-grid";

export const metadata: Metadata = { title: "Marks" };

export default async function MarksPage({ searchParams }: PageProps<"/teacher/marks">) {
  const sp = await searchParams;
  const { classes, selected } = await getTeacherClassContext(sp.class);
  if (!selected) return <EmptyState title="No class is assigned to you yet." />;

  const supabase = await createClient();
  const [{ data: exams }, { data: subjects }] = await Promise.all([
    supabase.from("exams").select("id, name, exam_date").eq("class_id", selected.id)
      .order("exam_date", { ascending: false, nullsFirst: false }),
    supabase.from("subjects").select("id, name, max_marks, sort_order").order("sort_order").order("name"),
  ]);
  const exam = (exams ?? []).find((e) => e.id === sp.exam) ?? (exams ?? [])[0];

  let body: React.ReactNode;
  if (!exams?.length) {
    body = <EmptyState title="No exams for this class yet.">The headmaster creates exams. They will appear here.</EmptyState>;
  } else if (!subjects?.length) {
    body = <EmptyState title="No subjects have been set up yet." />;
  } else {
    const [students, { data: marks }] = await Promise.all([
      getClassStudents(selected.id),
      supabase.from("marks").select("student_id, subject_id, marks_obtained").eq("exam_id", exam!.id),
    ]);
    const initial: Record<string, Record<string, number>> = {};
    for (const m of marks ?? []) (initial[m.student_id] ??= {})[m.subject_id] = Number(m.marks_obtained);
    body = !students.length ? <EmptyState title="There are no active students in this class." /> : (
      <MarksGrid key={exam!.id} examId={exam!.id}
        subjects={subjects.map((s) => ({ id: s.id, name: s.name, max: Number(s.max_marks) }))}
        students={students.map((s) => ({ id: s.id, name: s.full_name, nameMl: s.full_name_ml }))}
        initial={initial} />
    );
  }

  return (
    <>
      <PageHeader title="Marks" description={selected.label} />
      <ClassSwitcher classes={classes} selectedId={selected.id} />
      {!!exams?.length && (
        <ExamPicker selectedId={exam!.id}
          exams={exams.map((e) => ({ id: e.id, label: e.exam_date ? `${e.name} (${formatDate(e.exam_date)})` : e.name }))} />
      )}
      {body}
    </>
  );
}
