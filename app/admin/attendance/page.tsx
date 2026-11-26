import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { AttendanceWorkspace } from "@/components/attendance/attendance-workspace";

export const metadata: Metadata = { title: "Attendance" };

export default async function AdminAttendancePage({ searchParams }: PageProps<"/admin/attendance">) {
  const user = await requireRole("headmaster");
  return <AttendanceWorkspace user={user} sp={await searchParams} admin />;
}
