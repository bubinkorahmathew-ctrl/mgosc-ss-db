import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { ageOn, formatDate } from "@/lib/dates";
import { classLabel } from "@/lib/format";
import { StatusBadge, genderLabel } from "@/components/status-badge";
import { EmptyState } from "@/components/page-header";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

export type StudentListRow = {
  id: string; admission_no: string; full_name: string; full_name_ml: string | null; dob: string;
  gender: string; school_class: string; guardian_phone: string; status: string;
  classes: { name: string; section: string | null } | null;
};

export function StudentsTable({ rows, basePath, empty }: { rows: StudentListRow[]; basePath: string; empty?: string }) {
  if (!rows.length) return <EmptyState title={empty ?? "No students match these filters."} />;
  return (
    <>
      {/* phones: cards */}
      <ul className="divide-y rounded-xl border md:hidden">
        {rows.map((s) => (
          <li key={s.id}>
            <Link href={`${basePath}/${s.id}`} className="flex min-h-16 items-center gap-3 px-4 py-3 active:bg-muted">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{s.full_name}</p>
                {s.full_name_ml && <p className="truncate text-sm">{s.full_name_ml}</p>}
                <p className="text-xs text-muted-foreground">
                  {s.admission_no} · {s.classes ? classLabel(s.classes) : "No class"} · {s.school_class}
                </p>
              </div>
              {s.status !== "active" && <StatusBadge status={s.status} />}
              <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
      {/* tablets/desktop: table */}
      <div className="hidden overflow-x-auto rounded-xl border md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Adm. no</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>SS class</TableHead>
              <TableHead>School class</TableHead>
              <TableHead>DOB (age)</TableHead>
              <TableHead>Gender</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="font-mono text-xs">{s.admission_no}</TableCell>
                <TableCell>
                  <Link href={`${basePath}/${s.id}`} className="font-medium text-primary hover:underline">{s.full_name}</Link>
                  {s.full_name_ml && <div className="text-xs text-muted-foreground">{s.full_name_ml}</div>}
                </TableCell>
                <TableCell>{s.classes ? classLabel(s.classes) : <span className="text-muted-foreground">-</span>}</TableCell>
                <TableCell>{s.school_class}</TableCell>
                <TableCell>{formatDate(s.dob)} ({ageOn(s.dob)})</TableCell>
                <TableCell>{genderLabel(s.gender)}</TableCell>
                <TableCell>{s.guardian_phone}</TableCell>
                <TableCell><StatusBadge status={s.status} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}

export function Pagination({ page, pageCount, total, searchParams, basePath }: {
  page: number; pageCount: number; total: number; searchParams: Record<string, string | string[] | undefined>;
  basePath: string;
}) {
  if (pageCount <= 1) return <p className="mt-3 text-sm text-muted-foreground">{total} student{total === 1 ? "" : "s"}</p>;
  const href = (p: number) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(searchParams)) if (typeof v === "string" && k !== "page") sp.set(k, v);
    sp.set("page", String(p));
    return `${basePath}?${sp.toString()}`;
  };
  return (
    <div className="mt-4 flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{total} students · page {page} of {pageCount}</span>
      <div className="flex gap-2">
        {page > 1 && <Link className="rounded-lg border px-4 py-2.5 hover:bg-muted" href={href(page - 1)}>Previous</Link>}
        {page < pageCount && <Link className="rounded-lg border px-4 py-2.5 hover:bg-muted" href={href(page + 1)}>Next</Link>}
      </div>
    </div>
  );
}
