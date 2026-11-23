"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { KeyRound, Loader2, UserCheck, UserPlus, UserX } from "lucide-react";
import { createAdmin, resetAdminPassword, setAdminActive } from "@/actions/admins";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Field } from "@/components/form/field";

function TempPassword({ email, password }: { email?: string; password: string }) {
  return (
    <div className="space-y-3">
      <div className="rounded-lg border bg-muted/40 p-3 font-mono text-sm break-all">
        {email && <p>Email: {email}</p>}
        <p>Password: <span className="font-semibold">{password}</span></p>
      </div>
      <p className="text-sm text-muted-foreground">Copy this now. It will not be shown again. They can change it under Account.</p>
    </div>
  );
}

export function AddAdminDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [errors, setErrors] = useState<Record<string, string[]>>();
  const [creds, setCreds] = useState<{ email: string; password: string }>();

  const onOpenChange = (o: boolean) => {
    setOpen(o);
    if (!o && creds) { setCreds(undefined); setFullName(""); setEmail(""); }
  };
  const save = () => start(async () => {
    setErrors(undefined);
    const res = await createAdmin({ full_name: fullName, email });
    if (!res.ok) { setErrors(res.fieldErrors); toast.error(res.error); return; }
    setCreds(res.data);
    router.refresh();
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger render={<Button />}><UserPlus /> Add admin</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{creds ? "Admin login created" : "Add admin"}</DialogTitle>
          {!creds && <DialogDescription>Admins can see and change every class, but not settings or other admins.</DialogDescription>}
        </DialogHeader>
        {creds ? <TempPassword {...creds} /> : (
          <>
            <div className="space-y-4">
              <Field id="a-name" label="Full name" required error={errors?.full_name?.[0]}>
                <Input id="a-name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
              </Field>
              <Field id="a-email" label="Email (used to sign in)" required error={errors?.email?.[0]}>
                <Input id="a-email" type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} />
              </Field>
            </div>
            <DialogFooter>
              <Button onClick={save} disabled={pending || !fullName.trim() || !email.trim()}>
                {pending && <Loader2 className="animate-spin" />} Create login
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function AdminRowActions({ admin }: { admin: { id: string; full_name: string; active: boolean } }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [password, setPassword] = useState<string>();

  const toggle = (active: boolean) => start(async () => {
    const res = await setAdminActive({ id: admin.id }, active);
    if (!res.ok) { toast.error(res.error); return; }
    toast.success(res.message ?? "Done.");
    router.refresh();
  });
  const reset = () => start(async () => {
    const res = await resetAdminPassword({ id: admin.id });
    if (!res.ok) { toast.error(res.error); return; }
    setPassword(res.data!.password);
  });

  return (
    <div className="flex flex-wrap gap-2">
      <Dialog onOpenChange={(o) => { if (!o) setPassword(undefined); }}>
        <DialogTrigger render={<Button variant="outline" size="sm" disabled={!admin.active} />}>
          <KeyRound /> Reset password
        </DialogTrigger>
        <DialogContent>
          <DialogHeader><DialogTitle>Reset password for {admin.full_name}</DialogTitle></DialogHeader>
          {password ? <TempPassword password={password} /> : (
            <DialogFooter>
              <Button onClick={reset} disabled={pending}>
                {pending && <Loader2 className="animate-spin" />} Generate new password
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
      {admin.active ? (
        <AlertDialog>
          <AlertDialogTrigger render={<Button variant="destructive" size="sm" />}><UserX /> Deactivate</AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Deactivate {admin.full_name}?</AlertDialogTitle>
              <AlertDialogDescription>They will be signed out and can no longer sign in.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction variant="destructive" disabled={pending} onClick={() => toggle(false)}>Deactivate</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : (
        <Button variant="outline" size="sm" disabled={pending} onClick={() => toggle(true)}><UserCheck /> Re-activate</Button>
      )}
    </div>
  );
}
