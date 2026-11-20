import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Pencil } from "lucide-react";
import { getStudentProfile } from "@/lib/data/student-profile";
import { getClassOptions } from "@/lib/data/classes";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { StudentProfileView } from "@/components/students/student-profile-view";
import { StudentAdminActions } from "./student-admin-actions";

export const metadata: Metadata = { title: "Student" };

export default async function AdminStudentPage({ params }: PageProps<"/admin/students/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [profile, classes] = await Promise.all([getStudentProfile(id), getClassOptions()]);
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
            <StudentAdminActions studentId={s.id} classId={s.class_id} status={s.status}
              classes={classes.map((c) => ({ id: c.id, label: c.isCurrent ? c.label : `${c.label} (${c.yearName})` }))} />
          </>
        } />
      <StudentProfileView profile={profile} />
    </>
  );
}
