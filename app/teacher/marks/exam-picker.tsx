"use client";

import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { NativeSelect } from "@/components/form/field";

export function ExamPicker({ exams, selectedId }: { exams: { id: string; label: string }[]; selectedId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  return (
    <div className="mb-4 flex items-center gap-2">
      <label htmlFor="exam" className="shrink-0 text-sm font-medium">Exam</label>
      <NativeSelect id="exam" value={selectedId} className="sm:w-80" onChange={(e) => {
        const next = new URLSearchParams(params.toString());
        next.set("exam", e.target.value);
        start(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
      }}>
        {exams.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
      </NativeSelect>
      {pending && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
    </div>
  );
}
