import type { Metadata } from "next";
import Link from "next/link";
import { Award } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { getClassOptions } from "@/lib/repo/classes";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { CertificateList } from "@/components/certificates/certificate-list";

export const metadata: Metadata = { title: "Certificates" };

export default async function AdminCertificatesPage({ searchParams }: PageProps<"/admin/certificates">) {
  const user = await requireRole("admin");
  const sp = await searchParams;
  const classes = (await getClassOptions(user)).map((c) => ({ id: c.id, label: c.isCurrent ? c.label : `${c.label} (${c.yearName})` }));
  return (
    <>
      <PageHeader title="Certificates" description="Each certificate has a QR code that anyone can scan to check it is genuine."
        actions={<Button render={<Link href="/admin/certificates/new" />} nativeButton={false}><Award /> Issue certificates</Button>} />
      <CertificateList user={user} sp={sp} classes={classes} canRevoke base="/admin/certificates" />
    </>
  );
}
