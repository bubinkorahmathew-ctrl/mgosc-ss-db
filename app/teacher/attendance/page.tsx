import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { AttendanceWorkspace } from "@/components/attendance/attendance-workspace";

export const metadata: Metadata = { title: "Attendance" };

export default async function AttendancePage({ searchParams }: PageProps<"/teacher/attendance">) {
  const user = await requireRole("teacher");
  return <AttendanceWorkspace user={user} sp={await searchParams} admin={false} />;
}
