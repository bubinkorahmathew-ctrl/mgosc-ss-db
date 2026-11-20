import { cn } from "@/lib/utils";

const STYLES: Record<string, string> = {
  pending: "bg-amber-100 text-amber-900",
  approved: "bg-emerald-100 text-emerald-900",
  rejected: "bg-red-100 text-red-900",
  active: "bg-emerald-100 text-emerald-900",
  inactive: "bg-zinc-200 text-zinc-800",
  passed_out: "bg-sky-100 text-sky-900",
  deactivated: "bg-zinc-200 text-zinc-800",
};
const LABELS: Record<string, string> = { passed_out: "Passed out" };

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize",
      STYLES[status] ?? "bg-muted", className)}>
      {LABELS[status] ?? status}
    </span>
  );
}

export function genderLabel(g: string) {
  return g === "male" ? "Boy" : g === "female" ? "Girl" : g;
}
