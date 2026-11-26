import type { CurrentUser } from "@/lib/auth";
import { getClassStudents, getTeacherClassContext } from "@/lib/repo/teacher-context";
import { monthAttendance, teacherAttendanceFrom } from "@/lib/repo/teaching";
import { formatDate, todayISO } from "@/lib/dates";
import { TEACHER_ATTENDANCE_DAYS } from "@/lib/config";
import { EmptyState, PageHeader } from "@/components/page-header";
import { ClassSwitcher } from "@/components/teacher/class-switcher";
import { shiftMonth } from "@/lib/calendar";
import { AttendanceCalendar, type DaySummary } from "./attendance-calendar";
import { DaySheet } from "./day-sheet";

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);
const validDate = (v?: string) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`))
  && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;

/**
 * The attendance page for teachers (own classes, 14 days back) and admins (any class, any date):
 * a month calendar, and the selected day's list.
 */
export async function AttendanceWorkspace({ user, sp, admin }: { user: CurrentUser; sp: SP; admin: boolean }) {
  const { classes, selected } = await getTeacherClassContext(user, sp.class);
  if (!selected) return <EmptyState title={admin ? "There are no classes yet." : "No class is assigned to you yet."} />;

  const today = todayISO();
  const askedDate = one(sp.date);
  const date = validDate(askedDate) && askedDate! <= today ? askedDate! : null;
  const askedMonth = one(sp.month);
  const month = date?.slice(0, 7)
    ?? (askedMonth && /^\d{4}-(0[1-9]|1[0-2])$/.test(askedMonth) && askedMonth <= today.slice(0, 7) ? askedMonth : today.slice(0, 7));
  const editableFrom = admin ? null : teacherAttendanceFrom();

  const [students, monthRows] = await Promise.all([
    getClassStudents(user, selected.id),
    monthAttendance(user, selected.id, month, shiftMonth(month, 1)),
  ]);

  const days: Record<string, DaySummary> = {};
  for (const r of monthRows ?? []) {
    const d = (days[r.date] ??= { marked: 0, attended: 0 });
    d.marked++;
    if (r.status !== "absent") d.attended++;
  }
  const saved = Object.fromEntries((monthRows ?? []).filter((r) => r.date === date)
    .map((r) => [r.student_id, { status: r.status, remark: r.remark }]));
  const readOnly = date && editableFrom && date < editableFrom
    ? `This day is more than ${TEACHER_ATTENDANCE_DAYS} days ago, so it is view-only. Ask an admin to change it.`
    : undefined;

  return (
    <>
      <PageHeader title="Attendance" description={selected.label} />
      <ClassSwitcher classes={classes} selectedId={selected.id} />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_1fr] lg:items-start">
        <AttendanceCalendar month={month} today={today} selected={date} days={days} editableFrom={editableFrom} />
        {!students.length ? (
          <EmptyState title="There are no active students in this class." />
        ) : !date ? (
          <EmptyState title="Pick a day on the calendar.">
            Sundays are highlighted. Days with a dot are already saved.
          </EmptyState>
        ) : (
          <DaySheet key={`${selected.id}:${date}`} classId={selected.id} date={date}
            title={formatDate(date)} readOnly={readOnly} saved={saved}
            students={students.map((s) => ({ id: s.id, name: s.full_name, nameMl: s.full_name_ml, admissionNo: s.admission_no }))} />
        )}
      </div>
    </>
  );
}
