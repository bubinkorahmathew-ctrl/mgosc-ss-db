"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Loader2, Search, X } from "lucide-react";
import { SCHOOL_CLASSES } from "@/lib/config";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/form/field";

/** URL-driven filters for the students list: q, class_id, school_class, gender, status. */
export function StudentFilters({ classes, showClassFilter = true }: {
  classes: { id: string; label: string }[]; showClassFilter?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const [q, setQ] = useState(params.get("q") ?? "");

  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value); else next.delete(key);
    next.delete("page");
    start(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
  };

  // debounce the search box
  useEffect(() => {
    if (q === (params.get("q") ?? "")) return;
    const t = setTimeout(() => update("q", q.trim()), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const hasFilters = ["q", "class_id", "school_class", "gender", "status"].some((k) => params.get(k));

  return (
    <div className="mb-4 space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input type="search" placeholder="Search name, admission no or phone" value={q}
          onChange={(e) => setQ(e.target.value)} className="pl-9" aria-label="Search students" />
        {pending && <Loader2 className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {showClassFilter && (
          <NativeSelect aria-label="Sunday School class" value={params.get("class_id") ?? ""}
            onChange={(e) => update("class_id", e.target.value)}>
            <option value="">All SS classes</option>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            <option value="none">No class assigned</option>
          </NativeSelect>
        )}
        <NativeSelect aria-label="School class" value={params.get("school_class") ?? ""}
          onChange={(e) => update("school_class", e.target.value)}>
          <option value="">All school classes</option>
          {SCHOOL_CLASSES.map((c) => <option key={c} value={c}>{c}</option>)}
        </NativeSelect>
        <NativeSelect aria-label="Gender" value={params.get("gender") ?? ""}
          onChange={(e) => update("gender", e.target.value)}>
          <option value="">Boys &amp; girls</option>
          <option value="male">Boys</option>
          <option value="female">Girls</option>
        </NativeSelect>
        <NativeSelect aria-label="Status" value={params.get("status") ?? ""}
          onChange={(e) => update("status", e.target.value)}>
          <option value="">Active</option>
          <option value="inactive">Inactive</option>
          <option value="passed_out">Passed out</option>
          <option value="all">All statuses</option>
        </NativeSelect>
      </div>
      {hasFilters && (
        <Button variant="ghost" size="sm" onClick={() => { setQ(""); start(() => router.replace(pathname)); }}>
          <X /> Clear filters
        </Button>
      )}
    </div>
  );
}
