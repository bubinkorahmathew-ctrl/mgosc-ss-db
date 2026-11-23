import type { Metadata } from "next";
import { getUploadOptions } from "@/lib/data/upload-options";
import { ImportScreen, parseUploadTab } from "@/components/import/import-screen";

export const metadata: Metadata = { title: "Bulk upload" };

export default async function AdminImportPage({ searchParams }: PageProps<"/admin/import">) {
  const sp = await searchParams;
  const { classes, exams } = await getUploadOptions();
  return (
    <ImportScreen base="/admin/import" tab={parseUploadTab(sp.tab)} allowNoClass
      studentClasses={classes} classes={classes} exams={exams} />
  );
}
