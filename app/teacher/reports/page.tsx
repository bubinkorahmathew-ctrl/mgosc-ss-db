import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { getTeacherClassContext } from "@/lib/repo/teacher-context";
import { getClassExams, getExamResults } from "@/lib/repo/results";
import { formatDate } from "@/lib/dates";
import { EmptyState, PageHeader } from "@/components/page-header";
import { UrlSelect } from "@/components/form/url-select";
import { ClassSwitcher } from "@/components/teacher/class-switcher";
import { ResultsView } from "@/components/results/results-view";
import {
  ActivitiesReport, AnnualResultReport, AttendanceReport, ExamAttendanceReportView, GradeDistributionReport, ReportTabs,
  StudentsReport, ToppersReport,
} from "@/components/reports/reports";

export const metadata: Metadata = { title: "Reports" };

const TABS = [
  { id: "results", label: "Exam results" },
  { id: "attendance", label: "Attendance" },
  { id: "exam-attendance", label: "Exam attendance" },
  { id: "annual", label: "Annual result" },
  { id: "grades", label: "Grade distribution" },
  { id: "toppers", label: "Toppers" },
  { id: "students", label: "Students & ages" },
  { id: "activities", label: "Activities" },
];

/** Same reports as the headmaster, limited (by RLS and here) to the teacher's own classes. */
export default async function TeacherReportsPage({ searchParams }: PageProps<"/teacher/reports">) {
  const user = await requireRole("teacher");
  const sp = await searchParams;
  const tab = TABS.some((t) => t.id === sp.tab) ? (sp.tab as string) : "results";
  const { classes, selected } = await getTeacherClassContext(user, sp.class);
  if (!selected) return <EmptyState title="No class is assigned to you yet." />;
  const opts = classes.map((c) => ({ id: c.id, label: c.label }));
  const allowed = classes.map((c) => c.id);

  let body: React.ReactNode;
  if (tab === "results") {
    const exams = await getClassExams(user, selected.id);
    const exam = exams.find((e) => e.id === sp.exam) ?? exams[0];
    const data = exam ? await getExamResults(user, exam.id) : null;
    body = (
      <>
        <ClassSwitcher classes={classes} selectedId={selected.id} />
        {!exam || !data ? <EmptyState title="No exams for this class yet." /> : (
          <>
            <UrlSelect id="tr-exam" label="Exam" param="exam" value={exam.id} className="mb-4 sm:w-80"
              options={exams.map((e) => ({ value: e.id, label: e.exam_date ? `${e.name} (${formatDate(e.exam_date)})` : e.name }))} />
            <ResultsView data={data} />
          </>
        )}
      </>
    );
  } else if (tab === "attendance") {
    body = <AttendanceReport user={user} sp={{ ...sp, class: typeof sp.class === "string" ? sp.class : selected.id }} classes={opts} />;
  } else if (tab === "exam-attendance") {
    body = <ExamAttendanceReportView user={user} sp={{ ...sp, class: typeof sp.class === "string" ? sp.class : selected.id }} classes={opts} />;
  } else if (tab === "annual") {
    body = <AnnualResultReport user={user} sp={{ ...sp, class: typeof sp.class === "string" ? sp.class : selected.id }} classes={opts} />;
  } else if (tab === "grades") {
    body = <GradeDistributionReport user={user} sp={sp} allowed={allowed} />;
  } else if (tab === "toppers") {
    body = <ToppersReport user={user} sp={sp} classes={opts} />;
  } else if (tab === "students") {
    body = <StudentsReport user={user} sp={sp} classes={opts} allowed={allowed} />;
  } else {
    body = <ActivitiesReport user={user} sp={sp} classes={opts} allowed={allowed} />;
  }

  return (
    <>
      <PageHeader title="Reports" description={classes.length > 1 ? "Your classes" : selected.label} />
      <ReportTabs base="/teacher/reports" tab={tab} tabs={TABS} keep={{ class: selected.id }} />
      {body}
    </>
  );
}
