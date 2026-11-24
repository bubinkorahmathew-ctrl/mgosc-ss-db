import Link from "next/link";
import { ArrowDown, ArrowUp, ChevronRight } from "lucide-react";
import { FATHER_NAME_PLACEHOLDER, NOT_ASSIGNED_PRAYER_UNIT } from "@/lib/config";
import { formatAge, formatDate } from "@/lib/dates";
import { classLabel } from "@/lib/format";
import { StatusBadge, genderLabel } from "@/components/status-badge";
import { EmptyState } from "@/components/page-header";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

type SP = Record<string, string | string[] | undefined>;

export type StudentListRow = {
  id: string; admission_no: string; full_name: string; full_name_ml: string | null; dob: string;
  gender: string; school_class: string; guardian_phone: string; status: string;
  prayer_unit_id: string; father_name: string;
  classes: { name: string; section: string | null } | null;
  prayer_units: { name: string } | null;
};

export const isIncomplete = (s: Pick<StudentListRow, "prayer_unit_id" | "father_name">) =>
  s.prayer_unit_id === NOT_ASSIGNED_PRAYER_UNIT || s.father_name === FATHER_NAME_PLACEHOLDER;

function Incomplete() {
  return <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-900">Incomplete</span>;
}

/** A column header that sorts the list; a second click reverses it. */
function SortHeader({ label, sort, sp, basePath }: { label: string; sort: "name" | "age" | "dob"; sp: SP; basePath: string }) {
  const current = (typeof sp.sort === "string" ? sp.sort : undefined) ?? "name";
  const active = current === sort;
  const dir = active && sp.dir !== "desc" ? "desc" : "asc";
  const next = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) if (typeof v === "string" && k !== "page" && k !== "sort" && k !== "dir") next.set(k, v);
  if (sort !== "name") next.set("sort", sort);
  if (dir === "desc") next.set("dir", "desc");
  const Icon = sp.dir === "desc" ? ArrowDown : ArrowUp;
  return (
    <Link href={`${basePath}?${next.toString()}`} className="inline-flex items-center gap-1 hover:text-foreground"
      aria-label={`Sort by ${label.toLowerCase()}`}>
      {label}{active && <Icon className="size-3.5" aria-hidden />}
    </Link>
  );
}

export function StudentsTable({ rows, basePath, empty, searchParams = {} }: {
  rows: StudentListRow[]; basePath: string; empty?: string; searchParams?: SP;
}) {
  if (!rows.length) return <EmptyState title={empty ?? "No students match these filters."} />;
  const sortable = (label: string, sort: "name" | "age" | "dob") =>
    <SortHeader label={label} sort={sort} sp={searchParams} basePath={basePath} />;
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
                  {s.admission_no} · {s.classes ? classLabel(s.classes) : "No class"} · {s.school_class} · age {formatAge(s.dob, undefined, true)}
                </p>
              </div>
              {isIncomplete(s) && <Incomplete />}
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
              <TableHead>{sortable("Name", "name")}</TableHead>
              <TableHead>SS class</TableHead>
              <TableHead>School class</TableHead>
              <TableHead>{sortable("Date of birth", "dob")}</TableHead>
              <TableHead>{sortable("Age", "age")}</TableHead>
              <TableHead>Gender</TableHead>
              <TableHead>Prayer unit</TableHead>
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
                <TableCell className="tabular-nums">{formatDate(s.dob)}</TableCell>
                <TableCell className="whitespace-nowrap tabular-nums">{formatAge(s.dob)}</TableCell>
                <TableCell>{genderLabel(s.gender)}</TableCell>
                <TableCell>{s.prayer_unit_id === NOT_ASSIGNED_PRAYER_UNIT ? <Incomplete /> : s.prayer_units?.name}</TableCell>
                <TableCell>{s.guardian_phone}</TableCell>
                <TableCell className="space-x-1">
                  <StatusBadge status={s.status} />
                  {s.father_name === FATHER_NAME_PLACEHOLDER && s.prayer_unit_id !== NOT_ASSIGNED_PRAYER_UNIT && <Incomplete />}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}

export function Pagination({ page, pageCount, total, searchParams, basePath }: {
  page: number; pageCount: number; total: number; searchParams: SP;
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
