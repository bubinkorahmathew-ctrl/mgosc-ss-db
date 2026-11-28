import type { Metadata } from "next";
import { Search } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { formatDate } from "@/lib/dates";
import {
  assignableRoles, canEditPerson, DESIGNATION_LABELS, DESIGNATIONS, ROLE_LABELS, ROLES, staffName, type Designation, type Role,
} from "@/lib/permissions";
import { currentClassOptions, listPeople, recentAudit, type PersonFilters } from "@/lib/repo/users";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/page-header";
import { Field, NativeSelect } from "@/components/form/field";
import { StatusBadge } from "@/components/status-badge";
import { PersonDialog } from "@/components/users/person-dialog";
import { ResendInviteButton, TempPasswordButton } from "@/components/users/person-actions";

export const metadata: Metadata = { title: "Users" };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const ACTION_LABELS: Record<string, string> = {
  create: "created", role: "role changed", admin_access: "admin access set", activate: "re-activated", deactivate: "deactivated",
  email: "email changed", login_created: "login created", invite: "invite sent", password_reset: "temporary password made", classes: "classes changed",
};

/** Admins and super admins: everyone on the staff, their roles, designations, logins and classes. */
export default async function UsersPage({ searchParams }: PageProps<"/admin/users">) {
  const user = await requireRole("admin");
  const sp = await searchParams;
  const f: PersonFilters = {
    q: one(sp.q).slice(0, 60) || undefined,
    role: (ROLES as readonly string[]).includes(one(sp.role)) ? one(sp.role) as Role : undefined,
    designation: (DESIGNATIONS as readonly string[]).includes(one(sp.designation)) ? one(sp.designation) as Designation : undefined,
    active: one(sp.active) === "yes" ? true : one(sp.active) === "no" ? false : undefined,
  };
  const actor = user.profile.role;
  const [people, classes, log] = await Promise.all([listPeople(user, f), currentClassOptions(user), recentAudit(user)]);
  const roles = assignableRoles(actor);

  return (
    <>
      <PageHeader title="Users" description="Staff accounts, roles, designations and classes. Roles decide what someone may do; designations are titles."
        actions={<PersonDialog roles={roles} classes={classes} />} />

      <form method="get" className="mb-4 grid gap-3 rounded-xl border bg-muted/30 p-4 sm:grid-cols-2 lg:grid-cols-5 lg:items-end">
        <Field id="u-q" label="Search"><Input id="u-q" name="q" defaultValue={f.q ?? ""} placeholder="Name or email" /></Field>
        <Field id="u-role" label="Role">
          <NativeSelect id="u-role" name="role" defaultValue={f.role ?? ""}>
            <option value="">All</option>
            {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
          </NativeSelect>
        </Field>
        <Field id="u-des" label="Designation">
          <NativeSelect id="u-des" name="designation" defaultValue={f.designation ?? ""}>
            <option value="">All</option>
            {DESIGNATIONS.map((d) => <option key={d} value={d}>{DESIGNATION_LABELS[d]}</option>)}
          </NativeSelect>
        </Field>
        <Field id="u-active" label="Status">
          <NativeSelect id="u-active" name="active" defaultValue={one(sp.active)}>
            <option value="">All</option>
            <option value="yes">Active</option>
            <option value="no">Deactivated</option>
          </NativeSelect>
        </Field>
        <Button type="submit"><Search /> Show</Button>
      </form>

      {!people.length ? <EmptyState title="Nobody matches." /> : (
        <div className="grid gap-3">
          {people.map((p) => {
            const editable = canEditPerson(actor, { role: p.role }) && p.id !== user.id;
            return (
              <Card key={p.id} size="sm">
                <CardContent className="flex flex-col gap-3 lg:flex-row lg:items-center">
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="flex flex-wrap items-center gap-2 font-medium">
                      {staffName(p.name, p.designation)}
                      <Badge variant={p.effectiveRole === "teacher" ? "secondary" : "default"}>{ROLE_LABELS[p.effectiveRole]}</Badge>
                      {p.role === "admin" && p.adminAccessUntil && (
                        <span className={p.effectiveRole === "admin" ? "text-xs text-amber-700" : "text-xs text-muted-foreground"}>
                          {p.effectiveRole === "admin" ? `admin until ${formatDate(p.adminAccessUntil.toISOString())}` : `admin access ended ${formatDate(p.adminAccessUntil.toISOString())}`}
                        </span>
                      )}
                      {!p.active && <StatusBadge status="deactivated" />}
                    </p>
                    <p className="truncate text-sm text-muted-foreground">
                      {p.email ?? "No login yet"}
                      {p.hasLogin && !p.lastLoginAt && " · invite not used yet"}
                      {p.phone ? ` · ${p.phone}` : ""}
                    </p>
                    <p className="text-sm">
                      {p.classes.length
                        ? p.classes.map((c) => `${c.label}${c.isClassTeacher ? " (class teacher)" : ""}`).join(", ")
                        : <span className="text-muted-foreground">No class this year</span>}
                    </p>
                  </div>
                  {editable && (
                    <div className="flex flex-wrap gap-2">
                      <PersonDialog roles={roles} classes={classes} canEditRole={actor === "super_admin"}
                        person={{
                          id: p.id, full_name: p.name, email: p.email ?? "", role: p.role, designation: p.designation ?? "",
                          phone: p.phone ?? "", twelfth_passed_year: p.twelfth, active: p.active, hasLogin: p.hasLogin,
                          admin_access_until: p.adminAccessUntil ? p.adminAccessUntil.toISOString().slice(0, 10) : "",
                          classes: p.classes.map((c) => ({ class_id: c.id, is_class_teacher: c.isClassTeacher })),
                        }} />
                      {p.hasLogin && p.active && <ResendInviteButton id={p.id} />}
                      {p.hasLogin && p.active && <TempPasswordButton id={p.id} name={p.name} />}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Card className="mt-8">
        <CardHeader><CardTitle>Recent changes</CardTitle></CardHeader>
        <CardContent>
          {!log.length ? <p className="text-sm text-muted-foreground">Nothing yet.</p> : (
            <ul className="divide-y text-sm">
              {log.map((l, i) => (
                <li key={i} className="flex flex-wrap gap-x-2 py-1.5">
                  <span className="text-muted-foreground">{formatDate(l.at.toISOString())}</span>
                  <span><b>{l.target ?? "?"}</b> {ACTION_LABELS[l.action] ?? l.action}</span>
                  {l.action === "role" && <span className="text-muted-foreground">({describe(l.details)})</span>}
                  {l.action === "admin_access" && <span className="text-muted-foreground">({describe(l.details)})</span>}
                  <span className="text-muted-foreground">by {l.actor ?? "?"}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}

function describe(details: unknown): string {
  const d = (details ?? {}) as { from?: Role; to?: Role; until?: string };
  if (d.from && d.to) return `${ROLE_LABELS[d.from] ?? d.from} → ${ROLE_LABELS[d.to] ?? d.to}`;
  if (d.until) return d.until === "permanent" ? "permanent" : `until ${formatDate(d.until)}`;
  return "";
}
