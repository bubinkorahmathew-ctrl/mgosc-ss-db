import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { ChangePasswordForm } from "@/components/account/change-password-form";
import { NotificationsToggle } from "@/components/account/notifications-toggle";
import { getEmailNotifications } from "@/lib/repo/notify";

export const metadata: Metadata = { title: "Account" };

export default async function AccountPage() {
  const user = await requireRole("teacher");
  return (
    <>
      <PageHeader title="Account" description={`${user.profile.full_name}${user.email ? ` · ${user.email}` : ""}`} />
      <h2 className="mb-3 text-lg font-semibold">Change password</h2>
      <ChangePasswordForm />
      <h2 className="mt-8 mb-3 text-lg font-semibold">Emails</h2>
      <NotificationsToggle initial={await getEmailNotifications(user)} about="New students added to your class." />
    </>
  );
}
