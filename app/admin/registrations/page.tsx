import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { createClient } from "@/lib/db/server";
import { formatDate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { EmptyState, PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";

export const metadata: Metadata = { title: "Registrations" };

const TABS = ["pending", "approved", "rejected"] as const;
type Tab = (typeof TABS)[number];

export default async function RegistrationsPage({ searchParams }: PageProps<"/admin/registrations">) {
  const sp = await searchParams;
  const status: Tab = TABS.includes(sp.status as Tab) ? (sp.status as Tab) : "pending";
  const dbc = await createClient();
  const { data: rows } = await dbc
    .from("registrations")
    .select("id, full_name, full_name_ml, dob, school_class, guardian_phone, status, submitted_at")
    .eq("status", status)
    .order("submitted_at", { ascending: status === "pending" })
    .limit(200);

  return (
    <>
      <PageHeader title="Registrations" description="New student registrations from the public form." />
      <nav className="mb-4 flex gap-2 overflow-x-auto" aria-label="Status">
        {TABS.map((t) => (
          <Link key={t} href={`/admin/registrations?status=${t}`} aria-current={t === status ? "page" : undefined}
            className={cn("min-h-11 rounded-full border px-4 py-2.5 text-sm font-medium capitalize sm:min-h-9 sm:py-1.5",
              t === status ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}>
            {t}
          </Link>
        ))}
      </nav>

      {!rows?.length ? (
        <EmptyState title={`No ${status} registrations.`}>
          {status === "pending" && "New registrations from the public form will appear here."}
        </EmptyState>
      ) : (
        <ul className="divide-y rounded-xl border">
          {rows.map((r) => (
            <li key={r.id}>
              <Link href={`/admin/registrations/${r.id}`}
                className="flex min-h-16 items-center gap-3 px-4 py-3 hover:bg-muted/50">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {r.full_name} {r.full_name_ml && <span className="text-muted-foreground">· {r.full_name_ml}</span>}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    DOB {formatDate(r.dob)} · {r.school_class} · {r.guardian_phone}
                  </p>
                </div>
                <div className="hidden text-right text-xs text-muted-foreground sm:block">
                  Submitted {formatDate(r.submitted_at)}
                </div>
                <StatusBadge status={r.status} />
                <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
