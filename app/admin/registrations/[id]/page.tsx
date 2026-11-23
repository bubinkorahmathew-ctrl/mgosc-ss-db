import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/db/server";
import { getClassOptions } from "@/lib/data/classes";
import { formatDate, ageOn } from "@/lib/dates";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { StatusBadge, genderLabel } from "@/components/status-badge";
import { ReviewPanel } from "./review-panel";

export const metadata: Metadata = { title: "Registration" };

export default async function RegistrationDetail({ params }: PageProps<"/admin/registrations/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const dbc = await createClient();
  const [{ data: r }, classes] = await Promise.all([
    dbc.from("registrations").select("*, reviewer:profiles!registrations_reviewed_by_fkey(full_name)")
      .eq("id", id).maybeSingle(),
    getClassOptions({ currentOnly: true }),
  ]);
  if (!r) notFound();

  const rows: [string, React.ReactNode][] = [
    ["Name", r.full_name],
    ["Date of birth", `${formatDate(r.dob)} (age ${ageOn(r.dob)})`],
    ["Gender", genderLabel(r.gender)],
    ["School class", r.school_class],
    ["School name", r.school_name || "-"],
    ["Prayer group", r.prayer_group || "-"],
    ["Father", r.father_name || "-"],
    ["Mother", r.mother_name || "-"],
    ["Guardian phone", <a key="p" className="text-primary underline" href={`tel:${r.guardian_phone}`}>{r.guardian_phone}</a>],
    ["Address", r.address || "-"],
    ["Baptised", r.baptised ? "Yes" : "No"],
    ["Submitted", formatDate(r.submitted_at)],
  ];

  return (
    <>
      <Link href="/admin/registrations" className="mb-3 inline-flex min-h-11 items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Registrations
      </Link>
      <PageHeader title={r.full_name} actions={<StatusBadge status={r.status} />} />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Details</CardTitle></CardHeader>
          <CardContent>
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
              {rows.map(([k, v]) => (
                <div key={k}>
                  <dt className="text-xs text-muted-foreground">{k}</dt>
                  <dd className="text-sm">{v}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Review</CardTitle></CardHeader>
          <CardContent>
            {r.status === "pending" ? (
              <ReviewPanel registrationId={r.id} classes={classes.map((c) => ({ id: c.id, label: c.label }))} />
            ) : (
              <div className="space-y-2 text-sm">
                <p>
                  {r.status === "approved" ? "Approved" : "Rejected"}
                  {r.reviewer?.full_name ? ` by ${r.reviewer.full_name}` : ""}
                  {r.reviewed_at ? ` on ${formatDate(r.reviewed_at)}` : ""}.
                </p>
                {r.review_note && <p className="text-muted-foreground">Note: {r.review_note}</p>}
                {r.student_id && (
                  <Link className="text-primary underline" href={`/admin/students/${r.student_id}`}>Open student profile</Link>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
