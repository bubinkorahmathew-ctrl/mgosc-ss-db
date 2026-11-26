import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { getTeacherClassContext } from "@/lib/repo/teacher-context";
import { EmptyState, PageHeader } from "@/components/page-header";
import { ToppersWorkspace } from "@/components/toppers/toppers-workspace";

export const metadata: Metadata = { title: "Toppers" };

/** Own classes only, read only: admins confirm toppers. */
export default async function TeacherToppersPage({ searchParams }: PageProps<"/teacher/toppers">) {
  const user = await requireRole("teacher");
  const sp = await searchParams;
  const { classes, selected } = await getTeacherClassContext(user, sp.class);
  if (!selected) return <EmptyState title="No class is assigned to you yet." />;
  return (
    <>
      <PageHeader title="Toppers" description="Calculated from your class's marks and attendance. An admin confirms them." />
      <ToppersWorkspace user={user} sp={{ ...sp, class: selected.id }} classes={classes.map((c) => ({ id: c.id, label: c.label }))}
        base="/teacher/toppers" canAssign={false} />
    </>
  );
}
