"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Award, Loader2 } from "lucide-react";
import { confirmToppers } from "@/actions/results";
import type { TopperQueryInput } from "@/lib/validation/toppers";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

/** Admins confirm the calculated toppers; the server works them out again before saving. */
export function AssignToppersButton({ query, names, replaces }: { query: TopperQueryInput; names: string[]; replaces: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const assign = () => start(async () => {
    const res = await confirmToppers(query);
    if (!res.ok) { toast.error(res.error); return; }
    toast.success(res.message ?? "Confirmed.");
    router.refresh();
  });
  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button />}>
        {pending ? <Loader2 className="animate-spin" /> : <Award />} Assign {names.length > 1 ? "joint toppers" : "topper"}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Confirm {names.join(", ")}?</AlertDialogTitle>
          <AlertDialogDescription>
            {names.length > 1 ? "They share the top place, so all are confirmed as joint toppers. " : ""}
            Confirmed toppers show on the dashboard and on the student&apos;s profile.
            {replaces && " This replaces the toppers confirmed earlier for the same comparison."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={assign} disabled={pending}>Confirm</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
