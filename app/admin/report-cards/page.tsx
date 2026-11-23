import type { Metadata } from "next";
import { getAcademicYears } from "@/lib/data/classes";
import { getClassExams, getExamResults } from "@/lib/data/results";
import { createClient } from "@/lib/db/server";
import { classLabel } from "@/lib/format";
import { formatDate } from "@/lib/dates";
import { EmptyState, PageHeader } from "@/components/page-header";
import { UrlSelect } from "@/components/form/url-select";
import { ResultsView } from "@/components/results/results-view";

export const metadata: Metadata = { title: "Report cards" };

export default async function ReportCardsPage({ searchParams }: PageProps<"/admin/report-cards">) {
  const sp = await searchParams;
  const years = await getAcademicYears();
  const year = years.find((y) => y.id === sp.year) ?? years.find((y) => y.is_current) ?? years[0];

  const dbc = await createClient();
  const { data: classRows } = year
    ? await dbc.from("classes").select("id, name, section").eq("academic_year_id", year.id)
    : { data: [] };
  const classes = (classRows ?? []).map((c) => ({ value: c.id, label: classLabel(c) }))
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
  const cls = classes.find((c) => c.value === sp.class) ?? classes[0];
  const exams = cls ? await getClassExams(cls.value) : [];
  const exam = exams.find((e) => e.id === sp.exam) ?? exams[0];
  const data = exam ? await getExamResults(exam.id) : null;

  return (
    <>
      <PageHeader title="Report cards" description="Exam results, ranks and printable report cards." />
      <div className="mb-6 grid gap-3 rounded-xl border bg-muted/30 p-4 sm:grid-cols-3">
        <UrlSelect id="rc-year" label="Academic year" param="year" value={year?.id} clears={["class", "exam"]}
          options={years.map((y) => ({ value: y.id, label: y.name + (y.is_current ? " (current)" : "") }))} />
        <UrlSelect id="rc-class" label="Class" param="class" value={cls?.value} clears={["exam"]} options={classes} />
        <UrlSelect id="rc-exam" label="Exam" param="exam" value={exam?.id}
          options={exams.map((e) => ({ value: e.id, label: e.exam_date ? `${e.name} (${formatDate(e.exam_date)})` : e.name }))} />
      </div>
      {!year ? <EmptyState title="No academic year yet." />
        : !cls ? <EmptyState title={`No classes in ${year.name}.`} />
        : !exam || !data ? <EmptyState title="No exams for this class yet.">Create exams on the Subjects & Exams page.</EmptyState>
        : <ResultsView data={data} />}
    </>
  );
}
