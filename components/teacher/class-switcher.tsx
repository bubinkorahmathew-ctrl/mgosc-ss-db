"use client";

import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { NativeSelect } from "@/components/form/field";

/** Shown only when a teacher has more than one class. Keeps the choice in ?class=. */
export function ClassSwitcher({ classes, selectedId }: {
  classes: { id: string; label: string }[]; selectedId: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  if (classes.length < 2) return null;

  return (
    <div className="mb-4 flex items-center gap-2">
      <label htmlFor="class-switcher" className="shrink-0 text-sm font-medium">Class</label>
      <NativeSelect id="class-switcher" value={selectedId} className="sm:w-72"
        onChange={(e) => {
          const next = new URLSearchParams(params.toString());
          next.set("class", e.target.value);
          next.delete("exam");
          // remember across pages (bottom-nav links don't carry ?class=)
          document.cookie = `ss_class=${encodeURIComponent(e.target.value)}; path=${pathname.startsWith("/admin") ? "/admin" : "/teacher"}; max-age=31536000; samesite=lax`;
          start(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
        }}>
        {classes.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
      </NativeSelect>
      {pending && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
    </div>
  );
}
