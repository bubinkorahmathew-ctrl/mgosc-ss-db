"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Pencil, UserPlus } from "lucide-react";
import { savePerson } from "@/actions/users";
import { DESIGNATION_LABELS, DESIGNATIONS, ROLE_LABELS, type Designation, type Role } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { CheckboxField, Field, NativeSelect } from "@/components/form/field";

export type PersonForm = {
  id?: string; full_name: string; email: string; role: Role; designation: Designation | ""; phone: string;
  twelfth_passed_year: number | null; admin_access_until: string; active: boolean;
  classes: { class_id: string; is_class_teacher: boolean }[]; hasLogin?: boolean;
};

const EMPTY: PersonForm = {
  full_name: "", email: "", role: "teacher", designation: "teacher", phone: "", twelfth_passed_year: null,
  admin_access_until: "", active: true, classes: [],
};

export function PersonDialog({ person, roles, classes, canEditRole = true }: {
  person?: PersonForm; roles: Role[]; classes: { id: string; label: string }[]; canEditRole?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [v, setV] = useState<PersonForm>(person ?? EMPTY);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const set = <K extends keyof PersonForm>(k: K, value: PersonForm[K]) => setV((x) => ({ ...x, [k]: value }));
  const assigned = new Map(v.classes.map((c) => [c.class_id, c.is_class_teacher]));
  const toggleClass = (id: string, on: boolean) =>
    set("classes", on ? [...v.classes, { class_id: id, is_class_teacher: false }] : v.classes.filter((c) => c.class_id !== id));
  const toggleClassTeacher = (id: string, on: boolean) =>
    set("classes", v.classes.map((c) => (c.class_id === id ? { ...c, is_class_teacher: on } : c)));
  // the person's own role must stay in the list even if the editor couldn't give it
  const roleOptions = roles.includes(v.role) ? roles : [v.role, ...roles];

  const save = () => start(async () => {
    setErrors({});
    const res = await savePerson({ ...v, id: person?.id, email: v.email || null });
    if (!res.ok) { setErrors(res.fieldErrors ?? {}); toast.error(res.error); return; }
    toast.success(res.message ?? "Saved.", { duration: 8000 });
    setOpen(false);
    if (!person) setV(EMPTY);
    router.refresh();
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) { setV(person ?? EMPTY); setErrors({}); } }}>
      <DialogTrigger render={person ? <Button variant="outline" size="sm" /> : <Button />}>
        {person ? <><Pencil /> Edit</> : <><UserPlus /> Add person</>}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{person ? `Edit ${person.full_name}` : "Add person"}</DialogTitle>
          <DialogDescription>
            With an email they get a “Set your password” link (48 hours). Without one this is a teacher profile with no login yet.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id="p-name" label="Name" required error={errors.full_name?.[0]}>
              <Input id="p-name" value={v.full_name} maxLength={120} onChange={(e) => set("full_name", e.target.value)} />
            </Field>
            <Field id="p-designation" label="Designation" hint="Shown next to the name; not a permission">
              <NativeSelect id="p-designation" value={v.designation} onChange={(e) => set("designation", e.target.value as Designation | "")}>
                <option value="">None</option>
                {DESIGNATIONS.map((d) => <option key={d} value={d}>{DESIGNATION_LABELS[d]}</option>)}
              </NativeSelect>
            </Field>
          </div>
          <Field id="p-email" label="Email (used to sign in)" error={errors.email?.[0]}
            hint={person?.hasLogin ? "Changing it changes the sign-in email." : "Leave empty for a teacher profile without a login."}>
            <Input id="p-email" type="email" autoComplete="off" value={v.email} onChange={(e) => set("email", e.target.value)} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id="p-role" label="Role" error={errors.role?.[0]} hint={canEditRole ? undefined : "Only a super admin changes this role."}>
              <NativeSelect id="p-role" value={v.role} disabled={!canEditRole} onChange={(e) => set("role", e.target.value as Role)}>
                {roleOptions.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
              </NativeSelect>
            </Field>
            {v.role === "admin" && (
              <Field id="p-until" label="Admin access until" hint="Empty = permanent. After this day they are a teacher again.">
                <Input id="p-until" type="date" value={v.admin_access_until} onChange={(e) => set("admin_access_until", e.target.value)} />
              </Field>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id="p-phone" label="Phone" error={errors.phone?.[0]}>
              <Input id="p-phone" inputMode="tel" value={v.phone} onChange={(e) => set("phone", e.target.value)} />
            </Field>
            <Field id="p-year" label="12th passed year" error={errors.twelfth_passed_year?.[0]}>
              <Input id="p-year" inputMode="numeric" value={v.twelfth_passed_year ?? ""}
                onChange={(e) => set("twelfth_passed_year", e.target.value ? Number(e.target.value) : null)} />
            </Field>
          </div>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Classes this year</legend>
            {!classes.length ? <p className="text-sm text-muted-foreground">No classes in the current year.</p> : (
              <ul className="divide-y rounded-lg border">
                {classes.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center gap-x-4 px-3 py-2 text-sm">
                    <label className="flex min-h-9 flex-1 items-center gap-2">
                      <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={assigned.has(c.id)}
                        onChange={(e) => toggleClass(c.id, e.target.checked)} /> {c.label}
                    </label>
                    {assigned.has(c.id) && (
                      <label className="flex min-h-9 items-center gap-2 text-muted-foreground">
                        <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={assigned.get(c.id)}
                          onChange={(e) => toggleClassTeacher(c.id, e.target.checked)} /> Class teacher
                      </label>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </fieldset>
          <CheckboxField id="p-active" label="Active (can sign in and is listed)" checked={v.active}
            onChange={(e) => set("active", e.target.checked)} />
          {errors.active?.[0] && <p className="text-sm text-destructive">{errors.active[0]}</p>}
        </div>
        <DialogFooter>
          <Button onClick={save} disabled={pending || !v.full_name.trim()}>
            {pending && <Loader2 className="animate-spin" />} {person ? "Save" : v.email ? "Create and send invite" : "Create profile"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
