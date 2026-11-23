import type { Metadata } from "next";
import { assertRole } from "@/lib/auth";
import { listTeacherEmails } from "@/lib/authn/accounts";
import { getDatabase } from "@/lib/db";
import { createDb } from "@/lib/db/client";
import { getClassOptions } from "@/lib/data/classes";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { TeacherDialog, TeacherRowActions } from "./teacher-dialogs";

export const metadata: Metadata = { title: "Teachers" };

export default async function TeachersPage() {
  const user = await assertRole("headmaster");
  const database = getDatabase();
  const db = createDb(database, user.id);
  const [teachers, assignments, classes, emails] = await Promise.all([
    db.select("profiles", {
      where: [["role", "eq", "teacher"]],
      order: [{ column: "active", ascending: false }, { column: "full_name" }],
    }),
    db.select("class_teachers"),
    getClassOptions({ currentOnly: true }),
    // emails live in the users table; only the headmaster can list them
    listTeacherEmails(database, user.id),
  ]);
  const classOptions = classes.map((c) => ({ id: c.id, label: c.label }));

  return (
    <>
      <PageHeader title="Teachers" description="Create teacher logins and assign classes."
        actions={<TeacherDialog classes={classOptions} />} />
      {!teachers.length ? (
        <EmptyState title="No teachers yet.">Use “Add teacher” to create the first teacher login.</EmptyState>
      ) : (
        <div className="grid gap-3">
          {teachers.map((t) => {
            const assigned = new Set(assignments.filter((a) => a.teacher_id === t.id).map((a) => a.class_id));
            const current = classOptions.filter((c) => assigned.has(c.id));
            return (
              <Card key={t.id} size="sm">
                <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 font-medium">
                      {t.full_name} {!t.active && <StatusBadge status="deactivated" />}
                    </p>
                    <p className="truncate text-sm text-muted-foreground">
                      {emails.get(t.id)}{t.phone ? ` · ${t.phone}` : ""}
                    </p>
                    <p className="text-sm">
                      {current.length
                        ? current.map((c) => c.label).join(", ")
                        : <span className="text-amber-700">No class this year</span>}
                    </p>
                  </div>
                  <TeacherRowActions classes={classOptions}
                    teacher={{ id: t.id, full_name: t.full_name, phone: t.phone ?? "", active: t.active,
                      class_ids: current.map((c) => c.id) }} />
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
