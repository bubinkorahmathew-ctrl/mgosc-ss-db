import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { getUploadOptions } from "@/lib/repo/upload-options";
import { ImportScreen, parseUploadTab } from "@/components/import/import-screen";

export const metadata: Metadata = { title: "Bulk upload" };

export default async function AdminImportPage({ searchParams }: PageProps<"/admin/import">) {
  const user = await requireRole("admin");
  const sp = await searchParams;
  const { classes, exams } = await getUploadOptions(user);
  return (
    <ImportScreen base="/admin/import" tab={parseUploadTab(sp.tab)} allowNoClass
      studentClasses={classes} classes={classes} exams={exams} />
  );
}
