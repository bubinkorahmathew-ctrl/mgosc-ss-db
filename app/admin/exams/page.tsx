import type { Metadata } from "next";
import Link from "next/link";
import { FileText, PencilLine } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getAcademicYears } from "@/lib/data/classes";
import { classLabel } from "@/lib/format";
import { formatDate } from "@/lib/dates";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/page-header";
import { UrlSelect } from "@/components/form/url-select";
import { CreateExamDialog, DeleteExamButton, DeleteSubjectButton, EditExamDialog, SubjectDialog } from "./exam-dialogs";

export const metadata: Metadata = { title: "Subjects & Exams" };

export default async function ExamsPage({ searchParams }: PageProps<"/admin/exams">) {
  const sp = await searchParams;
  const years = await getAcademicYears();
  const year = years.find((y) => y.id === sp.year) ?? years.find((y) => y.is_current) ?? years[0];

  const supabase = await createClient();
  const [{ data: subjects }, { data: classes }, { data: exams }] = await Promise.all([
    supabase.from("subjects").select("id, name, max_marks, sort_order").order("sort_order").order("name"),
    year ? supabase.from("classes").select("id, name, section").eq("academic_year_id", year.id).order("name")
      : Promise.resolve({ data: [] as { id: string; name: string; section: string | null }[] }),
    year ? supabase.from("exams").select("id, name, exam_date, class_id, marks(count)").eq("academic_year_id", year.id)
      .order("exam_date", { ascending: false, nullsFirst: false }).order("name")
      : Promise.resolve({ data: [] as never[] }),
  ]);
  const classOpts = (classes ?? []).map((c) => ({ id: c.id, label: classLabel(c) }))
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
  const totalMax = (subjects ?? []).reduce((s, x) => s + Number(x.max_marks), 0);

  // group exams by name+date so "First Term" for all classes shows as one row
  const groups = new Map<string, { name: string; exam_date: string | null; items: { id: string; class_id: string; marks: number }[] }>();
  for (const e of exams ?? []) {
    const key = `${e.name.toLowerCase()}|${e.exam_date ?? ""}`;
    const g = groups.get(key) ?? { name: e.name, exam_date: e.exam_date, items: [] };
    g.items.push({ id: e.id, class_id: e.class_id, marks: (e.marks as unknown as { count: number }[])?.[0]?.count ?? 0 });
    groups.set(key, g);
  }
  const label = new Map(classOpts.map((c) => [c.id, c.label]));

  return (
    <>
      <PageHeader title="Subjects & Exams" description="Every exam uses all subjects. Teachers enter marks for their own classes." />

      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-2">
            <span>Subjects <span className="text-sm font-normal text-muted-foreground">· total {totalMax} marks</span></span>
            <SubjectDialog nextOrder={(subjects?.length ?? 0) + 1} />
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!subjects?.length ? <EmptyState title="No subjects yet.">Add the subjects that every exam will have.</EmptyState> : (
            <ul className="divide-y rounded-lg border">
              {subjects.map((s) => (
                <li key={s.id} className="flex items-center gap-2 px-3 py-2">
                  <span className="w-8 text-sm text-muted-foreground tabular-nums">{s.sort_order}</span>
                  <span className="flex-1 font-medium">{s.name}</span>
                  <span className="text-sm tabular-nums text-muted-foreground">max {Number(s.max_marks)}</span>
                  <SubjectDialog subject={{ id: s.id, name: s.name, max_marks: Number(s.max_marks), sort_order: s.sort_order }} />
                  <DeleteSubjectButton id={s.id} name={s.name} />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <h2 className="text-lg font-semibold">Exams</h2>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          {years.length > 0 && (
            <UrlSelect id="year" label="Academic year" param="year" value={year?.id} className="sm:w-56"
              options={years.map((y) => ({ value: y.id, label: y.name + (y.is_current ? " (current)" : "") }))} />
          )}
          {year && classOpts.length > 0 && <CreateExamDialog yearId={year.id} yearName={year.name} classes={classOpts} />}
        </div>
      </div>

      {!year ? <EmptyState title="No academic year yet.">Create one on the Classes page first.</EmptyState>
        : !classOpts.length ? <EmptyState title={`No classes in ${year.name}.`}>Add classes on the Classes page first.</EmptyState>
        : !groups.size ? <EmptyState title={`No exams in ${year.name} yet.`}>Use “New exam” to create one for all classes at once.</EmptyState>
        : (
          <div className="space-y-3">
            {[...groups.values()].map((g) => (
              <Card key={`${g.name}|${g.exam_date}`}>
                <CardHeader>
                  <CardTitle className="flex flex-wrap items-baseline gap-x-2">
                    {g.name}
                    <span className="text-sm font-normal text-muted-foreground">{g.exam_date ? formatDate(g.exam_date) : "No date"}</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="divide-y rounded-lg border">
                    {g.items.sort((a, b) => (label.get(a.class_id) ?? "").localeCompare(label.get(b.class_id) ?? "", undefined, { numeric: true }))
                      .map((e) => (
                        <li key={e.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                          <span className="min-w-28 flex-1 font-medium">{label.get(e.class_id)}</span>
                          <span className="text-sm text-muted-foreground">{e.marks ? `${e.marks} marks entered` : "No marks yet"}</span>
                          <div className="flex gap-1">
                            <Button variant="outline" size="sm" render={<Link href={`/admin/exams/${e.id}/marks`} />} nativeButton={false}>
                              <PencilLine /> Marks
                            </Button>
                            <Button variant="outline" size="sm" render={<Link href={`/admin/report-cards?class=${e.class_id}&exam=${e.id}&year=${year.id}`} />} nativeButton={false}>
                              <FileText /> Results
                            </Button>
                            <EditExamDialog exam={{ id: e.id, name: g.name, exam_date: g.exam_date ?? "" }} />
                            <DeleteExamButton id={e.id} name={`${g.name} (${label.get(e.class_id)})`} marks={e.marks} />
                          </div>
                        </li>
                      ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
    </>
  );
}
