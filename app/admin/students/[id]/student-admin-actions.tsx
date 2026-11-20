"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowRightLeft, Loader2, UserCheck, UserX } from "lucide-react";
import { moveStudent, setStudentStatus } from "@/actions/students";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Field, NativeSelect } from "@/components/form/field";

export function StudentAdminActions({ studentId, classId, status, classes }: {
  studentId: string; classId: string | null; status: string; classes: { id: string; label: string }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [moveOpen, setMoveOpen] = useState(false);
  const [target, setTarget] = useState(classId ?? "");

  const doMove = () => start(async () => {
    const res = await moveStudent({ id: studentId, class_id: target || null });
    if (!res.ok) { toast.error(res.error); return; }
    toast.success(res.message ?? "Class changed.");
    setMoveOpen(false);
    router.refresh();
  });

  const doStatus = (next: "active" | "inactive") => start(async () => {
    const res = await setStudentStatus({ id: studentId, status: next });
    if (!res.ok) { toast.error(res.error); return; }
    toast.success(res.message ?? "Updated.");
    router.refresh();
  });

  return (
    <>
      <Dialog open={moveOpen} onOpenChange={setMoveOpen}>
        <DialogTrigger render={<Button variant="outline" />}><ArrowRightLeft /> Move class</DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Move to another class</DialogTitle>
            <DialogDescription>Past marks and attendance stay with the old class.</DialogDescription>
          </DialogHeader>
          <Field id="move-class" label="New Sunday School class">
            <NativeSelect id="move-class" value={target} onChange={(e) => setTarget(e.target.value)}>
              <option value="">No class</option>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </NativeSelect>
          </Field>
          <DialogFooter>
            <Button onClick={doMove} disabled={pending || target === (classId ?? "")}>
              {pending && <Loader2 className="animate-spin" />} Move student
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {status === "active" ? (
        <AlertDialog>
          <AlertDialogTrigger render={<Button variant="destructive" />}><UserX /> Deactivate</AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Deactivate this student?</AlertDialogTitle>
              <AlertDialogDescription>
                The student will be hidden from class lists, attendance and marks entry. Their records are kept and
                you can re-activate them any time.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction variant="destructive" onClick={() => doStatus("inactive")} disabled={pending}>
                Deactivate
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : (
        <Button variant="outline" onClick={() => doStatus("active")} disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : <UserCheck />} Re-activate
        </Button>
      )}
    </>
  );
}
