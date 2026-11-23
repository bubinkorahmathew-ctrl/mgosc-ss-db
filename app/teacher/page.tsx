import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/db/server";
import { getNavStyle } from "@/lib/data/settings";
import { getTeacherClassContext } from "@/lib/data/teacher-context";
import { formatDate, todayISO } from "@/lib/dates";
import { withClass } from "@/lib/format";
import { EmptyState, PageHeader } from "@/components/page-header";
import { ClassSwitcher } from "@/components/teacher/class-switcher";
import { IconTiles, type Tile } from "@/components/layout/icon-tiles";
import { styleNav, TEACHER_NAV } from "@/components/layout/nav-config";

export const metadata: Metadata = { title: "My class" };

/** Pages that open on the selected class. */
const CLASS_PAGES = new Set(["/teacher/attendance", "/teacher/marks", "/teacher/activities", "/teacher/students", "/teacher/reports"]);

export default async function TeacherDashboard({ searchParams }: PageProps<"/teacher">) {
  const user = await requireRole("teacher");
  const sp = await searchParams;
  const [{ classes, selected }, style] = await Promise.all([getTeacherClassContext(sp.class), getNavStyle()]);
  const nav = styleNav(TEACHER_NAV, style).filter((n) => n.href !== "/teacher");

  if (!selected) {
    const tiles: Tile[] = nav.filter((n) => n.href === "/teacher/account")
      .map((n) => ({ href: n.href, label: n.label, icon: n.icon, color: n.color }));
    return (
      <>
        <PageHeader title={`Hello, ${user.profile.full_name}`} />
        <EmptyState title="No class is assigned to you yet.">Please ask the headmaster to assign your class.</EmptyState>
        <div className="mt-6"><IconTiles tiles={tiles} /></div>
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

  const info: Record<string, Pick<Tile, "sub">> = {
    "/teacher/attendance": { sub: marked ? `Today: ${a.present + a.late}/${marked} present` : "Not marked today" },
    "/teacher/marks": { sub: `${exams ?? 0} exam${exams === 1 ? "" : "s"}` },
    "/teacher/activities": { sub: `${activities ?? 0} recorded` },
    "/teacher/students": { sub: `${boys} boys · ${girls} girls` },
  };
  const tiles: Tile[] = nav.map((n) => ({
    href: CLASS_PAGES.has(n.href) ? withClass(n.href, selected.id) : n.href,
    label: n.label, icon: n.icon, color: n.color, ...info[n.href],
  }));

  return (
    <>
      <PageHeader title={`Hello, ${user.profile.full_name}`} description={`${selected.label} · ${formatDate(today)}`} />
      <ClassSwitcher classes={classes} selectedId={selected.id} />
      <IconTiles tiles={tiles} />
    </>
  );
}
