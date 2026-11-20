import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getStudentProfile } from "@/lib/data/student-profile";
import { PageHeader } from "@/components/page-header";
import { StudentProfileView } from "@/components/students/student-profile-view";

export const metadata: Metadata = { title: "Student" };

/** Read-only profile. RLS returns nothing for students outside the teacher's classes -> 404. */
export default async function TeacherStudentPage({ params }: PageProps<"/teacher/students/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const profile = await getStudentProfile(id);
  if (!profile) notFound();
  const s = profile.student;

  return (
    <>
      <Link href="/teacher/students" className="mb-3 inline-flex min-h-11 items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Students
      </Link>
      <PageHeader title={s.full_name} description={s.full_name_ml ?? undefined} />
      <StudentProfileView profile={profile} />
    </>
  );
}
