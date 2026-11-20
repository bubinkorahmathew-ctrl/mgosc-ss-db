import type { Metadata } from "next";
import { listStudents } from "@/lib/data/students";
import { getTeacherClassContext } from "@/lib/data/teacher-context";
import { studentFiltersSchema } from "@/lib/validation/student";
import { EmptyState, PageHeader } from "@/components/page-header";
import { ClassSwitcher } from "@/components/teacher/class-switcher";
import { StudentFilters } from "@/components/students/student-filters";
import { Pagination, StudentsTable } from "@/components/students/students-table";

export const metadata: Metadata = { title: "Students" };

export default async function TeacherStudentsPage({ searchParams }: PageProps<"/teacher/students">) {
  const sp = await searchParams;
  const { classes, selected } = await getTeacherClassContext(sp.class);
  if (!selected) return <EmptyState title="No class is assigned to you yet." />;

  // class filter is forced to the selected (own) class; RLS also limits rows
  const filters = { ...studentFiltersSchema.parse(sp), class_id: selected.id };
  const result = await listStudents(filters);

  return (
    <>
      <PageHeader title="Students" description={selected.label} />
      <ClassSwitcher classes={classes} selectedId={selected.id} />
      <StudentFilters classes={[]} showClassFilter={false} />
      <StudentsTable rows={result.rows} basePath="/teacher/students" empty="No students in this class match." />
      <Pagination page={result.page} pageCount={result.pageCount} total={result.total}
        searchParams={sp} basePath="/teacher/students" />
    </>
  );
}
