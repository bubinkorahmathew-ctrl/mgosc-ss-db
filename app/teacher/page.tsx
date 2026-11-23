import type { Metadata } from "next";
import Link from "next/link";
import { CalendarCheck, PencilLine, Sparkles, Users } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/db/server";
import { getTeacherClassContext } from "@/lib/data/teacher-context";
import { formatDate, todayISO } from "@/lib/dates";
import { withClass } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/page-header";
import { ClassSwitcher } from "@/components/teacher/class-switcher";

export const metadata: Metadata = { title: "My class" };

export default async function TeacherDashboard({ searchParams }: PageProps<"/teacher">) {
  const user = await requireRole("teacher");
  const sp = await searchParams;
  const { classes, selected } = await getTeacherClassContext(sp.class);

  if (!selected) {
    return (
      <>
        <PageHeader title={`Hello, ${user.profile.full_name}`} />
        <EmptyState title="No class is assigned to you yet.">Please ask the headmaster to assign your class.</EmptyState>
      </>
    );
  }

  const dbc = await createClient();
  const today = todayISO();
  const [{ data: students }, { data: att }, { count: activities }, { count: exams }] = await Promise.all([
    dbc.from("students").select("gender").eq("class_id", selected.id).eq("status", "active"),
    dbc.from("attendance").select("status").eq("class_id", selected.id).eq("date", today),
    dbc.from("activities").select("id", { count: "exact", head: true }).eq("class_id", selected.id),
    dbc.from("exams").select("id", { count: "exact", head: true }).eq("class_id", selected.id),
  ]);
  const boys = (students ?? []).filter((s) => s.gender === "male").length;
  const girls = (students ?? []).length - boys;
  const a = { present: 0, absent: 0, late: 0 };
  for (const r of att ?? []) a[r.status]++;
  const marked = a.present + a.absent + a.late;

  const tiles = [
    { href: "/teacher/attendance", icon: CalendarCheck, title: "Attendance",
      body: marked ? `Today: ${a.present} present, ${a.late} late, ${a.absent} absent` : "Not marked today" },
    { href: "/teacher/marks", icon: PencilLine, title: "Marks", body: `${exams ?? 0} exam${exams === 1 ? "" : "s"}` },
    { href: "/teacher/activities", icon: Sparkles, title: "Activities", body: `${activities ?? 0} recorded` },
    { href: "/teacher/students", icon: Users, title: "Students", body: `${boys} boys · ${girls} girls` },
  ];

  return (
    <>
      <PageHeader title={`Hello, ${user.profile.full_name}`} description={`${selected.label} · ${formatDate(today)}`} />
      <ClassSwitcher classes={classes} selectedId={selected.id} />
      <div className="grid gap-3 sm:grid-cols-2">
        {tiles.map((t) => (
          <Link key={t.href} href={withClass(t.href, selected.id)} className="rounded-xl focus-visible:ring-3 focus-visible:ring-ring/50">
            <Card className="h-full transition-colors hover:bg-muted/50 active:bg-muted">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><t.icon className="size-5 text-primary" /> {t.title}</CardTitle>
              </CardHeader>
              <CardContent><p className="text-sm text-muted-foreground">{t.body}</p></CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </>
  );
}
