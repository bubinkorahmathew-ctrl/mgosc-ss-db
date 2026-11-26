import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { getClassOptions } from "@/lib/repo/classes";
import { prayerUnitOptions } from "@/lib/repo/students";
import { PageHeader } from "@/components/page-header";
import { StudentForm } from "@/components/students/student-form";

export const metadata: Metadata = { title: "Add student" };

export default async function NewStudentPage() {
  const user = await requireRole("headmaster");
  const [classes, prayerUnits] = await Promise.all([getClassOptions(user, { currentOnly: true }), prayerUnitOptions(user)]);
  return (
    <>
      <PageHeader title="Add student" description="The admission number is generated automatically." />
      <StudentForm classes={classes.map((c) => ({ id: c.id, label: c.label }))} prayerUnits={prayerUnits} />
    </>
  );
}
