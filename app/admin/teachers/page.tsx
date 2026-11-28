import type { Metadata } from "next";
import { assertRole } from "@/lib/auth";
import { teachersPage } from "@/lib/repo/accounts";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { TeacherDialog, TeacherRowActions } from "./teacher-dialogs";
import { ChangeRoleButton } from "../admins/admin-dialogs";

export const metadata: Metadata = { title: "Teachers" };

export default async function TeachersPage() {
  const user = await assertRole("headmaster");
  const { teachers, assignments, classes, emails } = await teachersPage(user);
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
                      {t.twelfth_passed_year ? ` · 12th passed ${t.twelfth_passed_year}` : ""}
                    </p>
                    <p className="text-sm">
                      {current.length
                        ? current.map((c) => c.label).join(", ")
                        : <span className="text-amber-700">No class this year</span>}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <TeacherRowActions classes={classOptions}
                      teacher={{ id: t.id, full_name: t.full_name, email: emails.get(t.id) ?? "", phone: t.phone ?? "",
                        twelfth_passed_year: t.twelfth_passed_year, active: t.active,
                        class_ids: current.map((c) => c.id) }} />
                    {user.superAdmin && t.active && <ChangeRoleButton id={t.id} name={t.full_name} to="headmaster" />}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
