import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/db/server";
import { classLabel } from "@/lib/format";
import { formatDate } from "@/lib/dates";
import { PageHeader } from "@/components/page-header";
import { MarksEntry } from "@/components/attendance/marks-entry";

export const metadata: Metadata = { title: "Enter marks" };

/** Admin view of exam attendance and the marks grid; unlike teachers, admins may clear a saved mark. */
export default async function AdminMarksPage({ params }: PageProps<"/admin/exams/[id]/marks">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const dbc = await createClient();
  const { data: exam } = await dbc.from("exams")
    .select("id, name, exam_date, class_id, academic_year_id, classes(name, section)").eq("id", id).maybeSingle();
  if (!exam || !exam.classes) notFound();

  return (
    <>
      <Link href={`/admin/exams?year=${exam.academic_year_id}`} className="mb-3 inline-flex min-h-11 items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Subjects & Exams
      </Link>
      <PageHeader title={`${exam.name} · ${classLabel(exam.classes)}`}
        description={`${exam.exam_date ? formatDate(exam.exam_date) + " · " : ""}Empty a saved box to delete that mark.`} />
      <MarksEntry examId={id} classId={exam.class_id} canClear />
    </>
  );
}
