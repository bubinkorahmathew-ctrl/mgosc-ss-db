"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { setMyEmailNotifications } from "@/actions/notifications";
import { Card, CardContent } from "@/components/ui/card";

export function NotificationsToggle({ initial, about }: { initial: boolean; about: string }) {
  const [on, setOn] = useState(initial);
  const [pending, start] = useTransition();
  const change = (next: boolean) => start(async () => {
    setOn(next);
    const res = await setMyEmailNotifications({ on: next });
    if (!res.ok) { setOn(!next); toast.error(res.error); return; }
    toast.success(res.message ?? "Saved.");
  });
  return (
    <Card className="max-w-md">
      <CardContent>
        <label className="flex min-h-11 cursor-pointer items-start gap-3">
          <input type="checkbox" className="mt-0.5 size-5 accent-[var(--primary)]" checked={on} disabled={pending}
            onChange={(e) => change(e.target.checked)} />
          <span>
            <span className="block font-medium">Email me notifications</span>
            <span className="block text-sm text-muted-foreground">{about}</span>
          </span>
        </label>
      </CardContent>
    </Card>
  );
}
