"use client";

import { useRouter } from "next/navigation";
import { saveAttendance } from "@/actions/teacher";
import { DAILY_OPTIONS, StatusSheet, type SheetStudent } from "./status-sheet";

type Status = "present" | "late" | "absent";

/** A class's attendance for one day. */
export function DaySheet({ classId, date, title, students, saved, readOnly }: {
  classId: string; date: string; title: string; students: SheetStudent[];
  saved: Record<string, { status: Status; remark: string | null }>; readOnly?: string;
}) {
  const router = useRouter();
  return (
    <StatusSheet title={title} options={DAILY_OPTIONS} students={students} saved={saved} readOnly={readOnly}
      onSave={async (entries) => {
        const res = await saveAttendance({ class_id: classId, date, entries });
        if (res.ok) router.refresh();
        return res;
      }} />
  );
}
