import type { Metadata } from "next";
import { getUploadOptions } from "@/lib/data/upload-options";
import { ImportScreen, parseUploadTab } from "@/components/import/import-screen";

export const metadata: Metadata = { title: "Bulk upload" };

/** The policies limit classes and exams to the teacher's own; the actions check again. */
export default async function TeacherImportPage({ searchParams }: PageProps<"/teacher/import">) {
  const sp = await searchParams;
  const { classes, currentClasses, exams } = await getUploadOptions();
  return (
    <ImportScreen base="/teacher/import" tab={parseUploadTab(sp.tab)}
      studentClasses={currentClasses} classes={classes} exams={exams} />
  );
}
