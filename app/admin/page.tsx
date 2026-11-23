import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/db/server";
import { getNavStyle } from "@/lib/data/settings";
import { formatDate, todayISO } from "@/lib/dates";
import { PageHeader } from "@/components/page-header";
import { IconTiles, type Tile } from "@/components/layout/icon-tiles";
import { ADMIN_NAV, styleNav } from "@/components/layout/nav-config";

export const metadata: Metadata = { title: "Dashboard" };

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export default async function AdminDashboard() {
  const user = await requireRole("headmaster");
  const dbc = await createClient();
  const today = todayISO();

  const [style, { data: classes }, { count: students }, { count: pending }, { data: attendance }, { count: teachers }, { count: exams }] =
    await Promise.all([
      getNavStyle(),
      dbc.from("classes").select("id, academic_years!inner(is_current)").eq("academic_years.is_current", true),
      dbc.from("students").select("id", { count: "exact", head: true }).eq("status", "active"),
      dbc.from("registrations").select("id", { count: "exact", head: true }).eq("status", "pending"),
      dbc.from("attendance").select("status").eq("date", today),
      dbc.from("profiles").select("id", { count: "exact", head: true }).eq("role", "teacher").eq("active", true),
      dbc.from("exams").select("id", { count: "exact", head: true }),
    ]);

  const att = { present: 0, absent: 0, late: 0 };
  for (const a of attendance ?? []) att[a.status]++;
  const marked = att.present + att.absent + att.late;

  const info: Record<string, Pick<Tile, "sub" | "badge">> = {
    "/admin/registrations": { sub: pending ? `${pending} waiting` : "None waiting", badge: pending ?? 0 },
    "/admin/students": { sub: `${students ?? 0} active` },
    "/admin/classes": { sub: `${plural(classes?.length ?? 0, "class", "classes")} this year` },
    "/admin/teachers": { sub: `${teachers ?? 0} active` },
    "/admin/exams": { sub: plural(exams ?? 0, "exam") },
    "/admin/reports": { sub: marked ? `Today: ${att.present + att.late}/${marked} present` : "No attendance today" },
  };
  const tiles: Tile[] = styleNav(ADMIN_NAV, style)
    .filter((n) => n.href !== "/admin" && (user.superAdmin || !n.superOnly))
    .map((n) => ({ href: n.href, label: n.label, icon: n.icon, color: n.color, ...info[n.href] }));

  return (
    <>
      <PageHeader title={`Hello, ${user.profile.full_name}`} description={`Today is ${formatDate(today)}`} />
      <IconTiles tiles={tiles} />
    </>
  );
}
