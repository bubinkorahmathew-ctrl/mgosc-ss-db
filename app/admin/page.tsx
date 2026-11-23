import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/db/server";
import { formatDate, todayISO } from "@/lib/dates";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Dashboard" };

export default async function AdminDashboard() {
  const dbc = await createClient();
  const today = todayISO();

  const [{ data: classes }, { data: students }, { count: pending }, { data: attendance }] = await Promise.all([
    dbc.from("classes")
      .select("id, name, section, academic_years!inner(is_current)")
      .eq("academic_years.is_current", true).order("name"),
    dbc.from("students").select("class_id").eq("status", "active"),
    dbc.from("registrations").select("id", { count: "exact", head: true }).eq("status", "pending"),
    dbc.from("attendance").select("class_id, status").eq("date", today),
  ]);

  const perClass = new Map<string, number>();
  for (const s of students ?? []) if (s.class_id) perClass.set(s.class_id, (perClass.get(s.class_id) ?? 0) + 1);
  const att = { present: 0, absent: 0, late: 0 };
  for (const a of attendance ?? []) att[a.status]++;
  const marked = att.present + att.absent + att.late;

  return (
    <>
      <PageHeader title="Dashboard" description={`Today is ${formatDate(today)}`} />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader><CardTitle className="text-sm text-muted-foreground">Active students</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-semibold">{students?.length ?? 0}</p></CardContent>
        </Card>
        <Link href="/admin/registrations" className="rounded-xl focus-visible:ring-3 focus-visible:ring-ring/50">
          <Card className="h-full transition-colors hover:bg-muted/50">
            <CardHeader><CardTitle className="text-sm text-muted-foreground">Pending registrations</CardTitle></CardHeader>
            <CardContent><p className="text-3xl font-semibold">{pending ?? 0}</p></CardContent>
          </Card>
        </Link>
        <Card>
          <CardHeader><CardTitle className="text-sm text-muted-foreground">Today&apos;s attendance</CardTitle></CardHeader>
          <CardContent>
            {marked === 0 ? (
              <p className="text-sm text-muted-foreground">Not marked yet today.</p>
            ) : (
              <p className="text-sm">
                <span className="text-2xl font-semibold text-emerald-700">{att.present}</span> present ·{" "}
                <span className="font-semibold text-amber-700">{att.late}</span> late ·{" "}
                <span className="font-semibold text-red-700">{att.absent}</span> absent
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <h2 className="mt-8 mb-3 text-lg font-semibold">Students per class</h2>
      {!classes?.length ? (
        <EmptyState title="No classes for the current academic year yet." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {classes.map((c) => (
            <Card key={c.id} size="sm">
              <CardContent className="flex items-center justify-between">
                <span className="font-medium">{c.name}{c.section ? ` - ${c.section}` : ""}</span>
                <span className="text-xl font-semibold">{perClass.get(c.id) ?? 0}</span>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
