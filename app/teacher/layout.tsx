import { Suspense } from "react";
import { requireRole } from "@/lib/auth";
import { APP_NAME } from "@/lib/config";
import { AppShell } from "@/components/layout/app-shell";
import { TEACHER_NAV } from "@/components/layout/nav-config";
import { ShellSkeleton } from "@/components/layout/shell-skeleton";

async function TeacherShell({ children }: { children: React.ReactNode }) {
  const user = await requireRole("teacher");
  return (
    <AppShell appName={APP_NAME} nav={TEACHER_NAV} root="/teacher"
      userName={user.profile.full_name} roleLabel="Teacher">
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
