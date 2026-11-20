"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Ban, RotateCcw } from "lucide-react";
import { setCertificateRevoked } from "@/actions/certificates";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export function RevokeButton({ id, no, revoked }: { id: string; no: string; revoked: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const act = () => start(async () => {
    const res = await setCertificateRevoked({ id, revoked: !revoked });
    if (!res.ok) { toast.error(res.error); return; }
    toast.success(res.message ?? "Done.");
    router.refresh();
  });

  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button variant="ghost" size="sm" disabled={pending} />}>
        {revoked ? <><RotateCcw /> Restore</> : <><Ban /> Revoke</>}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{revoked ? `Restore ${no}?` : `Revoke ${no}?`}</AlertDialogTitle>
          <AlertDialogDescription>
            {revoked
              ? "The certificate will show as valid again when its QR code is scanned."
              : "Scanning its QR code will show that it is no longer valid. The PDF will be marked REVOKED. You can restore it later."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant={revoked ? "default" : "destructive"} onClick={act}>{revoked ? "Restore" : "Revoke"}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
