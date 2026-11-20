import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getClassOptions } from "@/lib/data/classes";
import { PageHeader } from "@/components/page-header";
import { StudentForm } from "@/components/students/student-form";

export const metadata: Metadata = { title: "Edit student" };

export default async function EditStudentPage({ params }: PageProps<"/admin/students/[id]/edit">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const [{ data: s }, classes] = await Promise.all([
    supabase.from("students").select("*").eq("id", id).maybeSingle(),
    getClassOptions(),
  ]);
  if (!s) notFound();

  return (
    <>
      <PageHeader title={`Edit ${s.full_name}`} description={`Admission no ${s.admission_no}`} />
      <StudentForm
        classes={classes.map((c) => ({ id: c.id, label: c.isCurrent ? c.label : `${c.label} (${c.yearName})` }))}
        student={{
          id: s.id, full_name: s.full_name, full_name_ml: s.full_name_ml ?? "", dob: s.dob, gender: s.gender,
          father_name: s.father_name ?? "", mother_name: s.mother_name ?? "", guardian_phone: s.guardian_phone,
          address: s.address ?? "", baptised: s.baptised, school_class: s.school_class as never,
          school_name: s.school_name ?? "", class_id: s.class_id ?? "", status: s.status,
        }} />
    </>
  );
}
