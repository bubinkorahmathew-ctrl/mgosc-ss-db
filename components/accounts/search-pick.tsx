"use client";

import { useId, useState } from "react";
import { Input } from "@/components/ui/input";

/**
 * A searchable picker: type part of a name (or admission number) and choose from the list.
 * Uses the browser's own suggestion list, which works well on phones. Calls onChange with the id.
 */
export function SearchPick({ id, options, value, onChange, placeholder, invalid }: {
  id: string; options: { id: string; label: string }[]; value: string; onChange: (id: string) => void;
  placeholder?: string; invalid?: boolean;
}) {
  const listId = useId();
  const [text, setText] = useState(() => options.find((o) => o.id === value)?.label ?? "");
  return (
    <>
      <Input id={id} list={listId} value={text} placeholder={placeholder} autoComplete="off" aria-invalid={invalid}
        onChange={(e) => {
          setText(e.target.value);
          onChange(options.find((o) => o.label === e.target.value)?.id ?? "");
        }} />
      <datalist id={listId}>
        {options.map((o) => <option key={o.id} value={o.label} />)}
      </datalist>
    </>
  );
}
