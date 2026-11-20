import type { Metadata } from "next";
import { getTeacherClassContext } from "@/lib/data/teacher-context";
import { getClassExams, getExamResults } from "@/lib/data/results";
import { formatDate } from "@/lib/dates";
import { EmptyState, PageHeader } from "@/components/page-header";
import { UrlSelect } from "@/components/form/url-select";
import { ClassSwitcher } from "@/components/teacher/class-switcher";
import { ResultsView } from "@/components/results/results-view";
import { ActivitiesReport, AttendanceReport, ReportTabs, StudentsReport } from "@/components/reports/reports";

export const metadata: Metadata = { title: "Reports" };

const TABS = [
  { id: "results", label: "Exam results" },
  { id: "attendance", label: "Attendance" },
  { id: "students", label: "Students & ages" },
  { id: "activities", label: "Activities" },
];

/** Same reports as the headmaster, limited (by RLS and here) to the teacher's own classes. */
export default async function TeacherReportsPage({ searchParams }: PageProps<"/teacher/reports">) {
  const sp = await searchParams;
  const tab = TABS.some((t) => t.id === sp.tab) ? (sp.tab as string) : "results";
  const { classes, selected } = await getTeacherClassContext(sp.class);
  if (!selected) return <EmptyState title="No class is assigned to you yet." />;
  const opts = classes.map((c) => ({ id: c.id, label: c.label }));
  const allowed = classes.map((c) => c.id);

  let body: React.ReactNode;
  if (tab === "results") {
    const exams = await getClassExams(selected.id);
    const exam = exams.find((e) => e.id === sp.exam) ?? exams[0];
    const data = exam ? await getExamResults(exam.id) : null;
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
    body = <AttendanceReport sp={{ ...sp, class: typeof sp.class === "string" ? sp.class : selected.id }} classes={opts} />;
  } else if (tab === "students") {
    body = <StudentsReport sp={sp} classes={opts} allowed={allowed} />;
  } else {
    body = <ActivitiesReport sp={sp} classes={opts} allowed={allowed} />;
  }

  return (
    <>
      <PageHeader title="Reports" description={classes.length > 1 ? "Your classes" : selected.label} />
      <ReportTabs base="/teacher/reports" tab={tab} tabs={TABS} keep={{ class: selected.id }} />
      {body}
    </>
  );
}
