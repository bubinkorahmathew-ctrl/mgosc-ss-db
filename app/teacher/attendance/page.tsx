import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getClassStudents, getTeacherClassContext } from "@/lib/data/teacher-context";
import { todayISO } from "@/lib/dates";
import { EmptyState, PageHeader } from "@/components/page-header";
import { ClassSwitcher } from "@/components/teacher/class-switcher";
import { AttendanceSheet } from "./attendance-sheet";

export const metadata: Metadata = { title: "Attendance" };

export default async function AttendancePage({ searchParams }: PageProps<"/teacher/attendance">) {
  const sp = await searchParams;
  const { classes, selected } = await getTeacherClassContext(sp.class);
  if (!selected) return <EmptyState title="No class is assigned to you yet." />;

  const today = todayISO();
  const date = typeof sp.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) && sp.date <= today ? sp.date : today;

  const supabase = await createClient();
  const [students, { data: existing }] = await Promise.all([
    getClassStudents(selected.id),
    supabase.from("attendance").select("student_id, status").eq("class_id", selected.id).eq("date", date),
  ]);

  return (
    <>
      <PageHeader title="Attendance" description={selected.label} />
      <ClassSwitcher classes={classes} selectedId={selected.id} />
      {!students.length ? (
        <EmptyState title="There are no active students in this class." />
      ) : (
        <AttendanceSheet key={`${selected.id}:${date}`} classId={selected.id} date={date} today={today}
          students={students.map((s) => ({ id: s.id, name: s.full_name, nameMl: s.full_name_ml, admissionNo: s.admission_no }))}
          saved={Object.fromEntries((existing ?? []).map((r) => [r.student_id, r.status]))} />
      )}
    </>
  );
}
