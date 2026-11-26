import "server-only";
/** The numbers on the admin and teacher home pages. */
import { queryAs, requireRole, type Viewer } from "./access";

const tally = (rows: { status: "present" | "absent" | "late" }[]) => {
  const t = { present: 0, absent: 0, late: 0 };
  for (const r of rows) t[r.status]++;
  return t;
};

export async function adminDashboard(user: Viewer, today: string) {
  requireRole(user, "headmaster");
  const dbc = queryAs(user);
  const [{ data: classes }, { count: students }, { count: pending }, { data: attendance }, { count: teachers }, { count: exams }] =
    await Promise.all([
      dbc.from("classes").select("id, academic_years!inner(is_current)").eq("academic_years.is_current", true),
      dbc.from("students").select("id", { count: "exact", head: true }).eq("status", "active"),
      dbc.from("registrations").select("id", { count: "exact", head: true }).eq("status", "pending"),
      dbc.from("attendance").select("status").eq("date", today),
      dbc.from("profiles").select("id", { count: "exact", head: true }).eq("role", "teacher").eq("active", true),
      dbc.from("exams").select("id", { count: "exact", head: true }),
    ]);
  return {
    classes: classes?.length ?? 0, students: students ?? 0, pending: pending ?? 0,
    teachers: teachers ?? 0, exams: exams ?? 0, attendance: tally(attendance ?? []),
  };
}

export async function teacherDashboard(user: Viewer, classId: string, today: string) {
  requireRole(user, "teacher", "headmaster");
  const dbc = queryAs(user);
  const [{ data: students }, { data: att }, { count: activities }, { count: exams }] = await Promise.all([
    dbc.from("students").select("gender").eq("class_id", classId).eq("status", "active"),
    dbc.from("attendance").select("status").eq("class_id", classId).eq("date", today),
    dbc.from("activities").select("id", { count: "exact", head: true }).eq("class_id", classId),
    dbc.from("exams").select("id", { count: "exact", head: true }).eq("class_id", classId),
  ]);
  const boys = (students ?? []).filter((s) => s.gender === "male").length;
  return {
    boys, girls: (students ?? []).length - boys, attendance: tally(att ?? []),
    activities: activities ?? 0, exams: exams ?? 0,
  };
}
