import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { teacherDashboard } from "@/lib/repo/dashboard";
import { getNavStyle } from "@/lib/repo/settings";
import { getTeacherClassContext } from "@/lib/repo/teacher-context";
import { formatDate, todayISO } from "@/lib/dates";
import { withClass } from "@/lib/format";
import { EmptyState, PageHeader } from "@/components/page-header";
import { ClassSwitcher } from "@/components/teacher/class-switcher";
import { IconTiles, type Tile } from "@/components/layout/icon-tiles";
import { styleNav, TEACHER_NAV } from "@/components/layout/nav-config";
import { RecentToppers } from "@/components/toppers/recent-toppers";

export const metadata: Metadata = { title: "My class" };

/** Pages that open on the selected class. */
const CLASS_PAGES = new Set(["/teacher/attendance", "/teacher/marks", "/teacher/activities", "/teacher/students", "/teacher/reports", "/teacher/toppers"]);

export default async function TeacherDashboard({ searchParams }: PageProps<"/teacher">) {
  const user = await requireRole("teacher");
  const sp = await searchParams;
  const [{ classes, selected }, style] = await Promise.all([getTeacherClassContext(user, sp.class), getNavStyle(user)]);
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

  const today = todayISO();
  const { boys, girls, attendance: a, activities, exams } = await teacherDashboard(user, selected.id, today);
  const marked = a.present + a.absent + a.late;
  const info: Record<string, Pick<Tile, "sub">> = {
    "/teacher/attendance": { sub: marked ? `Today: ${a.present + a.late}/${marked} present` : "Not marked today" },
    "/teacher/marks": { sub: `${exams} exam${exams === 1 ? "" : "s"}` },
    "/teacher/activities": { sub: `${activities} recorded` },
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
      <RecentToppers user={user} classId={selected.id} href={withClass("/teacher/toppers", selected.id)} studentHref="/teacher/students" />
    </>
  );
}
