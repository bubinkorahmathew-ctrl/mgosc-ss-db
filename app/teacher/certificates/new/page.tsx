import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getTeacherClassContext } from "@/lib/data/teacher-context";
import { EmptyState, PageHeader } from "@/components/page-header";
import { IssuePage } from "@/components/certificates/issue-page";

export const metadata: Metadata = { title: "Issue certificates" };

export default async function TeacherIssuePage({ searchParams }: PageProps<"/teacher/certificates/new">) {
  const sp = await searchParams;
  const { classes, selected } = await getTeacherClassContext(sp.class);
  if (!selected) return <EmptyState title="No class is assigned to you yet." />;
  return (
    <>
      <Link href="/teacher/certificates" className="mb-3 inline-flex min-h-11 items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Certificates
      </Link>
      <PageHeader title="Issue certificates" description="Numbers are given automatically. Issued certificates cannot be edited." />
      <IssuePage classes={classes} classId={selected.id} listHref="/teacher/certificates" />
    </>
  );
}
