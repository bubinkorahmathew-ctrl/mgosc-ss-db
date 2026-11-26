import { Download, FileSpreadsheet, FileText } from "lucide-react";
import type { ExamResults } from "@/lib/repo/results";
import { formatPercent, ordinal } from "@/lib/results";
import { formatDate } from "@/lib/dates";
import { percent } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/page-header";

export function ResultBadge({ result }: { result: string | null }) {
  if (!result) return <span className="text-xs text-muted-foreground">Pending</span>;
  const tone = result === "Pass" ? "bg-emerald-100 text-emerald-900" : result === "Fail" ? "bg-red-100 text-red-900" : "bg-zinc-200 text-zinc-800";
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}>{result}</span>;
}

/** Ranked results of one exam, with PDF report cards and an Excel export. */
export function ResultsView({ data }: { data: ExamResults }) {
  const { exam, subjects, results, attendance } = data;
  const withMarks = results.filter((r) => r.rank !== null);
  const avg = withMarks.length ? withMarks.reduce((s, r) => s + r.percentage!, 0) / withMarks.length : null;
  const pdf = (student?: string) => `/api/pdf/report-cards?exam=${exam.id}${student ? `&student=${student}` : ""}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-xl border bg-muted/30 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm">
          <p className="font-medium">{exam.name} · {data.className} · {data.yearName}</p>
          <p className="text-muted-foreground">
            {exam.exam_date ? `${formatDate(exam.exam_date)} · ` : ""}{withMarks.length} of {results.length} students have marks
            {avg !== null && ` · class average ${formatPercent(Math.round(avg * 100) / 100)}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button render={<a href={pdf()} target="_blank" rel="noopener" />} nativeButton={false} disabled={!results.length}>
            <FileText /> All report cards
          </Button>
          <Button variant="outline" render={<a href={`/api/export/results?exam=${exam.id}`} />} nativeButton={false}>
            <FileSpreadsheet /> Excel
          </Button>
          <Button variant="outline" render={<a href={`/api/export/results?exam=${exam.id}&format=pdf`} target="_blank" rel="noopener" />} nativeButton={false}>
            <FileText /> PDF list
          </Button>
        </div>
      </div>

      {!results.length ? <EmptyState title="There are no students in this class." /> : (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="px-3 py-2 font-medium">Rank</th>
                <th className="sticky left-0 bg-muted/50 px-3 py-2 font-medium">Student</th>
                {subjects.map((s) => (
                  <th key={s.id} className="px-2 py-2 text-right font-medium">
                    {s.name}<div className="text-xs font-normal text-muted-foreground">/{s.max}</div>
                  </th>
                ))}
                <th className="px-3 py-2 text-right font-medium">Total</th>
                <th className="px-3 py-2 text-right font-medium">%</th>
                <th className="px-3 py-2 font-medium">Grade</th>
                <th className="px-3 py-2 font-medium">Result</th>
                <th className="px-3 py-2 text-right font-medium">Attendance</th>
                <th className="px-2 py-2"><span className="sr-only">Report card</span></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {results.map((r) => {
                const a = attendance[r.id];
                return (
                  <tr key={r.id}>
                    <td className="px-3 py-2 font-semibold tabular-nums">{r.rank ? ordinal(r.rank) : "-"}</td>
                    <td className="sticky left-0 bg-background px-3 py-2">
                      <div className="font-medium">{r.name}</div>
                      <div className="text-xs text-muted-foreground">{r.admissionNo}</div>
                    </td>
                    {r.examAbsent ? (
                      <td colSpan={subjects.length + 3} className="px-3 py-2 text-center font-medium text-red-700">Absent for the exam</td>
                    ) : (
                      <>
                        {subjects.map((s) => {
                          const failed = r.failedSubjects.includes(s.id);
                          return (
                            <td key={s.id} className={`px-2 py-2 text-right tabular-nums ${failed ? "font-medium text-red-700" : ""}`}
                              title={failed ? "Below the pass mark" : undefined}>
                              {r.marks[s.id] ?? <span className="text-muted-foreground">-</span>}
                              {r.subjectGrades[s.id] && r.marks[s.id] !== "AB" && (
                                <span className="ml-1 text-xs text-muted-foreground">{r.subjectGrades[s.id]}</span>
                              )}
                            </td>
                          );
                        })}
                        <td className="px-3 py-2 text-right font-medium tabular-nums">{r.subjectsEntered ? `${r.total}/${r.max}` : "-"}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatPercent(r.percentage)}</td>
                        <td className="px-3 py-2 font-semibold">{r.grade ?? "-"}</td>
                      </>
                    )}
                    <td className="px-3 py-2"><ResultBadge result={r.result} /></td>
                    <td className="px-3 py-2 text-right tabular-nums">{a ? percent(a.present + a.late, a.days, 0) : "-"}</td>
                    <td className="px-2 py-1">
                      <Button variant="ghost" size="sm" aria-label={`Report card for ${r.name}`}
                        render={<a href={pdf(r.id)} target="_blank" rel="noopener" />} nativeButton={false}>
                        <Download />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Percentage is over the subjects that have marks; AB (a missed subject) counts as 0. Pass needs every subject at
        or above its pass mark (shown in red when below). Students absent for the exam get no rank; equal percentages
        share a rank. Small letters next to marks are subject grades.
      </p>
    </div>
  );
}
