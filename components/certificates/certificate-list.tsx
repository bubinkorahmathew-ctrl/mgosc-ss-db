import Link from "next/link";
import { ChevronLeft, ChevronRight, Download, FileStack, Search } from "lucide-react";
import { createClient } from "@/lib/db/server";
import { sanitizeSearch } from "@/lib/data/students";
import { CERT_LABELS, CERTIFICATE_TYPES } from "@/lib/certificates";
import { formatDate } from "@/lib/dates";
import { toQuery } from "@/lib/validation/reports";
import type { CertificateType } from "@/lib/db/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, NativeSelect } from "@/components/form/field";
import { EmptyState } from "@/components/page-header";
import { RevokeButton } from "./revoke-button";

const PAGE = 50;
type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/** Certificates visible to the caller (RLS), newest first, with filters in the URL. */
export async function CertificateList({ sp, classes, canRevoke, base }: {
  sp: SP; classes: { id: string; label: string }[]; canRevoke: boolean; base: string;
}) {
  const classId = classes.some((c) => c.id === one(sp.class)) ? one(sp.class) : "";
  const type = (CERTIFICATE_TYPES as string[]).includes(one(sp.type)) ? (one(sp.type) as CertificateType) : "";
  const q = sanitizeSearch(one(sp.q));
  const page = Math.max(1, Math.min(1000, Number(one(sp.page)) || 1));

  const dbc = await createClient();
  let query = dbc.from("certificates")
    .select("id, certificate_no, type, title, student_name, class_name, year_name, issued_on, revoked", { count: "exact" })
    .order("created_at", { ascending: false });
  if (classId) query = query.eq("class_id", classId);
  if (type) query = query.eq("type", type);
  if (q) query = query.or([["student_name", "ilike", `%${q}%`], ["certificate_no", "ilike", `%${q}%`]]);
  const { data, count } = await query.range((page - 1) * PAGE, page * PAGE - 1);
  const rows = data ?? [];
  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE));
  const link = (p: number) => `${base}?${toQuery({ class: classId, type, q, page: p })}`;

  return (
    <>
      <form method="get" className="mb-4 grid gap-3 rounded-xl border bg-muted/30 p-4 sm:grid-cols-4 sm:items-end">
        <Field id="c-q" label="Search"><Input id="c-q" name="q" defaultValue={q} placeholder="Name or CERT number" /></Field>
        <Field id="c-class" label="Class">
          <NativeSelect id="c-class" name="class" defaultValue={classId}>
            <option value="">All classes</option>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </NativeSelect>
        </Field>
        <Field id="c-type" label="Type">
          <NativeSelect id="c-type" name="type" defaultValue={type}>
            <option value="">All types</option>
            {CERTIFICATE_TYPES.map((t) => <option key={t} value={t}>{CERT_LABELS[t]}</option>)}
          </NativeSelect>
        </Field>
        <Button type="submit"><Search /> Show</Button>
      </form>

      {!rows.length ? <EmptyState title="No certificates found." /> : (
        <>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="font-medium">{count} certificate{count === 1 ? "" : "s"}</span>
            <Button variant="outline" size="sm" nativeButton={false}
              render={<a href={`/api/pdf/certificates?ids=${rows.map((r) => r.id).join(",")}`} target="_blank" rel="noopener" />}>
              <FileStack /> PDF of this page ({rows.length})
            </Button>
          </div>
          <ul className="divide-y rounded-xl border text-sm">
            {rows.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{c.student_name} <span className="font-normal text-muted-foreground">· {c.class_name} · {c.year_name}</span></p>
                  <p className="text-muted-foreground">
                    <span className="font-mono">{c.certificate_no}</span> · {CERT_LABELS[c.type]} · {c.title} · {formatDate(c.issued_on)}
                    {c.revoked && <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">Revoked</span>}
                  </p>
                </div>
                <div className="flex gap-1">
                  <Button variant="outline" size="sm" aria-label={`Download ${c.certificate_no}`} nativeButton={false}
                    render={<a href={`/api/pdf/certificates?ids=${c.id}`} target="_blank" rel="noopener" />}>
                    <Download /> PDF
                  </Button>
                  {canRevoke && <RevokeButton id={c.id} no={c.certificate_no} revoked={c.revoked} />}
                </div>
              </li>
            ))}
          </ul>
          {pages > 1 && (
            <div className="mt-4 flex items-center justify-between text-sm">
              {page > 1 ? <Button variant="outline" size="sm" render={<Link href={link(page - 1)} />} nativeButton={false}><ChevronLeft /> Previous</Button> : <span />}
              <span className="text-muted-foreground">Page {page} of {pages}</span>
              {page < pages ? <Button variant="outline" size="sm" render={<Link href={link(page + 1)} />} nativeButton={false}>Next <ChevronRight /></Button> : <span />}
            </div>
          )}
        </>
      )}
    </>
  );
}
