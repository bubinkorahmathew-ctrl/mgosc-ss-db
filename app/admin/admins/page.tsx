import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { listAdmins } from "@/lib/repo/accounts";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { AddAdminDialog, AdminRowActions } from "./admin-dialogs";

export const metadata: Metadata = { title: "Admins" };

export default async function AdminsPage() {
  const user = await requireRole("headmaster");
  if (!user.superAdmin) redirect("/admin");
  const admins = await listAdmins(user);

  return (
    <>
      <PageHeader title="Admins" description="Admins do all school work. Only a super admin manages admins and settings."
        actions={<AddAdminDialog />} />
      <div className="grid gap-3">
        {admins.map((a) => (
          <Card key={a.id} size="sm">
            <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 font-medium">
                  {a.full_name} {!a.active && <StatusBadge status="deactivated" />}
                </p>
                <p className="truncate text-sm text-muted-foreground">{a.email}</p>
                <p className="text-sm">{a.superAdmin ? "Super admin" : "Admin"}</p>
              </div>
              {!a.superAdmin && <AdminRowActions admin={{ id: a.id, full_name: a.full_name, active: a.active }} />}
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}
