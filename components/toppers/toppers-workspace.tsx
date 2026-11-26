import Link from "next/link";
import { Award, Crown, Search } from "lucide-react";
import type { CurrentUser } from "@/lib/auth";
import { getClassExams } from "@/lib/repo/results";
import { classYearRange, computeToppers, listConfirmedToppers, type TopperQuery } from "@/lib/repo/toppers";
import { formatDate, todayISO } from "@/lib/dates";
import { shiftMonth } from "@/lib/calendar";
import { cn } from "@/lib/utils";
import { toQuery } from "@/lib/validation/reports";
import { isoDate } from "@/lib/validation/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, NativeSelect } from "@/components/form/field";
import { EmptyState } from "@/components/page-header";
import { AssignToppersButton } from "./assign-button";

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const many = (v: string | string[] | undefined) => (Array.isArray(v) ? v : v ? v.split(",") : []).filter(Boolean);
const MODES = [
  { id: "exam", label: "One exam" },
  { id: "annual", label: "Annual result" },
  { id: "attendance", label: "Attendance" },
] as const;
type Mode = (typeof MODES)[number]["id"];

/**
 * Calculated toppers and the top five for a class: for an exam, an annual result, or attendance
 * over a month, the academic year or a chosen period (a term). Admins assign (confirm) them.
 */
export async function ToppersWorkspace({ user, sp, classes, base, canAssign }: {
  user: CurrentUser; sp: SP; classes: { id: string; label: string }[]; base: string; canAssign: boolean;
}) {
  const classId = classes.find((c) => c.id === one(sp.class))?.id ?? classes[0]?.id;
  if (!classId) return <EmptyState title="No classes available." />;
  const mode: Mode = (MODES.find((m) => m.id === one(sp.mode))?.id) ?? "exam";
  const [exams, year] = await Promise.all([getClassExams(user, classId), classYearRange(user, classId)]);
  const today = todayISO();

  // what to compare
  let query: TopperQuery | null = null;
  let period = one(sp.period) || "year";
  const month = /^\d{4}-\d{2}$/.test(one(sp.month)) ? one(sp.month) : today.slice(0, 7);
  let from = isoDate.safeParse(one(sp.from)).success ? one(sp.from) : year?.start_date ?? today;
  let to = isoDate.safeParse(one(sp.to)).success ? one(sp.to) : today;
  if (mode === "exam") {
    const exam = exams.find((e) => e.id === one(sp.exam)) ?? exams[0];
    if (exam) query = { kind: "exam", classId, examId: exam.id };
  } else if (mode === "annual") {
    const chosen = many(sp.exams).filter((id) => exams.some((e) => e.id === id));
    const ids = chosen.length ? chosen : exams.map((e) => e.id);
    if (ids.length) query = { kind: "annual", classId, examIds: ids };
  } else {
    if (period === "month") { from = `${month}-01`; to = `${shiftMonth(month, 1)}-01`; to = new Date(Date.parse(to) - 864e5).toISOString().slice(0, 10); }
    else if (period === "year" && year) { from = year.start_date; to = year.end_date; }
    else period = "custom";
    if (from > to) [from, to] = [to, from];
    query = { kind: "attendance", classId, from, to };
  }

  const [outcome, confirmed] = await Promise.all([
    query ? computeToppers(user, query) : null,
    listConfirmedToppers(user, { classId, limit: 50 }),
  ]);
  const alreadyConfirmed = outcome ? confirmed.some((c) => c.type === outcome.scope.type && c.examId === outcome.scope.exam_id
    && c.periodStart === outcome.scope.period_start && c.periodEnd === outcome.scope.period_end) : false;
  const link = (m: Mode) => `${base}?${toQuery({ class: classId, mode: m })}`;

  return (
    <div className="space-y-4">
      <nav aria-label="Topper type" className="flex gap-1 overflow-x-auto border-b">
        {MODES.map((m) => (
          <Link key={m.id} href={link(m.id)} aria-current={m.id === mode ? "page" : undefined}
            className={cn("min-h-11 shrink-0 border-b-2 px-3 pt-3 text-sm font-medium",
              m.id === mode ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}>
            {m.label}
          </Link>
        ))}
      </nav>

      <form method="get" className="rounded-xl border bg-muted/30 p-4">
        <input type="hidden" name="mode" value={mode} />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field id="tp-class" label="Class">
            <NativeSelect id="tp-class" name="class" defaultValue={classId}>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </NativeSelect>
          </Field>
          {mode === "exam" && (
            <Field id="tp-exam" label="Exam" hint="Press Show after changing the class">
              <NativeSelect id="tp-exam" name="exam" defaultValue={query?.kind === "exam" ? query.examId : ""}>
                {exams.map((e) => <option key={e.id} value={e.id}>{e.exam_date ? `${e.name} (${formatDate(e.exam_date)})` : e.name}</option>)}
              </NativeSelect>
            </Field>
          )}
          {mode === "annual" && (
            <fieldset className="space-y-1 sm:col-span-2 lg:col-span-3">
              <legend className="text-sm font-medium">Exams to combine</legend>
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {exams.map((e) => (
                  <label key={e.id} className="flex min-h-9 items-center gap-2 text-sm">
                    <input type="checkbox" name="exams" value={e.id} className="size-4 accent-[var(--primary)]"
                      defaultChecked={query?.kind === "annual" && query.examIds.includes(e.id)} />
                    {e.name}{e.weight !== 1 && <span className="text-xs text-muted-foreground">(weight {e.weight})</span>}
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          {mode === "attendance" && (
            <>
              <Field id="tp-period" label="Period">
                <NativeSelect id="tp-period" name="period" defaultValue={period}>
                  <option value="year">Academic year</option>
                  <option value="month">A month</option>
                  <option value="custom">From – to (a term)</option>
                </NativeSelect>
              </Field>
              <Field id="tp-month" label="Month" hint="For “A month”">
                <Input id="tp-month" name="month" type="month" defaultValue={month} />
              </Field>
              <Field id="tp-from" label="From" hint="For “From – to”"><Input id="tp-from" name="from" type="date" defaultValue={from} /></Field>
              <Field id="tp-to" label="To"><Input id="tp-to" name="to" type="date" defaultValue={to} /></Field>
            </>
          )}
        </div>
        <Button type="submit" className="mt-3"><Search /> Show</Button>
      </form>

      {!query ? <EmptyState title="No exams for this class yet." /> : !outcome ? <EmptyState title="Not available." /> : (
        <section className="space-y-3 rounded-xl border p-4" aria-labelledby="tp-result">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 id="tp-result" className="font-semibold">{outcome.title}</h2>
              {outcome.scope.type === "attendance" && (
                <p className="text-sm text-muted-foreground">{formatDate(outcome.scope.period_start)} to {formatDate(outcome.scope.period_end)}</p>
              )}
            </div>
            {canAssign && outcome.toppers.length > 0 && query && (
              <AssignToppersButton query={query} names={outcome.toppers.map((t) => t.name)} replaces={alreadyConfirmed} />
            )}
          </div>
          {outcome.note && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-950">{outcome.note}</p>}
          {outcome.toppers.length > 0 && (
            <div className="flex flex-wrap gap-3">
              {outcome.toppers.map((t) => (
                <div key={t.id} className="flex items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3">
                  <Crown className="size-6 text-amber-600" aria-hidden />
                  <div>
                    <p className="font-semibold">{t.name}{outcome.toppers.length > 1 && <span className="ml-1 text-xs font-normal">(joint)</span>}</p>
                    <p className="text-sm text-muted-foreground">{t.admissionNo} · {t.value}%</p>
                  </div>
                </div>
              ))}
            </div>
          )}
          {outcome.top.length > 0 && (
            <div>
              <h3 className="mb-1 text-sm font-medium">Top 5</h3>
              <ol className="divide-y rounded-lg border text-sm">
                {outcome.top.map((t) => (
                  <li key={t.id} className="flex items-center gap-3 px-3 py-2">
                    <span className="w-6 font-semibold tabular-nums">{t.place}</span>
                    <span className="flex-1">{t.name} <span className="text-xs text-muted-foreground">{t.admissionNo}</span></span>
                    <span className="font-medium tabular-nums">{t.value}%</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            {outcome.scope.type === "marks"
              ? "Only students who sat the exam and passed every subject can be toppers. Equal percentages give joint toppers."
              : "Attendance % = (present + late) ÷ days attendance was taken × 100. Equal percentages give joint toppers."}
          </p>
        </section>
      )}

      <section aria-labelledby="tp-confirmed" className="space-y-2">
        <h2 id="tp-confirmed" className="font-semibold">Confirmed toppers of this class</h2>
        {!confirmed.length ? <p className="text-sm text-muted-foreground">None yet.</p> : (
          <ul className="divide-y rounded-xl border text-sm">
            {confirmed.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
                <span><b>{t.student}</b> · {t.type === "marks" ? "Class topper" : "Attendance topper"} · {t.what}
                  <span className="text-muted-foreground"> · {formatDate(t.periodStart)}{t.periodEnd !== t.periodStart ? ` to ${formatDate(t.periodEnd)}` : ""}</span></span>
                <span className="flex items-center gap-2">
                  <span className="font-medium tabular-nums">{t.value}%</span>
                  {canAssign && (
                    <Button variant="outline" size="sm" nativeButton={false}
                      render={<Link href={`/admin/certificates/new?topper=${t.id}`} />}>
                      <Award /> Issue certificate
                    </Button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
