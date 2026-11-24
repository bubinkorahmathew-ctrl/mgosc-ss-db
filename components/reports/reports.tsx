import Link from "next/link";
import { FileSpreadsheet, Search } from "lucide-react";
import { SCHOOL_CLASSES } from "@/lib/config";
import { formatDate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { percent } from "@/lib/format";
import { activityReport, attendanceReport, defaultRange, examAttendanceReport, studentReport } from "@/lib/data/reports";
import { getClassExams } from "@/lib/data/results";
import { getPrayerUnits } from "@/lib/data/students";
import { parseRange, parseStudentReport, toQuery } from "@/lib/validation/reports";
import { ACTIVITY_LABELS } from "@/lib/validation/teacher";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, NativeSelect } from "@/components/form/field";
import { EmptyState } from "@/components/page-header";
import { StatusBadge, genderLabel } from "@/components/status-badge";

type SP = Record<string, string | string[] | undefined>;
export type ClassOpt = { id: string; label: string };
const SHOW_MAX = 500;
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function ReportTabs({ base, tab, tabs, keep, label = "Reports" }: {
  base: string; tab: string; tabs: { id: string; label: string }[]; keep?: Record<string, string | undefined>; label?: string;
}) {
  return (
    <nav aria-label={label}className="mb-4 flex gap-1 overflow-x-auto border-b">
      {tabs.map((t) => (
        <Link key={t.id} href={`${base}?${toQuery({ ...keep, tab: t.id })}`} aria-current={t.id === tab ? "page" : undefined}
          className={cn("min-h-11 shrink-0 border-b-2 px-3 pt-3 text-sm font-medium",
            t.id === tab ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

function FilterForm({ tab, children, exportHref }: { tab: string; children: React.ReactNode; exportHref?: string }) {
  return (
    <form method="get" className="mb-4 rounded-xl border bg-muted/30 p-4">
      <input type="hidden" name="tab" value={tab} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{children}</div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="submit"><Search /> Show</Button>
        {exportHref && <Button variant="outline" render={<a href={exportHref} />} nativeButton={false}><FileSpreadsheet /> Excel</Button>}
      </div>
    </form>
  );
}

function ClassSelect({ classes, value, allLabel }: { classes: ClassOpt[]; value?: string; allLabel?: string }) {
  return (
    <Field id="r-class" label="Class">
      <NativeSelect id="r-class" name="class" defaultValue={value ?? ""}>
        {allLabel && <option value="">{allLabel}</option>}
        {classes.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
      </NativeSelect>
    </Field>
  );
}

function DateFields({ from, to }: { from: string; to: string }) {
  return (
    <>
      <Field id="r-from" label="From"><Input id="r-from" name="from" type="date" defaultValue={from} /></Field>
      <Field id="r-to" label="To"><Input id="r-to" name="to" type="date" defaultValue={to} /></Field>
    </>
  );
}

const tooMany = (n: number) => n > SHOW_MAX && (
  <p className="mb-2 text-sm text-muted-foreground">Showing the first {SHOW_MAX} of {n}. The Excel file has all rows.</p>
);

export async function StudentsReport({ sp, classes, allowed }: { sp: SP; classes: ClassOpt[]; allowed: string[] | "all" }) {
  const f = parseStudentReport(sp);
  if (f.class_id && allowed !== "all" && !allowed.includes(f.class_id)) f.class_id = undefined;
  const [rows, prayerUnits] = await Promise.all([studentReport(f, allowed), getPrayerUnits()]);
  const q = toQuery({
    class: f.class_id, q: f.q, school_class: f.school_class, gender: f.gender, status: f.status, prayer_unit_id: f.prayer_unit_id,
    age_min: f.age_min, age_max: f.age_max, as_of: f.as_of, dob_from: f.dob_from, dob_to: f.dob_to,
    dob_year: f.dob_year, dob_month: f.dob_month, incomplete: f.incomplete, sort: f.sort, dir: f.dir,
  });

  return (
    <>
      <FilterForm tab="students" exportHref={`/api/export/students?${q}`}>
        <ClassSelect classes={classes} value={f.class_id} allLabel={allowed === "all" ? "All classes" : "All my classes"} />
        <Field id="r-q" label="Search" hint="Name, admission no or phone">
          <Input id="r-q" name="q" type="search" defaultValue={f.q ?? ""} />
        </Field>
        <Field id="r-pu" label="Prayer unit">
          <NativeSelect id="r-pu" name="prayer_unit_id" defaultValue={f.prayer_unit_id ?? ""}>
            <option value="">Any</option>
            {prayerUnits.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </NativeSelect>
        </Field>
        <Field id="r-sc" label="School class">
          <NativeSelect id="r-sc" name="school_class" defaultValue={f.school_class ?? ""}>
            <option value="">Any</option>
            {SCHOOL_CLASSES.map((c) => <option key={c} value={c}>{c}</option>)}
          </NativeSelect>
        </Field>
        <Field id="r-g" label="Gender">
          <NativeSelect id="r-g" name="gender" defaultValue={f.gender ?? ""}>
            <option value="">Any</option><option value="male">Boys</option><option value="female">Girls</option>
          </NativeSelect>
        </Field>
        <Field id="r-st" label="Status">
          <NativeSelect id="r-st" name="status" defaultValue={f.status}>
            <option value="active">Active</option><option value="inactive">Inactive</option>
            <option value="passed_out">Passed out</option><option value="all">All</option>
          </NativeSelect>
        </Field>
        <Field id="r-amin" label="Age from"><Input id="r-amin" name="age_min" inputMode="numeric" defaultValue={f.age_min ?? ""} placeholder="any" /></Field>
        <Field id="r-amax" label="Age to"><Input id="r-amax" name="age_max" inputMode="numeric" defaultValue={f.age_max ?? ""} placeholder="any" /></Field>
        <Field id="r-asof" label="Age as on" hint="Default: today"><Input id="r-asof" name="as_of" type="date" defaultValue={f.as_of} /></Field>
        <Field id="r-df" label="Born from"><Input id="r-df" name="dob_from" type="date" defaultValue={f.dob_from ?? ""} /></Field>
        <Field id="r-dt" label="Born to"><Input id="r-dt" name="dob_to" type="date" defaultValue={f.dob_to ?? ""} /></Field>
        <Field id="r-dy" label="Birth year"><Input id="r-dy" name="dob_year" inputMode="numeric" placeholder="any" defaultValue={f.dob_year ?? ""} /></Field>
        <Field id="r-dm" label="Birth month">
          <NativeSelect id="r-dm" name="dob_month" defaultValue={f.dob_month ?? ""}>
            <option value="">Any</option>
            {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </NativeSelect>
        </Field>
        <Field id="r-sort" label="Sort by">
          <NativeSelect id="r-sort" name="sort" defaultValue={f.sort ?? "name"}>
            <option value="name">Name</option><option value="age">Age</option><option value="dob">Date of birth</option>
          </NativeSelect>
        </Field>
        <Field id="r-dir" label="Order">
          <NativeSelect id="r-dir" name="dir" defaultValue={f.dir ?? "asc"}>
            <option value="asc">Ascending</option><option value="desc">Descending</option>
          </NativeSelect>
        </Field>
        <label className="flex min-h-9 items-center gap-2 self-end text-sm">
          <input type="checkbox" name="incomplete" value="1" defaultChecked={f.incomplete === "1"} className="size-4 accent-[var(--primary)]" />
          Incomplete records only
        </label>
      </FilterForm>

      <p className="mb-2 text-sm font-medium">{rows.length} student{rows.length === 1 ? "" : "s"}
        {" "}· {rows.filter((r) => r.gender === "male").length} boys, {rows.filter((r) => r.gender === "female").length} girls</p>
      {tooMany(rows.length)}
      {!rows.length ? <EmptyState title="No students match these filters." /> : (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>{["Adm. no", "Name", "Class", "Date of birth", "Age", "Gender", "School class", "Prayer unit", "Phone", "Status"].map((h) =>
                <th key={h} className="px-3 py-2 font-medium whitespace-nowrap">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y">
              {rows.slice(0, SHOW_MAX).map((r) => (
                <tr key={r.admission_no}>
                  <td className="px-3 py-2 font-mono text-xs">{r.admission_no}</td>
                  <td className="px-3 py-2"><div className="font-medium">{r.full_name}</div>
                    {r.full_name_ml && <div className="text-xs text-muted-foreground">{r.full_name_ml}</div>}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{r.class || "-"}</td>
                  <td className="px-3 py-2 tabular-nums">{formatDate(r.dob)}</td>
                  <td className="px-3 py-2 whitespace-nowrap tabular-nums">{r.age_ym}</td>
                  <td className="px-3 py-2">{genderLabel(r.gender)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{r.school_class}</td>
                  <td className="px-3 py-2">{r.prayer_unit}</td>
                  <td className="px-3 py-2 tabular-nums">{r.guardian_phone}</td>
                  <td className="px-3 py-2"><StatusBadge status={r.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

export async function AttendanceReport({ sp, classes }: { sp: SP; classes: ClassOpt[] }) {
  const f = parseRange(sp, await defaultRange());
  const classId = classes.find((c) => c.id === f.class_id)?.id ?? classes[0]?.id;
  if (!classId) return <EmptyState title="No classes to report on." />;
  const { rows, sessions } = await attendanceReport(classId, f.from, f.to);
  const q = toQuery({ class: classId, from: f.from, to: f.to });

  return (
    <>
      <FilterForm tab="attendance" exportHref={`/api/export/attendance?${q}`}>
        <ClassSelect classes={classes} value={classId} />
        <DateFields from={f.from} to={f.to} />
      </FilterForm>
      <p className="mb-2 text-sm font-medium">{sessions} day{sessions === 1 ? "" : "s"} marked between {formatDate(f.from)} and {formatDate(f.to)}</p>
      {!rows.length ? <EmptyState title="No students in this class." /> : (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="px-3 py-2 font-medium">Student</th>
                <th className="px-3 py-2 text-right font-medium">Present</th>
                <th className="px-3 py-2 text-right font-medium">Late</th>
                <th className="px-3 py-2 text-right font-medium">Absent</th>
                <th className="px-3 py-2 text-right font-medium">Attendance</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r) => (
                <tr key={r.admission_no}>
                  <td className="px-3 py-2"><div className="font-medium">{r.full_name}</div><div className="text-xs text-muted-foreground">{r.admission_no}</div></td>
                  <td className="px-3 py-2 text-right tabular-nums text-emerald-700">{r.present}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-amber-700">{r.late}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-red-700">{r.absent}</td>
                  <td className={cn("px-3 py-2 text-right font-medium tabular-nums", r.percentage !== null && r.percentage < 75 && "text-red-700")}>
                    {percent(r.present + r.late, r.days, 0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-2 text-xs text-muted-foreground">Late counts as attended. Below 75% is shown in red.</p>
    </>
  );
}

/** Per exam: how many sat it, and who was absent. */
export async function ExamAttendanceReportView({ sp, classes }: { sp: SP; classes: ClassOpt[] }) {
  const asked = typeof sp.class === "string" ? sp.class : undefined;
  const classId = classes.find((c) => c.id === asked)?.id ?? classes[0]?.id;
  if (!classId) return <EmptyState title="No classes to report on." />;
  const exams = await getClassExams(classId);
  const exam = exams.find((e) => e.id === sp.exam) ?? exams[0];
  const data = exam ? await examAttendanceReport(exam.id) : null;

  return (
    <>
      <FilterForm tab="exam-attendance" exportHref={data ? `/api/export/exam-attendance?${toQuery({ exam: data.exam.id })}` : undefined}>
        <ClassSelect classes={classes} value={classId} />
        <Field id="r-exam" label="Exam" hint="Press Show after changing the class">
          <NativeSelect id="r-exam" name="exam" defaultValue={exam?.id ?? ""}>
            {exams.map((e) => <option key={e.id} value={e.id}>{e.exam_date ? `${e.name} (${formatDate(e.exam_date)})` : e.name}</option>)}
          </NativeSelect>
        </Field>
      </FilterForm>
      {!data ? <EmptyState title="No exams for this class yet." /> : (
        <div className="space-y-3">
          <p className="text-sm font-medium">
            {data.exam.name} · {data.className}{data.exam.exam_date ? ` · ${formatDate(data.exam.exam_date)}` : ""}:{" "}
            <span className="text-emerald-700">{data.present} present</span> ·{" "}
            <span className="text-red-700">{data.absent} absent</span>
            {data.notMarked.length > 0 && <> · <span className="text-amber-700">{data.notMarked.length} not marked</span></>}
          </p>
          {!data.absent ? <EmptyState title="Nobody was absent." /> : (
            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left">
                  <tr><th className="px-3 py-2 font-medium">Absentee</th><th className="px-3 py-2 font-medium">Remark</th></tr>
                </thead>
                <tbody className="divide-y">
                  {data.absentees.map((a) => (
                    <tr key={a.admission_no}>
                      <td className="px-3 py-2"><div className="font-medium">{a.full_name}</div><div className="text-xs text-muted-foreground">{a.admission_no}</div></td>
                      <td className="px-3 py-2">{a.remark || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {data.notMarked.length > 0 && (
            <p className="text-xs text-muted-foreground">Not marked yet: {data.notMarked.map((s) => s.full_name).join(", ")}.</p>
          )}
        </div>
      )}
    </>
  );
}

export async function ActivitiesReport({ sp, classes, allowed }: { sp: SP; classes: ClassOpt[]; allowed: string[] | "all" }) {
  const f = parseRange(sp, await defaultRange());
  if (f.class_id && !classes.some((c) => c.id === f.class_id)) f.class_id = undefined;
  const rows = await activityReport(f, allowed);
  const q = toQuery({ class: f.class_id, from: f.from, to: f.to, type: f.type });

  return (
    <>
      <FilterForm tab="activities" exportHref={`/api/export/activities?${q}`}>
        <ClassSelect classes={classes} value={f.class_id} allLabel={allowed === "all" ? "All classes" : "All my classes"} />
        <Field id="r-type" label="Type">
          <NativeSelect id="r-type" name="type" defaultValue={f.type ?? ""}>
            <option value="">All types</option>
            {Object.entries(ACTIVITY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </NativeSelect>
        </Field>
        <DateFields from={f.from} to={f.to} />
      </FilterForm>
      <p className="mb-2 text-sm font-medium">{rows.length} activit{rows.length === 1 ? "y" : "ies"}</p>
      {tooMany(rows.length)}
      {!rows.length ? <EmptyState title="No activities in this period." /> : (
        <ul className="divide-y rounded-xl border text-sm">
          {rows.slice(0, SHOW_MAX).map((a) => (
            <li key={a.id} className="px-4 py-3">
              <div className="flex flex-wrap justify-between gap-2">
                <span className="font-medium">{a.title}</span>
                <span className="text-muted-foreground">{formatDate(a.activity_date)}</span>
              </div>
              <p className="text-muted-foreground">
                {ACTIVITY_LABELS[a.type]} · {a.class} · {a.student}{a.score != null ? ` · score ${a.score}` : ""}{a.notes ? ` · ${a.notes}` : ""}
              </p>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
