"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";
import { saveCharity } from "@/actions/accounting";
import { formatMoney, toCents, type Currency } from "@/lib/money";
import { PAYMENT_MODE_LABELS, PAYMENT_MODES } from "@/lib/validation/accounts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/form/field";

type Person = { id: string; name: string; admissionNo?: string };

const valid = (v: string) => {
  try {
    return v.trim() ? toCents(v.replace(/,/g, "")) : 0;
  } catch {
    return null;
  }
};

/**
 * One amount box per student (and per teacher). Blank means nothing given. Saving makes one
 * receipt per filled box, all in one go: if anything is wrong, nothing is saved.
 */
export function CharityGrid({ classId, date, students, teachers, currency }: {
  classId: string; date: string; students: Person[]; teachers: Person[]; currency: Currency;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [mode, setMode] = useState<(typeof PAYMENT_MODES)[number]>("cash");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const total = useMemo(() => Object.values(amounts).reduce((s, v) => s + (valid(v) ?? 0), 0), [amounts]);
  const filled = Object.values(amounts).filter((v) => v.trim()).length;

  const row = (p: Person, group: "students" | "teachers") => {
    const v = amounts[p.id] ?? "";
    const bad = valid(v) === null || errors[p.id];
    return (
      <li key={p.id} className="flex items-center gap-3 px-3 py-2">
        <label htmlFor={`amt-${p.id}`} className="min-w-0 flex-1 text-sm">
          <span className="font-medium">{p.name}</span>
          {p.admissionNo && <span className="ml-1 text-xs text-muted-foreground">{p.admissionNo}</span>}
        </label>
        <Input id={`amt-${p.id}`} inputMode="decimal" placeholder="0.00" className="w-28 text-right tabular-nums" value={v}
          aria-invalid={!!bad} data-group={group}
          onChange={(e) => { setAmounts((a) => ({ ...a, [p.id]: e.target.value })); setErrors((x) => ({ ...x, [p.id]: "" })); }} />
      </li>
    );
  };

  const save = () => start(async () => {
    const pick = (list: Person[]) => list.map((p) => ({ id: p.id, amount: amounts[p.id] ?? "" }));
    const res = await saveCharity({ receipt_date: date, class_id: classId, payment_mode: mode, students: pick(students), teachers: pick(teachers) });
    if (!res.ok) {
      const next: Record<string, string> = {};
      for (const [key, msgs] of Object.entries(res.fieldErrors ?? {})) {
        const m = /^(students|teachers)\.(\d+)/.exec(key);
        const list = m?.[1] === "teachers" ? teachers : students;
        if (m) next[list[Number(m[2])].id] = msgs[0];
      }
      setErrors(next);
      toast.error(res.error);
      return;
    }
    toast.success(res.message ?? "Saved.");
    setAmounts({});
    router.refresh();
  });

  return (
    <div className="space-y-4">
      <section aria-labelledby="cg-students">
        <h2 id="cg-students" className="mb-2 font-medium">Students</h2>
        {students.length ? <ul className="divide-y rounded-xl border">{students.map((s) => row(s, "students"))}</ul>
          : <p className="text-sm text-muted-foreground">No active students in this class.</p>}
      </section>
      {teachers.length > 0 && (
        <section aria-labelledby="cg-teachers">
          <h2 id="cg-teachers" className="mb-2 font-medium">Teachers</h2>
          <ul className="divide-y rounded-xl border">{teachers.map((t) => row(t, "teachers"))}</ul>
        </section>
      )}
      {Object.values(errors).some(Boolean) && (
        <p role="alert" className="text-sm text-destructive">{Object.values(errors).find(Boolean)}</p>
      )}
      <div className="sticky bottom-0 flex flex-wrap items-center gap-3 border-t bg-background py-3">
        <span className="text-sm">{filled} filled · total <b className="tabular-nums">{formatMoney(total, currency)}</b></span>
        <NativeSelect aria-label="Paid by" className="w-40" value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}>
          {PAYMENT_MODES.map((m) => <option key={m} value={m}>{PAYMENT_MODE_LABELS[m]}</option>)}
        </NativeSelect>
        <Button onClick={save} disabled={pending || !filled} className="ml-auto">
          {pending ? <Loader2 className="animate-spin" /> : <Save />} Save {filled || ""} receipt{filled === 1 ? "" : "s"}
        </Button>
      </div>
    </div>
  );
}
