import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getClassStudents } from "@/lib/data/teacher-context";
import { classLabel } from "@/lib/format";
import { formatDate } from "@/lib/dates";
import { EmptyState, PageHeader } from "@/components/page-header";
import { MarksGrid } from "@/app/teacher/marks/marks-grid";

export const metadata: Metadata = { title: "Enter marks" };

/** Headmaster view of the marks grid; unlike teachers, the headmaster may clear a saved mark. */
export default async function AdminMarksPage({ params }: PageProps<"/admin/exams/[id]/marks">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const { data: exam } = await supabase.from("exams")
    .select("id, name, exam_date, class_id, academic_year_id, classes(name, section)").eq("id", id).maybeSingle();
  if (!exam || !exam.classes) notFound();

  const [{ data: subjects }, students, { data: marks }] = await Promise.all([
    supabase.from("subjects").select("id, name, max_marks").order("sort_order").order("name"),
    getClassStudents(exam.class_id),
    supabase.from("marks").select("student_id, subject_id, marks_obtained").eq("exam_id", id),
  ]);
  const initial: Record<string, Record<string, number>> = {};
  for (const m of marks ?? []) (initial[m.student_id] ??= {})[m.subject_id] = Number(m.marks_obtained);

  return (
    <>
      <Link href={`/admin/exams?year=${exam.academic_year_id}`} className="mb-3 inline-flex min-h-11 items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Subjects & Exams
      </Link>
      <PageHeader title={`${exam.name} · ${classLabel(exam.classes)}`}
        description={`${exam.exam_date ? formatDate(exam.exam_date) + " · " : ""}Empty a saved box to delete that mark.`} />
      {!subjects?.length ? <EmptyState title="No subjects have been set up yet." />
        : !students.length ? <EmptyState title="There are no active students in this class." />
        : <MarksGrid examId={id} canClear
            subjects={subjects.map((s) => ({ id: s.id, name: s.name, max: Number(s.max_marks) }))}
            students={students.map((s) => ({ id: s.id, name: s.full_name, nameMl: s.full_name_ml }))}
            initial={initial} />}
    </>
  );
}
