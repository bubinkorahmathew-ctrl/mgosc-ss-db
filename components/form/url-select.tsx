"use client";

import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Field, NativeSelect } from "@/components/form/field";

/** A select that stores its value in ?<param>= (and clears dependent params). */
export function UrlSelect({ id, label, param, value, options, clears = [], placeholder, className }: {
  id: string; label: string; param: string; value?: string;
  options: { value: string; label: string }[]; clears?: string[]; placeholder?: string; className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();

  return (
    <Field id={id} label={<span className="inline-flex items-center gap-1">{label}{pending && <Loader2 className="size-3 animate-spin" />}</span>} className={className}>
      <NativeSelect id={id} value={value ?? ""}
        onChange={(e) => {
          const next = new URLSearchParams(params.toString());
          if (e.target.value) next.set(param, e.target.value); else next.delete(param);
          for (const c of clears) next.delete(c);
          start(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
        }}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </NativeSelect>
    </Field>
  );
}
