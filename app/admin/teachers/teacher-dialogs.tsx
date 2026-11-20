"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Copy, KeyRound, Loader2, Pencil, UserCheck, UserPlus, UserX } from "lucide-react";
import { createTeacher, resetTeacherPassword, setTeacherActive, updateTeacher } from "@/actions/teachers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { CheckboxField, Field } from "@/components/form/field";

type Option = { id: string; label: string };
type Teacher = { id: string; full_name: string; phone: string; active: boolean; class_ids: string[] };

/** Shows a temporary password once, with copy + share text. */
function CredentialsBox({ email, password }: { email?: string; password: string }) {
  const text = `${email ? `Email: ${email}\n` : ""}Temporary password: ${password}\nSign in at ${window.location.origin}/login and change your password under Account.`;
  return (
    <div className="space-y-3">
      <div className="rounded-lg border bg-muted/40 p-3 font-mono text-sm break-all">
        {email && <p>Email: {email}</p>}
        <p>Password: <span className="font-semibold">{password}</span></p>
      </div>
      <p className="text-sm text-muted-foreground">
        Copy this now and send it to the teacher (e.g. by WhatsApp). It will not be shown again.
      </p>
      <Button variant="outline" className="w-full" onClick={async () => {
        try { await navigator.clipboard.writeText(text); toast.success("Copied."); }
        catch { toast.error("Could not copy. Please write it down."); }
      }}>
        <Copy /> Copy login details
      </Button>
    </div>
  );
}

function ClassCheckboxes({ classes, value, onChange }: { classes: Option[]; value: string[]; onChange: (v: string[]) => void }) {
  if (!classes.length) return <p className="text-sm text-muted-foreground">No classes in the current year yet.</p>;
  return (
    <div className="grid max-h-52 gap-2 overflow-y-auto">
      {classes.map((c) => (
        <CheckboxField key={c.id} id={`c-${c.id}`} label={c.label} checked={value.includes(c.id)}
          onChange={() => onChange(value.includes(c.id) ? value.filter((x) => x !== c.id) : [...value, c.id])} />
      ))}
    </div>
  );
}

export function TeacherDialog({ classes, teacher }: { classes: Option[]; teacher?: Teacher }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [fullName, setFullName] = useState(teacher?.full_name ?? "");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState(teacher?.phone ?? "");
  const [classIds, setClassIds] = useState<string[]>(teacher?.class_ids ?? []);
  const [errors, setErrors] = useState<Record<string, string[]>>();
  const [creds, setCreds] = useState<{ email: string; password: string }>();

  const onOpenChange = (o: boolean) => {
    setOpen(o);
    if (!o && creds) { setCreds(undefined); setFullName(""); setEmail(""); setPhone(""); setClassIds([]); }
  };

  const save = () => start(async () => {
    setErrors(undefined);
    if (teacher) {
      const res = await updateTeacher({ id: teacher.id, full_name: fullName, phone, class_ids: classIds });
      if (!res.ok) { setErrors(res.fieldErrors); toast.error(res.error); return; }
      toast.success(res.message ?? "Saved.");
      setOpen(false);
    } else {
      const res = await createTeacher({ full_name: fullName, email, phone, class_ids: classIds });
      if (!res.ok) { setErrors(res.fieldErrors); toast.error(res.error); return; }
      toast.success(res.message ?? "Created.");
      setCreds(res.data);
    }
    router.refresh();
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger render={teacher ? <Button variant="outline" size="sm" /> : <Button />}>
        {teacher ? <><Pencil /> Edit</> : <><UserPlus /> Add teacher</>}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{creds ? "Teacher login created" : teacher ? "Edit teacher" : "Add teacher"}</DialogTitle>
          {!creds && <DialogDescription>Teachers can only see the classes ticked below.</DialogDescription>}
        </DialogHeader>
        {creds ? <CredentialsBox email={creds.email} password={creds.password} /> : (
          <>
            <div className="space-y-4">
              <Field id="t-name" label="Full name" required error={errors?.full_name?.[0]}>
                <Input id="t-name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
              </Field>
              {!teacher && (
                <Field id="t-email" label="Email (used to sign in)" required error={errors?.email?.[0]}>
                  <Input id="t-email" type="email" inputMode="email" autoComplete="off"
                    value={email} onChange={(e) => setEmail(e.target.value)} />
                </Field>
              )}
              <Field id="t-phone" label="Phone" error={errors?.phone?.[0]}>
                <Input id="t-phone" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </Field>
              <fieldset>
                <legend className="mb-2 text-sm font-medium">Classes (current year)</legend>
                <ClassCheckboxes classes={classes} value={classIds} onChange={setClassIds} />
              </fieldset>
            </div>
            <DialogFooter>
              <Button onClick={save} disabled={pending || !fullName.trim() || (!teacher && !email.trim())}>
                {pending && <Loader2 className="animate-spin" />} {teacher ? "Save" : "Create login"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ResetPasswordButton({ teacher }: { teacher: Teacher }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [password, setPassword] = useState<string>();
  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setPassword(undefined); }}>
      <DialogTrigger render={<Button variant="outline" size="sm" disabled={!teacher.active} />}>
        <KeyRound /> Reset password
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reset password for {teacher.full_name}</DialogTitle>
          {!password && (
            <DialogDescription>
              A new temporary password will replace the current one. The teacher can change it after signing in.
            </DialogDescription>
          )}
        </DialogHeader>
        {password ? <CredentialsBox password={password} /> : (
          <DialogFooter>
            <Button disabled={pending} onClick={() => start(async () => {
              const res = await resetTeacherPassword({ id: teacher.id });
              if (!res.ok) { toast.error(res.error); return; }
              setPassword(res.data!.password);
            })}>
              {pending && <Loader2 className="animate-spin" />} Generate new password
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function TeacherRowActions({ teacher, classes }: { teacher: Teacher; classes: Option[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const toggle = (active: boolean) => start(async () => {
    const res = await setTeacherActive({ id: teacher.id }, active);
    if (!res.ok) { toast.error(res.error); return; }
    toast.success(res.message ?? "Done.");
    router.refresh();
  });

  return (
    <div className="flex flex-wrap gap-2">
      <TeacherDialog classes={classes} teacher={teacher} />
      <ResetPasswordButton teacher={teacher} />
      {teacher.active ? (
        <AlertDialog>
          <AlertDialogTrigger render={<Button variant="destructive" size="sm" />}><UserX /> Deactivate</AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Deactivate {teacher.full_name}?</AlertDialogTitle>
              <AlertDialogDescription>
                They will be signed out and can no longer sign in. Marks and attendance they entered are kept.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction variant="destructive" disabled={pending} onClick={() => toggle(false)}>Deactivate</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : (
        <Button variant="outline" size="sm" disabled={pending} onClick={() => toggle(true)}>
          {pending ? <Loader2 className="animate-spin" /> : <UserCheck />} Re-activate
        </Button>
      )}
    </div>
  );
}
