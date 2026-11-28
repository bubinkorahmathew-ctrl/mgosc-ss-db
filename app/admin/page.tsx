import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { adminDashboard } from "@/lib/repo/dashboard";
import { getNavStyle } from "@/lib/repo/settings";
import { formatDate, todayISO } from "@/lib/dates";
import { PageHeader } from "@/components/page-header";
import { IconTiles, type Tile } from "@/components/layout/icon-tiles";
import { ADMIN_NAV, styleNav } from "@/components/layout/nav-config";
import { RecentToppers } from "@/components/toppers/recent-toppers";

export const metadata: Metadata = { title: "Dashboard" };

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export default async function AdminDashboard() {
  const user = await requireRole("admin");
  const today = todayISO();
  const [style, d] = await Promise.all([getNavStyle(user), adminDashboard(user, today)]);
  const { pending, students, classes, teachers, exams, attendance: att } = d;
  const marked = att.present + att.absent + att.late;
  const info: Record<string, Pick<Tile, "sub" | "badge">> = {
    "/admin/registrations": { sub: pending ? `${pending} waiting` : "None waiting", badge: pending },
    "/admin/students": { sub: `${students} active` },
    "/admin/classes": { sub: `${plural(classes, "class", "classes")} this year` },
    "/admin/users": { sub: `${teachers} active teachers` },
    "/admin/exams": { sub: plural(exams, "exam") },
    "/admin/reports": { sub: marked ? `Today: ${att.present + att.late}/${marked} present` : "No attendance today" },
  };
  const tiles: Tile[] = styleNav(ADMIN_NAV, style)
    .filter((n) => n.href !== "/admin" && (user.superAdmin || !n.superOnly))
    .map((n) => ({ href: n.href, label: n.label, icon: n.icon, color: n.color, ...info[n.href] }));

  return (
    <>
      <PageHeader title={`Hello, ${user.profile.full_name}`} description={`Today is ${formatDate(today)}`} />
      <IconTiles tiles={tiles} />
      <RecentToppers user={user} href="/admin/toppers" studentHref="/admin/students" />
    </>
  );
}
