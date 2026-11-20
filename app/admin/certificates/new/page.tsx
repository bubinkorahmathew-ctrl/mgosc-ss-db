import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getClassOptions } from "@/lib/data/classes";
import { PageHeader } from "@/components/page-header";
import { IssuePage } from "@/components/certificates/issue-page";

export const metadata: Metadata = { title: "Issue certificates" };

export default async function AdminIssuePage({ searchParams }: PageProps<"/admin/certificates/new">) {
  const sp = await searchParams;
  const classes = (await getClassOptions()).map((c) => ({
    id: c.id, yearName: c.yearName, label: c.isCurrent ? c.label : `${c.label} (${c.yearName})`,
  }));
  return (
    <>
      <Link href="/admin/certificates" className="mb-3 inline-flex min-h-11 items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Certificates
      </Link>
      <PageHeader title="Issue certificates" description="Numbers are given automatically (CERT-year-0001). Issued certificates cannot be edited, only revoked." />
      <IssuePage classes={classes} classId={typeof sp.class === "string" ? sp.class : undefined} listHref="/admin/certificates" />
    </>
  );
}
