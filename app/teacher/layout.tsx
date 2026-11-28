import { Suspense } from "react";
import { requireRole } from "@/lib/auth";
import { APP_NAME } from "@/lib/config";
import { AppShell } from "@/components/layout/app-shell";
import { styleNav, TEACHER_NAV } from "@/components/layout/nav-config";
import { getNavStyle } from "@/lib/repo/settings";
import { ShellSkeleton } from "@/components/layout/shell-skeleton";
import { staffName } from "@/lib/permissions";

async function TeacherShell({ children }: { children: React.ReactNode }) {
  const user = await requireRole("teacher");
  return (
    <AppShell appName={APP_NAME} nav={styleNav(TEACHER_NAV, await getNavStyle(user))} root="/teacher"
      userName={staffName(user.profile.full_name, user.profile.designation)} roleLabel="Teacher">
      {children}
    </AppShell>
  );
}

export default function TeacherLayout({ children }: LayoutProps<"/teacher">) {
  return (
    <Suspense fallback={<ShellSkeleton appName={APP_NAME} />}>
      <TeacherShell>{children}</TeacherShell>
    </Suspense>
  );
}
