"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ClipboardCheck } from "lucide-react";
import { saveExamAttendance } from "@/actions/teacher";
import { Button } from "@/components/ui/button";
import { EXAM_OPTIONS, StatusSheet, type SheetStudent } from "./status-sheet";

/**
 * Step 1 on the marks page: who sat the exam. Once saved it folds away into a one-line summary;
 * absent students then show AB in the marks grid.
 */
export function ExamAttendancePanel({ examId, students, saved }: {
  examId: string; students: SheetStudent[];
  saved: Record<string, { status: "present" | "absent"; remark: string | null }>;
}) {
  const router = useRouter();
  const taken = students.some((s) => saved[s.id]);
  const [open, setOpen] = useState(!taken);
  const absent = students.filter((s) => saved[s.id]?.status === "absent");

  return (
    <section className="rounded-xl border p-3" aria-labelledby="exam-att">
      <div className="flex flex-wrap items-center gap-2">
        <ClipboardCheck className="size-5 text-primary" aria-hidden />
        <h2 id="exam-att" className="flex-1 font-medium">
          Step 1 · Exam attendance
          {taken && (
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              {students.length - absent.length} present, {absent.length} absent
              {absent.length > 0 && `: ${absent.map((s) => s.name).join(", ")}`}
            </span>
          )}
        </h2>
        {taken && (
          <Button variant="ghost" size="sm" onClick={() => setOpen(!open)} aria-expanded={open}>
            {open ? "Close" : "Change"} <ChevronDown className={open ? "rotate-180" : undefined} />
          </Button>
        )}
      </div>
      {open && (
        <div className="mt-3">
          <StatusSheet title="Who sat this exam?" options={EXAM_OPTIONS} students={students} saved={saved}
            saveLabel="Save exam attendance"
            onSave={async (entries) => {
              const res = await saveExamAttendance({ exam_id: examId, entries });
              if (res.ok) { setOpen(false); router.refresh(); }
              return res;
            }} />
        </div>
      )}
    </section>
  );
}
