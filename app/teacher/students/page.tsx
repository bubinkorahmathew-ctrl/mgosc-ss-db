import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import Link from "next/link";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getPrayerUnits, listStudents } from "@/lib/repo/students";
import { getTeacherClassContext } from "@/lib/repo/teacher-context";
import { studentFiltersSchema } from "@/lib/validation/student";
import { EmptyState, PageHeader } from "@/components/page-header";
import { ClassSwitcher } from "@/components/teacher/class-switcher";
import { StudentFilters } from "@/components/students/student-filters";
import { Pagination, StudentsTable } from "@/components/students/students-table";

export const metadata: Metadata = { title: "Students" };

export default async function TeacherStudentsPage({ searchParams }: PageProps<"/teacher/students">) {
  const user = await requireRole("teacher");
  const sp = await searchParams;
  const { classes, selected } = await getTeacherClassContext(user, sp.class);
  if (!selected) return <EmptyState title="No class is assigned to you yet." />;

  // class filter is forced to the selected (own) class; RLS also limits rows
  const filters = { ...studentFiltersSchema.parse(sp), class_id: selected.id };
  const [result, prayerUnits] = await Promise.all([listStudents(user, filters), getPrayerUnits(user)]);

  return (
    <>
      <PageHeader title="Students" description={selected.label}
        actions={selected.isCurrent && (
          <Button nativeButton={false} render={<Link href={`/teacher/students/new?class=${selected.id}`} />}>
            <UserPlus /> Add student
          </Button>
        )} />
      <ClassSwitcher classes={classes} selectedId={selected.id} />
      <StudentFilters classes={[]} prayerUnits={prayerUnits} showClassFilter={false} />
      <StudentsTable rows={result.rows} basePath="/teacher/students" searchParams={sp} empty="No students in this class match." />
      <Pagination page={result.page} pageCount={result.pageCount} total={result.total}
        searchParams={sp} basePath="/teacher/students" />
    </>
  );
}
