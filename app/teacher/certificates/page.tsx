import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { getTeacherClassContext } from "@/lib/repo/teacher-context";
import { EmptyState, PageHeader } from "@/components/page-header";
import { CertificateList } from "@/components/certificates/certificate-list";

export const metadata: Metadata = { title: "Certificates" };

export default async function TeacherCertificatesPage({ searchParams }: PageProps<"/teacher/certificates">) {
  const user = await requireRole("teacher");
  const sp = await searchParams;
  const { classes, selected } = await getTeacherClassContext(user, sp.class);
  if (!selected) return <EmptyState title="No class is assigned to you yet." />;
  return (
    <>
      <PageHeader title="Certificates" description="Certificates for students of your classes. Only admins issue or revoke them." />
      <CertificateList user={user} sp={sp} classes={classes.map((c) => ({ id: c.id, label: c.label }))} canRevoke={false} base="/teacher/certificates" />
    </>
  );
}
