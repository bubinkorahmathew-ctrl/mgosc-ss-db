import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { getClassStudents, getTeacherClassContext } from "@/lib/repo/teacher-context";
import { listActivities } from "@/lib/repo/teaching";
import { formatDate, todayISO } from "@/lib/dates";
import { ACTIVITY_LABELS } from "@/lib/validation/teacher";
import { EmptyState, PageHeader } from "@/components/page-header";
import { ClassSwitcher } from "@/components/teacher/class-switcher";
import { ActivityDialog, ActivityStudentFilter } from "./activity-dialog";

export const metadata: Metadata = { title: "Activities" };

export default async function ActivitiesPage({ searchParams }: PageProps<"/teacher/activities">) {
  const user = await requireRole("teacher");
  const sp = await searchParams;
  const { classes, selected } = await getTeacherClassContext(user, sp.class);
  if (!selected) return <EmptyState title="No class is assigned to you yet." />;

  const students = await getClassStudents(user, selected.id);
  const studentId = typeof sp.student === "string" && students.some((s) => s.id === sp.student) ? sp.student : undefined;

  const activities = await listActivities(user, selected.id, studentId);

  const studentOptions = students.map((s) => ({ id: s.id, label: s.full_name }));

  return (
    <>
      <PageHeader title="Activities" description={selected.label}
        actions={<ActivityDialog classId={selected.id} students={studentOptions} defaultDate={todayISO()} defaultStudentId={studentId} />} />
      <ClassSwitcher classes={classes} selectedId={selected.id} />
      <ActivityStudentFilter students={studentOptions} selectedId={studentId} />

      {!activities.length ? (
        <EmptyState title="No activities yet.">
          Record competitions, memory verses, events or notes for the class or one student.
        </EmptyState>
      ) : (
        <ul className="divide-y rounded-xl border">
          {activities.map((a) => (
            <li key={a.id} className="flex items-start gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{a.title}</p>
                <p className="text-sm text-muted-foreground">
                  {ACTIVITY_LABELS[a.type]} · {formatDate(a.activity_date)} · {a.students?.full_name ?? "Whole class"}
                  {a.score != null && ` · score ${a.score}`}
                </p>
                {a.notes && <p className="mt-1 text-sm">{a.notes}</p>}
              </div>
              <ActivityDialog classId={selected.id} students={studentOptions} defaultDate={a.activity_date}
                activity={{ id: a.id, type: a.type, title: a.title, activity_date: a.activity_date,
                  score: a.score, notes: a.notes ?? "", student_id: a.student_id ?? "" }} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
