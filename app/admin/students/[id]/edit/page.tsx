import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { getClassOptions } from "@/lib/repo/classes";
import { getStudentForEdit, prayerUnitOptions } from "@/lib/repo/students";
import { FATHER_NAME_PLACEHOLDER, NOT_ASSIGNED_PRAYER_UNIT } from "@/lib/config";
import { PageHeader } from "@/components/page-header";
import { StudentForm } from "@/components/students/student-form";

export const metadata: Metadata = { title: "Edit student" };

export default async function EditStudentPage({ params }: PageProps<"/admin/students/[id]/edit">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const user = await requireRole("admin");
  const [s, classes] = await Promise.all([getStudentForEdit(user, id), getClassOptions(user)]);
  if (!s) notFound();
  const prayerUnits = await prayerUnitOptions(user, s.prayer_unit_id);
  // placeholders written when the fields became required are left blank, so they get filled in
  const real = (v: string, placeholder: string) => (v === placeholder ? "" : v);

  return (
    <>
      <PageHeader title={`Edit ${s.full_name}`} description={`Admission no ${s.admission_no}`} />
      <StudentForm prayerUnits={prayerUnits}
        classes={classes.map((c) => ({ id: c.id, label: c.isCurrent ? c.label : `${c.label} (${c.yearName})` }))}
        student={{
          id: s.id, full_name: s.full_name, dob: s.dob, gender: s.gender,
          father_name: real(s.father_name, FATHER_NAME_PLACEHOLDER), mother_name: s.mother_name ?? "",
          guardian_phone: s.guardian_phone, father_phone: s.father_phone, email: s.email ?? "",
          address: s.address ?? "", baptism_name: s.baptism_name ?? "", school_class: s.school_class as never,
          school_name: s.school_name ?? "", prayer_unit_id: real(s.prayer_unit_id, NOT_ASSIGNED_PRAYER_UNIT),
          class_id: s.class_id ?? "", status: s.status,
        }} />
    </>
  );
}
