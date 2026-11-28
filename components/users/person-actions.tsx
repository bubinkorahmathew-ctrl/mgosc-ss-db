"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { KeyRound, Loader2, Mail } from "lucide-react";
import { resendInvite, resetPersonPassword } from "@/actions/users";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";

/** Resend the "Set your password" email (48 hours). */
export function ResendInviteButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <Button variant="outline" size="sm" disabled={pending} onClick={() => start(async () => {
      const res = await resendInvite({ id });
      if (!res.ok) { toast.error(res.error); return; }
      toast.success(res.message ?? "Invite sent.");
    })}>
      {pending ? <Loader2 className="animate-spin" /> : <Mail />} Resend invite
    </Button>
  );
}

/** Fallback when email doesn't work: a temporary password shown once, changed at the next sign-in. */
export function TempPasswordButton({ id, name }: { id: string; name: string }) {
  const [pending, start] = useTransition();
  const [password, setPassword] = useState<string>();
  return (
    <Dialog onOpenChange={(o) => { if (!o) setPassword(undefined); }}>
      <DialogTrigger render={<Button variant="ghost" size="sm" />}><KeyRound /> Temporary password</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Temporary password for {name}</DialogTitle>
          <DialogDescription>For when the email invite doesn&apos;t work. They must choose their own password when they sign in.</DialogDescription>
        </DialogHeader>
        {password ? (
          <div className="space-y-2">
            <p className="rounded-lg border bg-muted/40 p-3 font-mono text-sm">Password: <span className="font-semibold">{password}</span></p>
            <p className="text-sm text-muted-foreground">Copy it now: it won&apos;t be shown again.</p>
          </div>
        ) : (
          <DialogFooter>
            <Button disabled={pending} onClick={() => start(async () => {
              const res = await resetPersonPassword({ id });
              if (!res.ok) { toast.error(res.error); return; }
              setPassword(res.data!.password);
            })}>
              {pending && <Loader2 className="animate-spin" />} Make a temporary password
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
