import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import Link from "next/link";
import { Plus } from "lucide-react";
import { getPrayerUnits, listStudents } from "@/lib/repo/students";
import { getClassOptions } from "@/lib/repo/classes";
import { studentFiltersSchema } from "@/lib/validation/student";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { StudentFilters } from "@/components/students/student-filters";
import { Pagination, StudentsTable } from "@/components/students/students-table";

export const metadata: Metadata = { title: "Students" };

export default async function StudentsPage({ searchParams }: PageProps<"/admin/students">) {
  const user = await requireRole("headmaster");
  const sp = await searchParams;
  const filters = studentFiltersSchema.parse(sp);
  const [result, classes, prayerUnits] = await Promise.all([listStudents(user, filters), getClassOptions(user), getPrayerUnits(user)]);

  return (
    <>
      <PageHeader title="Students"
        actions={
          <Button render={<Link href="/admin/students/new" />} nativeButton={false}><Plus /> Add student</Button>
        } />
      <StudentFilters prayerUnits={prayerUnits} classes={classes.map((c) => ({
        id: c.id, label: c.isCurrent ? c.label : `${c.label} (${c.yearName})`,
      }))} />
      <StudentsTable rows={result.rows} basePath="/admin/students" searchParams={sp} />
      <Pagination page={result.page} pageCount={result.pageCount} total={result.total}
        searchParams={sp} basePath="/admin/students" />
    </>
  );
}
