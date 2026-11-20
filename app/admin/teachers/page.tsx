import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertRole } from "@/lib/auth";
import { getClassOptions } from "@/lib/data/classes";
import { classLabel } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { TeacherDialog, TeacherRowActions } from "./teacher-dialogs";

export const metadata: Metadata = { title: "Teachers" };

export default async function TeachersPage() {
  await assertRole("headmaster"); // page uses the admin client below
  const supabase = await createClient();
  const [{ data: teachers }, classes, usersRes] = await Promise.all([
    supabase.from("profiles")
      .select("id, full_name, phone, active, class_teachers(class_id, classes(name, section, academic_years(is_current)))")
      .eq("role", "teacher").order("active", { ascending: false }).order("full_name"),
    getClassOptions({ currentOnly: true }),
    // emails live in auth.users; only the server (headmaster) reads them
    createAdminClient().auth.admin.listUsers({ perPage: 1000 }),
  ]);
  const emails = new Map((usersRes.data?.users ?? []).map((u) => [u.id, u.email ?? ""]));
  const classOptions = classes.map((c) => ({ id: c.id, label: c.label }));

  return (
    <>
      <PageHeader title="Teachers" description="Create teacher logins and assign classes."
        actions={<TeacherDialog classes={classOptions} />} />
      {!teachers?.length ? (
        <EmptyState title="No teachers yet.">Use “Add teacher” to create the first teacher login.</EmptyState>
      ) : (
        <div className="grid gap-3">
          {teachers.map((t) => {
            const current = (t.class_teachers ?? []).filter((ct) => ct.classes?.academic_years?.is_current);
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
                        ? current.map((ct) => ct.classes && classLabel(ct.classes)).join(", ")
                        : <span className="text-amber-700">No class this year</span>}
                    </p>
                  </div>
                  <TeacherRowActions classes={classOptions}
                    teacher={{ id: t.id, full_name: t.full_name, phone: t.phone ?? "", active: t.active,
                      class_ids: current.map((ct) => ct.class_id) }} />
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
