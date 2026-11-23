import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Check, Minus, School } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { listAdminAccounts } from "@/lib/authn/admins";
import { listTeacherEmails } from "@/lib/authn/accounts";
import { getDatabase } from "@/lib/db";
import { createDb } from "@/lib/db/client";
import { getClassOptions } from "@/lib/data/classes";
import { RIGHTS, ROLES, type RightLevel } from "@/lib/roles";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";

export const metadata: Metadata = { title: "User rights" };

function Level({ level }: { level: RightLevel }) {
  if (level === "yes") return <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400"><Check className="size-4" /> Yes</span>;
  if (level === "own") return <span className="inline-flex items-center gap-1 text-blue-700 dark:text-blue-400"><School className="size-4" /> Own classes</span>;
  return <span className="inline-flex items-center gap-1 text-muted-foreground"><Minus className="size-4" /> No</span>;
}

/** Super admin only: who has which role, and what each role can do. Read-only. */
export default async function RightsPage() {
  const user = await requireRole("headmaster");
  if (!user.superAdmin) redirect("/admin");
  const database = getDatabase();
  const db = createDb(database, user.id);
  const [admins, teachers, assignments, classes, emails] = await Promise.all([
    listAdminAccounts(database, user.id),
    db.select("profiles", { where: [["role", "eq", "teacher"]], order: [{ column: "active", ascending: false }, { column: "full_name" }] }),
    db.select("class_teachers"),
    getClassOptions({ currentOnly: true }),
    listTeacherEmails(database, user.id),
  ]);
  const classLabel = new Map(classes.map((c) => [c.id, c.label]));

  const people = [
    ...admins.map((a) => ({ id: a.id, name: a.full_name, email: a.email, active: a.active, role: a.superAdmin ? "Super admin" : "Admin", classes: "All" })),
    ...teachers.map((t) => ({
      id: t.id, name: t.full_name, email: emails.get(t.id) ?? "", active: t.active, role: "Teacher",
      classes: assignments.filter((a) => a.teacher_id === t.id).map((a) => classLabel.get(a.class_id)).filter(Boolean).join(", ") || "No class this year",
    })),
  ];

  return (
    <>
      <PageHeader title="User rights" description="What each role can do, and who has which role." />
      <div className="space-y-6">
        <Card>
          <CardHeader><CardTitle>Roles</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <ul className="grid gap-2 sm:grid-cols-3">
              {ROLES.map((r) => (
                <li key={r.key} className="rounded-lg border p-3">
                  <p className="font-medium">{r.label}</p>
                  <p className="text-sm text-muted-foreground">{r.about}</p>
                </li>
              ))}
            </ul>
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th scope="col" className="px-3 py-2 text-left font-medium">Right</th>
                    {ROLES.map((r) => <th key={r.key} scope="col" className="px-3 py-2 text-left font-medium whitespace-nowrap">{r.label}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {RIGHTS.map((r) => (
                    <tr key={r.label}>
                      <th scope="row" className="px-3 py-2 text-left font-normal">{r.label}</th>
                      <td className="px-3 py-2 whitespace-nowrap"><Level level={r.super} /></td>
                      <td className="px-3 py-2 whitespace-nowrap"><Level level={r.admin} /></td>
                      <td className="px-3 py-2 whitespace-nowrap"><Level level={r.teacher} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Users ({people.length})</CardTitle>
            <p className="text-sm text-muted-foreground">
              Add or change accounts on the <Link href="/admin/admins" className="text-primary underline">Admins</Link> and{" "}
              <Link href="/admin/teachers" className="text-primary underline">Teachers</Link> pages.
            </p>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    {["Name", "Email", "Role", "Status", "Classes"].map((h) => <th key={h} scope="col" className="px-3 py-2 text-left font-medium">{h}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {people.map((p) => (
                    <tr key={p.id}>
                      <td className="px-3 py-2 font-medium">{p.name}</td>
                      <td className="px-3 py-2 break-all text-muted-foreground">{p.email}</td>
                      <td className="px-3 py-2 whitespace-nowrap"><Badge variant={p.role === "Teacher" ? "secondary" : "default"}>{p.role}</Badge></td>
                      <td className="px-3 py-2">{p.active ? "Active" : <StatusBadge status="deactivated" />}</td>
                      <td className="px-3 py-2">{p.classes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
