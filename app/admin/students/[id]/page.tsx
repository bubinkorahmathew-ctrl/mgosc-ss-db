import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Pencil } from "lucide-react";
import { getStudentProfile } from "@/lib/repo/student-profile";
import { getClassOptions } from "@/lib/repo/classes";
import { requireRole } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { StudentProfileView } from "@/components/students/student-profile-view";
import { StudentAdminActions } from "./student-admin-actions";

export const metadata: Metadata = { title: "Student" };

export default async function AdminStudentPage({ params }: PageProps<"/admin/students/[id]">) {
  const user = await requireRole("headmaster");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [profile, classes] = await Promise.all([getStudentProfile(user, id), getClassOptions(user)]);
  if (!profile) notFound();
  const s = profile.student;

  return (
    <>
      <Link href="/admin/students" className="mb-3 inline-flex min-h-11 items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Students
      </Link>
      <PageHeader title={s.full_name} description={s.full_name_ml ?? undefined}
        actions={
          <>
            <Button variant="outline" render={<Link href={`/admin/students/${s.id}/edit`} />} nativeButton={false}>
              <Pencil /> Edit
            </Button>
            <StudentAdminActions studentId={s.id} studentName={s.full_name} classId={s.class_id} status={s.status}
              canDelete={user.superAdmin}
              classes={classes.map((c) => ({ id: c.id, label: c.isCurrent ? c.label : `${c.label} (${c.yearName})` }))} />
          </>
        } />
      <StudentProfileView profile={profile} />
    </>
  );
}
