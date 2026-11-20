import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { ChangePasswordForm } from "@/components/account/change-password-form";

export const metadata: Metadata = { title: "Account" };

export default async function AccountPage() {
  const user = await requireRole("teacher");
  return (
    <>
      <PageHeader title="Account" description={`${user.profile.full_name}${user.email ? ` · ${user.email}` : ""}`} />
      <h2 className="mb-3 text-lg font-semibold">Change password</h2>
      <ChangePasswordForm />
    </>
  );
}
