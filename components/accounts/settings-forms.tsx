"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Plus, Save } from "lucide-react";
import { saveCategory, saveCurrency, saveOpeningBalance } from "@/actions/accounting";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, NativeSelect } from "@/components/form/field";

function useSave() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>, after?: () => void) => start(async () => {
    const res = await fn();
    if (!res.ok) { toast.error(res.error ?? "Could not save."); return; }
    toast.success(res.message ?? "Saved.");
    after?.();
    router.refresh();
  });
  return { pending, run };
}

/** One row per category: rename, switch on/off. */
export function CategoryRow({ category }: { category: { id: string; name: string; type: "income" | "expense"; active: boolean } }) {
  const [name, setName] = useState(category.name);
  const [active, setActive] = useState(category.active);
  const { pending, run } = useSave();
  const changed = name !== category.name || active !== category.active;
  return (
    <li className="flex flex-wrap items-center gap-2 py-2">
      <Input aria-label="Category name" className="min-w-40 flex-1" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
      <label className="flex min-h-9 items-center gap-2 text-sm">
        <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={active} onChange={(e) => setActive(e.target.checked)} /> In use
      </label>
      <Button size="sm" variant="outline" disabled={!changed || pending}
        onClick={() => run(() => saveCategory({ id: category.id, name, type: category.type, active }))}>
        {pending ? <Loader2 className="animate-spin" /> : <Save />} Save
      </Button>
    </li>
  );
}

export function AddCategory() {
  const [name, setName] = useState("");
  const [type, setType] = useState<"income" | "expense">("income");
  const { pending, run } = useSave();
  return (
    <div className="flex flex-wrap items-end gap-2">
      <Field id="nc-name" label="New category" className="min-w-40 flex-1">
        <Input id="nc-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field id="nc-type" label="Type">
        <NativeSelect id="nc-type" value={type} onChange={(e) => setType(e.target.value as typeof type)}>
          <option value="income">Income</option>
          <option value="expense">Expense</option>
        </NativeSelect>
      </Field>
      <Button disabled={!name.trim() || pending} onClick={() => run(() => saveCategory({ name, type, active: true }), () => setName(""))}>
        {pending ? <Loader2 className="animate-spin" /> : <Plus />} Add
      </Button>
    </div>
  );
}

export function OpeningBalanceForm({ today }: { today: string }) {
  const [date, setDate] = useState(today);
  const [cash, setCash] = useState("");
  const [bank, setBank] = useState("");
  const { pending, run } = useSave();
  return (
    <div className="grid gap-3 sm:grid-cols-4 sm:items-end">
      <Field id="ob-date" label="As on (start of the day)"><Input id="ob-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      <Field id="ob-cash" label="Cash in hand"><Input id="ob-cash" inputMode="decimal" placeholder="0.00" value={cash} onChange={(e) => setCash(e.target.value)} /></Field>
      <Field id="ob-bank" label="Bank balance"><Input id="ob-bank" inputMode="decimal" placeholder="0.00" value={bank} onChange={(e) => setBank(e.target.value)} /></Field>
      <Button disabled={pending} onClick={() => run(() => saveOpeningBalance({ as_on_date: date, cash, bank }))}>
        {pending ? <Loader2 className="animate-spin" /> : <Save />} Save
      </Button>
    </div>
  );
}

export function CurrencyForm({ code, symbol }: { code: string; symbol: string }) {
  const [c, setC] = useState(code);
  const [s, setS] = useState(symbol);
  const { pending, run } = useSave();
  return (
    <div className="grid gap-3 sm:grid-cols-3 sm:items-end">
      <Field id="cur-code" label="Currency code" hint="3 letters, e.g. SAR"><Input id="cur-code" value={c} maxLength={3} onChange={(e) => setC(e.target.value)} /></Field>
      <Field id="cur-sym" label="Symbol shown before amounts"><Input id="cur-sym" value={s} maxLength={8} onChange={(e) => setS(e.target.value)} /></Field>
      <Button disabled={pending} onClick={() => run(() => saveCurrency({ currency_code: c, currency_symbol: s }))}>
        {pending ? <Loader2 className="animate-spin" /> : <Save />} Save
      </Button>
    </div>
  );
}
