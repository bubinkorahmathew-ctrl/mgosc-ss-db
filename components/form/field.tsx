import * as React from "react";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";

export function Field({
  id, label, error, hint, required, className, children,
}: {
  id: string; label: React.ReactNode; error?: string; hint?: React.ReactNode; required?: boolean;
  className?: string; children: React.ReactNode;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={id}>
        {label}{required && <span className="text-destructive" aria-hidden> *</span>}
      </Label>
      {children}
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && <p id={`${id}-error`} className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

/** Native <select>: best UX on phones (OS picker), styled like shadcn inputs. */
export const NativeSelect = React.forwardRef<HTMLSelectElement, React.ComponentProps<"select">>(
  function NativeSelect({ className, children, ...props }, ref) {
    return (
      <select ref={ref}
        className={cn(
          "h-11 w-full min-w-0 rounded-lg border border-input bg-background px-3 text-base outline-none sm:h-9 md:text-sm",
          "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
          "aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        {...props}>
        {children}
      </select>
    );
  },
);

export function CheckboxField({
  id, label, ...props
}: { id: string; label: React.ReactNode } & React.ComponentProps<"input">) {
  return (
    <label htmlFor={id} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 sm:min-h-9">
      <input id={id} type="checkbox" className="size-5 accent-[var(--primary)]" {...props} />
      <span className="text-sm">{label}</span>
    </label>
  );
}

/** Show the first message for a field from an RHF error or a server fieldErrors map. */
export function firstError(
  rhf: { message?: string } | undefined, server?: Record<string, string[]>, name?: string,
): string | undefined {
  return rhf?.message ?? (name ? server?.[name]?.[0] : undefined);
}
