import type { Metadata } from "next";
import { getClassOptions } from "@/lib/data/classes";
import { PageHeader } from "@/components/page-header";
import { ActivitiesReport, AttendanceReport, ReportTabs, StudentsReport } from "@/components/reports/reports";

export const metadata: Metadata = { title: "Reports" };

const TABS = [
  { id: "students", label: "Students & ages" },
  { id: "attendance", label: "Attendance" },
  { id: "activities", label: "Activities" },
];

export default async function AdminReportsPage({ searchParams }: PageProps<"/admin/reports">) {
  const sp = await searchParams;
  const tab = TABS.some((t) => t.id === sp.tab) ? (sp.tab as string) : "students";
  const classes = (await getClassOptions()).map((c) => ({
    id: c.id, label: c.isCurrent ? c.label : `${c.label} (${c.yearName})`,
  }));

  return (
    <>
      <PageHeader title="Reports" description="Filter on screen, then download as Excel. Exam results are under Report cards." />
      <ReportTabs base="/admin/reports" tab={tab} tabs={TABS} />
      {tab === "students" && <StudentsReport sp={sp} classes={classes} allowed="all" />}
      {tab === "attendance" && <AttendanceReport sp={sp} classes={classes} />}
      {tab === "activities" && <ActivitiesReport sp={sp} classes={classes} allowed="all" />}
    </>
  );
}
