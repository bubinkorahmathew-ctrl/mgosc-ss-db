import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { getRegistration } from "@/lib/repo/registrations";
import { getClassOptions } from "@/lib/repo/classes";
import { formatAge, formatDate } from "@/lib/dates";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { StatusBadge, genderLabel } from "@/components/status-badge";
import { ReviewPanel } from "./review-panel";

export const metadata: Metadata = { title: "Registration" };

export default async function RegistrationDetail({ params }: PageProps<"/admin/registrations/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const user = await requireRole("admin");
  const [r, classes] = await Promise.all([getRegistration(user, id), getClassOptions(user, { currentOnly: true })]);
  if (!r) notFound();

  const rows: [string, React.ReactNode][] = [
    ["Name", r.full_name],
    ["Date of birth", `${formatDate(r.dob)} (age ${formatAge(r.dob)})`],
    ["Gender", genderLabel(r.gender)],
    ["School class", r.school_class],
    ["School name", r.school_name || "-"],
    ["Prayer unit", r.prayer_units?.name ?? "-"],
    ["Father", r.father_name],
    ["Mother", r.mother_name || "-"],
    ["Father's mobile", <a key="f" className="text-primary underline" href={`tel:${r.father_phone}`}>{r.father_phone}</a>],
    ["Guardian phone", <a key="p" className="text-primary underline" href={`tel:${r.guardian_phone}`}>{r.guardian_phone}</a>],
    ["Email", r.email || "-"],
    ["Address", r.address || "-"],
    ["Baptism name", r.baptism_name || "-"],
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
