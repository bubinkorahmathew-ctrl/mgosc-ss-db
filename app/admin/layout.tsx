import { Suspense } from "react";
import { requireRole } from "@/lib/auth";
import { staffName } from "@/lib/permissions";
import { APP_NAME } from "@/lib/config";
import { AppShell } from "@/components/layout/app-shell";
import { ADMIN_NAV, styleNav } from "@/components/layout/nav-config";
import { getNavStyle } from "@/lib/repo/settings";
import { ShellSkeleton } from "@/components/layout/shell-skeleton";

async function AdminShell({ children }: { children: React.ReactNode }) {
  const user = await requireRole("admin");
  const nav = styleNav(ADMIN_NAV, await getNavStyle(user));
  return (
    <AppShell appName={APP_NAME} root="/admin"
      nav={user.superAdmin ? nav : nav.filter((item) => !item.superOnly)}
      userName={staffName(user.profile.full_name, user.profile.designation)} roleLabel={user.superAdmin ? "Super admin" : "Admin"}>
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
