"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Plus, Save, Trash2 } from "lucide-react";
import { deletePrayerUnit, savePrayerUnit } from "@/actions/settings";
import { NOT_ASSIGNED_PRAYER_UNIT } from "@/lib/config";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Unit = { id: string; name: string; active: boolean; used: number };

export function PrayerUnitsForm({ units }: { units: Unit[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [names, setNames] = useState<Record<string, string>>(Object.fromEntries(units.map((u) => [u.id, u.name])));
  const [added, setAdded] = useState("");

  const run = (action: () => Promise<{ ok: boolean; error?: string; message?: string }>, after?: () => void) =>
    start(async () => {
      const res = await action();
      if (!res.ok) { toast.error(res.error); return; }
      toast.success(res.message ?? "Saved.");
      after?.();
      router.refresh();
    });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Prayer units</CardTitle>
        <p className="text-sm text-muted-foreground">
          Every student and registration needs a prayer unit. Units that are switched off are not offered on forms,
          but students keep them. A unit can be deleted only while nobody uses it.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <ul className="divide-y rounded-lg border">
          {units.map((u) => {
            const fixed = u.id === NOT_ASSIGNED_PRAYER_UNIT;
            const changed = (names[u.id] ?? "").trim() !== u.name;
            return (
              <li key={u.id} className="flex flex-wrap items-center gap-2 p-2">
                <Input aria-label="Prayer unit name" className="min-w-40 flex-1" value={names[u.id] ?? ""} disabled={fixed}
                  onChange={(e) => setNames({ ...names, [u.id]: e.target.value })} />
                <span className="w-24 text-xs text-muted-foreground">used {u.used} time{u.used === 1 ? "" : "s"}</span>
                {fixed ? (
                  <span className="text-xs text-muted-foreground">Placeholder for records to fix</span>
                ) : (
                  <>
                    <label className="flex min-h-9 items-center gap-2 text-sm">
                      <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={u.active} disabled={pending}
                        onChange={(e) => run(() => savePrayerUnit({ id: u.id, name: u.name, active: e.target.checked }))} />
                      Offered
                    </label>
                    <Button size="sm" variant="outline" disabled={pending || !changed}
                      onClick={() => run(() => savePrayerUnit({ id: u.id, name: names[u.id], active: u.active }))}>
                      <Save /> Save
                    </Button>
                    <Button size="sm" variant="ghost" aria-label={`Delete ${u.name}`} disabled={pending || u.used > 0}
                      onClick={() => run(() => deletePrayerUnit({ id: u.id }))}>
                      <Trash2 />
                    </Button>
                  </>
                )}
              </li>
            );
          })}
        </ul>
        <form className="flex gap-2" onSubmit={(e) => {
          e.preventDefault();
          run(() => savePrayerUnit({ name: added, active: true }), () => setAdded(""));
        }}>
          <Input aria-label="New prayer unit" placeholder="New prayer unit name" value={added}
            onChange={(e) => setAdded(e.target.value)} />
          <Button type="submit" disabled={pending || !added.trim()}>
            {pending ? <Loader2 className="animate-spin" /> : <Plus />} Add
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
