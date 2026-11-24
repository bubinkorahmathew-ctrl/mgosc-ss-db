import { Download } from "lucide-react";
import { FATHER_NAME_PLACEHOLDER, NOT_ASSIGNED_PRAYER_UNIT } from "@/lib/config";
import { formatAge, formatDate, todayISO } from "@/lib/dates";
import { StudentAttendanceCalendar } from "@/components/attendance/student-attendance-calendar";
import { classLabel, percent } from "@/lib/format";
import type { StudentProfile } from "@/lib/data/student-profile";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/page-header";
import { StatusBadge, genderLabel } from "@/components/status-badge";

const ACTIVITY_LABEL: Record<string, string> = {
  competition: "Competition", memory_verse: "Memory verse", event: "Event", note: "Note",
};
const CERT_LABEL: Record<string, string> = {
  completion: "Completion", merit: "Merit", attendance: "Attendance", participation: "Participation",
  memory_verse: "Memory verse", custom: "Custom",
};

/** A placeholder left by the migration: shown so it gets fixed. */
function Missing({ text }: { text: string }) {
  return <span className="font-medium text-amber-800">{text}: please update</span>;
}

export function StudentProfileView({ profile }: { profile: StudentProfile }) {
  const { student: s, attendance, examResults, activities, certificates } = profile;
  const details: [string, React.ReactNode][] = [
    ["Admission no", <span key="a" className="font-mono">{s.admission_no}</span>],
    ["Sunday School class", s.classes ? `${classLabel(s.classes)} (${s.classes.academic_years?.name ?? ""})` : "Not assigned"],
    ["Date of birth", formatDate(s.dob)],
    ["Age", formatAge(s.dob)],
    ["Gender", genderLabel(s.gender)],
    ["School class", s.school_class],
    ["School name", s.school_name || "-"],
    ["Prayer unit", s.prayer_unit_id === NOT_ASSIGNED_PRAYER_UNIT ? <Missing key="u" text="Not assigned" /> : s.prayer_units?.name ?? "-"],
    ["Father", s.father_name === FATHER_NAME_PLACEHOLDER ? <Missing key="n" text="Not given" /> : s.father_name],
    ["Mother", s.mother_name || "-"],
    ["Father's mobile", s.father_phone ? <a key="f" href={`tel:${s.father_phone}`} className="text-primary underline">{s.father_phone}</a> : "-"],
    ["Guardian phone", <a key="p" href={`tel:${s.guardian_phone}`} className="text-primary underline">{s.guardian_phone}</a>],
    ["Email", s.email || "-"],
    ["Address", s.address || "-"],
    ["Baptism name", s.baptism_name || "-"],
    ["Status", <StatusBadge key="s" status={s.status} />],
  ];
  if (s.status === "inactive" && s.inactive_reason) details.push(["Reason for inactive", s.inactive_reason]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <Card size="sm"><CardContent>
          <p className="text-xs text-muted-foreground">Attendance</p>
          <p className="text-xl font-semibold">{percent(attendance.present + attendance.late, attendance.totalDays, 0)}</p>
          <p className="text-xs text-muted-foreground">{attendance.totalDays} days marked</p>
        </CardContent></Card>
        <Card size="sm"><CardContent>
          <p className="text-xs text-muted-foreground">Exams</p>
          <p className="text-xl font-semibold">{examResults.length}</p>
        </CardContent></Card>
        <Card size="sm"><CardContent>
          <p className="text-xs text-muted-foreground">Activities</p>
          <p className="text-xl font-semibold">{activities.length}</p>
        </CardContent></Card>
      </div>

      <Tabs defaultValue="details">
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="marks">Marks</TabsTrigger>
          <TabsTrigger value="attendance">Attendance</TabsTrigger>
          <TabsTrigger value="activities">Activities</TabsTrigger>
          <TabsTrigger value="certificates">Certificates</TabsTrigger>
        </TabsList>

        <TabsContent value="details">
          <Card><CardContent>
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
              {details.map(([k, v]) => (
                <div key={k}><dt className="text-xs text-muted-foreground">{k}</dt><dd className="text-sm">{v}</dd></div>
              ))}
            </dl>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="marks" className="space-y-3">
          {!examResults.length ? <EmptyState title="No marks entered yet." /> : examResults.map((e) => (
            <Card key={e.id}>
              <CardHeader>
                <CardTitle className="flex flex-wrap items-baseline justify-between gap-2">
                  <span>{e.name}</span>
                  <span className="text-sm font-normal text-muted-foreground">
                    {e.exam_date ? formatDate(e.exam_date) + " · " : ""}{e.total}/{e.max} ({percent(e.total, e.max)})
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="divide-y text-sm">
                  {e.subjects.map((x) => (
                    <li key={x.name} className="flex justify-between py-2">
                      <span>{x.name}{x.remarks && <span className="text-muted-foreground"> · {x.remarks}</span>}</span>
                      <span className="font-medium">{x.obtained}/{x.max}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="attendance">
          <Card><CardContent className="space-y-3">
            <p className="text-sm">
              <span className="font-semibold text-emerald-700">{attendance.present}</span> present ·{" "}
              <span className="font-semibold text-amber-700">{attendance.late}</span> late ·{" "}
              <span className="font-semibold text-red-700">{attendance.absent}</span> absent
            </p>
            <p className="text-sm">
              Attendance: <b>{percent(attendance.present + attendance.late, attendance.totalDays, 1)}</b> (late counts as attended)
            </p>
            {!attendance.recent.length ? <p className="text-sm text-muted-foreground">No attendance marked yet.</p> : (
              <div className="grid gap-6 md:grid-cols-2">
                <StudentAttendanceCalendar days={attendance.all} today={todayISO()} />
                <ul className="divide-y text-sm">
                  {attendance.recent.map((a) => (
                    <li key={a.date} className="flex justify-between gap-2 py-2">
                      <span>{formatDate(a.date)}</span>
                      <span className="text-right"><span className="capitalize">{a.status}</span>
                        {a.remark && <span className="block text-xs text-muted-foreground">{a.remark}</span>}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="activities">
          {!activities.length ? <EmptyState title="No activities recorded yet." /> : (
            <ul className="divide-y rounded-xl border text-sm">
              {activities.map((a) => (
                <li key={a.id} className="px-4 py-3">
                  <div className="flex justify-between gap-2">
                    <span className="font-medium">{a.title}</span>
                    <span className="text-muted-foreground">{formatDate(a.activity_date)}</span>
                  </div>
                  <p className="text-muted-foreground">
                    {ACTIVITY_LABEL[a.type]}{a.score != null ? ` · score ${a.score}` : ""}{a.notes ? ` · ${a.notes}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="certificates">
          {!certificates.length ? <EmptyState title="No certificates issued yet." /> : (
            <ul className="divide-y rounded-xl border text-sm">
              {certificates.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                  <div>
                    <p className="font-medium">{c.title}</p>
                    <p className="text-muted-foreground">
                      <span className="font-mono">{c.certificate_no}</span> · {CERT_LABEL[c.type]} · {formatDate(c.issued_on)}
                      {c.revoked && <span className="ml-2 font-medium text-red-700">Revoked</span>}
                    </p>
                  </div>
                  <a href={`/api/pdf/certificates?ids=${c.id}`} target="_blank" rel="noopener"
                    className="inline-flex min-h-9 items-center gap-1 rounded-lg border px-3 text-sm font-medium hover:bg-muted">
                    <Download className="size-4" /> PDF
                  </a>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
