import type { Metadata } from "next";
import Link from "next/link";
import { Award } from "lucide-react";
import { getTeacherClassContext } from "@/lib/data/teacher-context";
import { withClass } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader } from "@/components/page-header";
import { CertificateList } from "@/components/certificates/certificate-list";

export const metadata: Metadata = { title: "Certificates" };

export default async function TeacherCertificatesPage({ searchParams }: PageProps<"/teacher/certificates">) {
  const sp = await searchParams;
  const { classes, selected } = await getTeacherClassContext(sp.class);
  if (!selected) return <EmptyState title="No class is assigned to you yet." />;
  return (
    <>
      <PageHeader title="Certificates" description="Certificates for students of your classes. Ask the headmaster if one needs to be revoked."
        actions={<Button render={<Link href={withClass("/teacher/certificates/new", selected.id)} />} nativeButton={false}><Award /> Issue certificates</Button>} />
      <CertificateList sp={sp} classes={classes.map((c) => ({ id: c.id, label: c.label }))} canRevoke={false} base="/teacher/certificates" />
    </>
  );
}
