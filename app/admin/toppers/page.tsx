import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { getClassOptions } from "@/lib/repo/classes";
import { PageHeader } from "@/components/page-header";
import { ToppersWorkspace } from "@/components/toppers/toppers-workspace";

export const metadata: Metadata = { title: "Toppers" };

export default async function AdminToppersPage({ searchParams }: PageProps<"/admin/toppers">) {
  const user = await requireRole("admin");
  const sp = await searchParams;
  const classes = (await getClassOptions(user)).map((c) => ({ id: c.id, label: c.isCurrent ? c.label : `${c.label} (${c.yearName})` }));
  return (
    <>
      <PageHeader title="Toppers" description="Calculated from the marks and attendance. Assign them to show them on the dashboard and student profiles." />
      <ToppersWorkspace user={user} sp={sp} classes={classes} base="/admin/toppers" canAssign />
    </>
  );
}
