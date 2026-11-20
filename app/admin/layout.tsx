import { Suspense } from "react";
import { requireRole } from "@/lib/auth";
import { APP_NAME } from "@/lib/config";
import { AppShell } from "@/components/layout/app-shell";
import { ADMIN_NAV } from "@/components/layout/nav-config";
import { ShellSkeleton } from "@/components/layout/shell-skeleton";

async function AdminShell({ children }: { children: React.ReactNode }) {
  const user = await requireRole("headmaster");
  return (
    <AppShell appName={APP_NAME} nav={ADMIN_NAV} root="/admin"
      userName={user.profile.full_name} roleLabel="Headmaster">
      {children}
    </AppShell>
  );
}

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <Suspense fallback={<ShellSkeleton appName={APP_NAME} />}>
      <AdminShell>{children}</AdminShell>
    </Suspense>
  );
}
