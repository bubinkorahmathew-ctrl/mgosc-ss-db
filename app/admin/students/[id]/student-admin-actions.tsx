"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowRightLeft, Loader2, Trash2, UserCheck, UserX } from "lucide-react";
import { deleteStudent, moveStudent, setStudentStatus } from "@/actions/students";
import { INACTIVE_REASONS } from "@/lib/validation/student";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Field, NativeSelect } from "@/components/form/field";
import { Input } from "@/components/ui/input";

const OTHER = "__other";

export function StudentAdminActions({ studentId, studentName, classId, status, classes, canDelete }: {
  studentId: string; studentName: string; classId: string | null; status: string;
  classes: { id: string; label: string }[]; canDelete: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [moveOpen, setMoveOpen] = useState(false);
  const [target, setTarget] = useState(classId ?? "");
  const [deactivateOpen, setDeactivateOpen] = useState(false);
  const [reason, setReason] = useState<string>(INACTIVE_REASONS[0]);
  const [otherReason, setOtherReason] = useState("");
  const finalReason = reason === OTHER ? otherReason.trim() : reason;

  const doMove = () => start(async () => {
    const res = await moveStudent({ id: studentId, class_id: target || null });
    if (!res.ok) { toast.error(res.error); return; }
    toast.success(res.message ?? "Class changed.");
    setMoveOpen(false);
    router.refresh();
  });

  const doStatus = (next: "active" | "inactive") => start(async () => {
    const res = await setStudentStatus({
      id: studentId, status: next, inactive_reason: next === "inactive" ? finalReason : null,
    });
    if (!res.ok) { toast.error(res.error); return; }
    toast.success(res.message ?? "Updated.");
    setDeactivateOpen(false);
    router.refresh();
  });

  const doDelete = () => start(async () => {
    const res = await deleteStudent({ id: studentId });
    if (!res.ok) { toast.error(res.error); return; }
    toast.success(res.message ?? "Student deleted.");
    router.replace("/admin/students");
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
        <Dialog open={deactivateOpen} onOpenChange={setDeactivateOpen}>
          <DialogTrigger render={<Button variant="destructive" />}><UserX /> Deactivate</DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Deactivate this student?</DialogTitle>
              <DialogDescription>
                The student will be hidden from class lists, attendance and marks entry. Their records are kept and
                you can re-activate them any time.
              </DialogDescription>
            </DialogHeader>
            <Field id="inactive-reason" label="Reason">
              <NativeSelect id="inactive-reason" value={reason} onChange={(e) => setReason(e.target.value)}>
                {INACTIVE_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
                <option value={OTHER}>Other…</option>
              </NativeSelect>
            </Field>
            {reason === OTHER && (
              <Field id="inactive-reason-other" label="Other reason">
                <Input id="inactive-reason-other" value={otherReason} maxLength={200}
                  onChange={(e) => setOtherReason(e.target.value)} />
              </Field>
            )}
            <DialogFooter>
              <Button variant="destructive" onClick={() => doStatus("inactive")} disabled={pending || !finalReason}>
                {pending && <Loader2 className="animate-spin" />} Deactivate
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : (
        <Button variant="outline" onClick={() => doStatus("active")} disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : <UserCheck />} Re-activate
        </Button>
      )}

      {canDelete && (
        <AlertDialog>
          <AlertDialogTrigger render={<Button variant="destructive" />}><Trash2 /> Delete</AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete {studentName} permanently?</AlertDialogTitle>
              <AlertDialogDescription>
                This removes the student together with all their marks, attendance, activities and certificates.
                It cannot be undone. To keep the records, deactivate the student instead.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction variant="destructive" onClick={doDelete} disabled={pending}>
                Delete permanently
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  );
}
