import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { getClassOptions } from "@/lib/repo/classes";
import { getClassStudents } from "@/lib/repo/teacher-context";
import { EmptyState, PageHeader } from "@/components/page-header";
import { UrlSelect } from "@/components/form/url-select";
import { PromotionForm } from "./promotion-form";

export const metadata: Metadata = { title: "Promotion" };

export default async function PromotionPage({ searchParams }: PageProps<"/admin/promotion">) {
  const user = await requireRole("headmaster");
  const sp = await searchParams;
  const all = await getClassOptions(user);
  const opt = (c: (typeof all)[number]) => ({ value: c.id, label: `${c.label} (${c.yearName})` });
  const from = all.find((c) => c.id === sp.from) ?? all.find((c) => c.isCurrent) ?? all[0];
  const students = from ? await getClassStudents(user, from.id) : [];
  // suggest classes of the next academic year first, then same year, then older years
  const rank = (c: (typeof all)[number]) =>
    !from ? 0 : c.yearStart > from.yearStart ? 0 : c.academic_year_id === from.academic_year_id ? 1 : 2;
  const targets = all.filter((c) => c.id !== from?.id)
    .sort((a, b) => rank(a) - rank(b) || a.yearStart.localeCompare(b.yearStart)
      || a.label.localeCompare(b.label, undefined, { numeric: true }));
  const hasLaterYear = !!from && all.some((c) => c.yearStart > from.yearStart);

  return (
    <>
      <PageHeader title="Promotion"
        description="Move a class to next year's class at the end of the year. Untick students who are held back; they stay in their class." />
      {!from ? <EmptyState title="No classes yet." /> : (
        <>
          <UrlSelect id="pr-from" label="Move students from" param="from" value={from.id} className="mb-4 sm:w-80"
            options={all.map(opt)} />
          {!students.length ? <EmptyState title="There are no active students in this class." /> : (
            <PromotionForm key={from.id} fromId={from.id} fromLabel={opt(from).label}
              students={students.map((s) => ({ id: s.id, name: s.full_name, admissionNo: s.admission_no }))}
              targets={targets.map(opt)}
              hasLaterYear={hasLaterYear} />
          )}
        </>
      )}
    </>
  );
}
