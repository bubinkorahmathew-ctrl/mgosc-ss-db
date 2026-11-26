import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { getClassOptions } from "@/lib/repo/classes";
import { prayerUnitOptions } from "@/lib/repo/students";
import { EmptyState, PageHeader } from "@/components/page-header";
import { StudentForm } from "@/components/students/student-form";

export const metadata: Metadata = { title: "Add student" };

export default async function TeacherNewStudentPage({ searchParams }: PageProps<"/teacher/students/new">) {
  const user = await requireRole("teacher");
  const sp = await searchParams;
  // the policies return only the teacher's classes
  const [classes, prayerUnits] = await Promise.all([getClassOptions(user, { currentOnly: true }), prayerUnitOptions(user)]);
  if (!classes.length) {
    return <EmptyState title="No class in the current year is assigned to you.">Please ask an admin to assign your class.</EmptyState>;
  }
  const selected = classes.find((c) => c.id === sp.class) ?? classes[0];

  return (
    <>
      <PageHeader title="Add student" description="You can add students to your own classes. The admission number is generated automatically." />
      <StudentForm teacherClassId={selected.id} classes={classes.map((c) => ({ id: c.id, label: c.label }))}
        prayerUnits={prayerUnits} />
    </>
  );
}
