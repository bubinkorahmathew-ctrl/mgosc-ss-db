import type { Metadata } from "next";
import { getClassOptions } from "@/lib/data/classes";
import { PageHeader } from "@/components/page-header";
import { StudentForm } from "@/components/students/student-form";

export const metadata: Metadata = { title: "Add student" };

export default async function NewStudentPage() {
  const classes = await getClassOptions({ currentOnly: true });
  return (
    <>
      <PageHeader title="Add student" description="The admission number is generated automatically." />
      <StudentForm classes={classes.map((c) => ({ id: c.id, label: c.label }))} />
    </>
  );
}
