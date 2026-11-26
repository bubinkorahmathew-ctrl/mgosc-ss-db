import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { classesPage } from "@/lib/repo/academics";
import { getAcademicYears } from "@/lib/repo/classes";
import { classLabel } from "@/lib/format";
import { formatDate } from "@/lib/dates";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/page-header";
import { AcademicYearBar, ClassDialog, DeleteClassButton } from "./class-dialogs";

export const metadata: Metadata = { title: "Classes" };

export default async function ClassesPage({ searchParams }: PageProps<"/admin/classes">) {
  const user = await requireRole("headmaster");
  const sp = await searchParams;
  const years = await getAcademicYears(user);
  const current = years.find((y) => y.is_current);
  const year = years.find((y) => y.id === sp.year) ?? current ?? years[0];

  const { classes, teachers, counts } = await classesPage(user, year?.id);
  const teacherOptions = teachers.map((t) => ({ id: t.id, label: t.full_name }));

  return (
    <>
      <PageHeader title="Classes" description="Sunday School classes for each academic year."
        actions={year && <ClassDialog yearId={year.id} teachers={teacherOptions} />} />

      <AcademicYearBar
        years={years.map((y) => ({ id: y.id, name: y.name, is_current: y.is_current,
          range: `${formatDate(y.start_date)} - ${formatDate(y.end_date)}` }))}
        selectedId={year?.id} />

      {!year ? (
        <EmptyState title="No academic year yet.">Create the first academic year above, then add classes.</EmptyState>
      ) : !classes.length ? (
        <EmptyState title={`No classes in ${year.name} yet.`}>Use “New class” to add one.</EmptyState>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {classes.map((c) => {
            const assigned = c.class_teachers ?? [];
            return (
              <Card key={c.id}>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between gap-2">
                    <span>{classLabel(c)}</span>
                    <span className="text-sm font-normal text-muted-foreground">{counts.get(c.id) ?? 0} students</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm">
                    {assigned.length
                      ? assigned.map((a) => a.profiles?.full_name).filter(Boolean).join(", ")
                      : <span className="text-amber-700">No teacher assigned</span>}
                  </p>
                  <div className="flex gap-2">
                    <ClassDialog yearId={year.id} teachers={teacherOptions}
                      cls={{ id: c.id, name: c.name, section: c.section ?? "", teacher_ids: assigned.map((a) => a.teacher_id) }} />
                    <DeleteClassButton classId={c.id} name={classLabel(c)} />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
