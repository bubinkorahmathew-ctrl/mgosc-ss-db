import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { getClassOptions } from "@/lib/repo/classes";
import { PageHeader } from "@/components/page-header";
import {
  ActivitiesReport, AnnualResultReport, AttendanceReport, ExamAttendanceReportView, GradeDistributionReport, ReportTabs,
  StudentsReport, ToppersReport,
} from "@/components/reports/reports";

export const metadata: Metadata = { title: "Reports" };

const TABS = [
  { id: "students", label: "Students & ages" },
  { id: "attendance", label: "Attendance" },
  { id: "exam-attendance", label: "Exam attendance" },
  { id: "annual", label: "Annual result" },
  { id: "grades", label: "Grade distribution" },
  { id: "toppers", label: "Toppers" },
  { id: "activities", label: "Activities" },
];

export default async function AdminReportsPage({ searchParams }: PageProps<"/admin/reports">) {
  const user = await requireRole("headmaster");
  const sp = await searchParams;
  const tab = TABS.some((t) => t.id === sp.tab) ? (sp.tab as string) : "students";
  const classes = (await getClassOptions(user)).map((c) => ({
    id: c.id, label: c.isCurrent ? c.label : `${c.label} (${c.yearName})`,
  }));

  return (
    <>
      <PageHeader title="Reports" description="Filter on screen, then download as Excel or PDF. One exam's results are under Report cards." />
      <ReportTabs base="/admin/reports" tab={tab} tabs={TABS} />
      {tab === "students" && <StudentsReport user={user} sp={sp} classes={classes} allowed="all" />}
      {tab === "attendance" && <AttendanceReport user={user} sp={sp} classes={classes} />}
      {tab === "exam-attendance" && <ExamAttendanceReportView user={user} sp={sp} classes={classes} />}
      {tab === "annual" && <AnnualResultReport user={user} sp={sp} classes={classes} />}
      {tab === "grades" && <GradeDistributionReport user={user} sp={sp} allowed="all" />}
      {tab === "toppers" && <ToppersReport user={user} sp={sp} classes={classes} />}
      {tab === "activities" && <ActivitiesReport user={user} sp={sp} classes={classes} allowed="all" />}
    </>
  );
}
