import type { Metadata } from "next";
import { createClient } from "@/lib/db/server";
import { getTeacherClassContext } from "@/lib/data/teacher-context";
import { formatDate } from "@/lib/dates";
import { EmptyState, PageHeader } from "@/components/page-header";
import { ClassSwitcher } from "@/components/teacher/class-switcher";
import { MarksEntry } from "@/components/attendance/marks-entry";
import { ExamPicker } from "./exam-picker";

export const metadata: Metadata = { title: "Marks" };

export default async function MarksPage({ searchParams }: PageProps<"/teacher/marks">) {
  const sp = await searchParams;
  const { classes, selected } = await getTeacherClassContext(sp.class);
  if (!selected) return <EmptyState title="No class is assigned to you yet." />;

  const dbc = await createClient();
  const [{ data: exams }, { data: subjects }] = await Promise.all([
    dbc.from("exams").select("id, name, exam_date").eq("class_id", selected.id)
      .order("exam_date", { ascending: false, nullsFirst: false }),
    dbc.from("subjects").select("id, name, max_marks, sort_order").order("sort_order").order("name"),
  ]);
  const exam = (exams ?? []).find((e) => e.id === sp.exam) ?? (exams ?? [])[0];

  let body: React.ReactNode;
  if (!exams?.length) {
    body = <EmptyState title="No exams for this class yet.">The headmaster creates exams. They will appear here.</EmptyState>;
  } else if (!subjects?.length) {
    body = <EmptyState title="No subjects have been set up yet." />;
  } else {
    body = <MarksEntry key={exam!.id} examId={exam!.id} classId={selected.id} />;
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
