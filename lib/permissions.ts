/**
 * Roles and permissions: the one place that decides who may do what.
 *
 * ROLE = permissions (exactly one per person): super_admin, admin, teacher, and ovbs_teacher for
 * the coming OVBS module. DESIGNATION = an official title for display only (Vicar, HM...), never
 * used for permissions.
 *
 * A teacher can be given admin rights for a while: role = admin plus admin_access_until.
 * getEffectiveRole() treats that person as a teacher once the date has passed. Every permission
 * check uses the effective role; the database rules (lib/db/policies.ts) apply the same rule in SQL.
 */

export const ROLES = ["super_admin", "admin", "teacher", "ovbs_teacher"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  super_admin: "Super admin", admin: "Admin", teacher: "Teacher", ovbs_teacher: "OVBS staff",
};

export const DESIGNATIONS = ["vicar", "hm", "assistant_hm", "acting_hm", "teacher", "technical_admin"] as const;
export type Designation = (typeof DESIGNATIONS)[number];

export const DESIGNATION_LABELS: Record<Designation, string> = {
  vicar: "Vicar", hm: "HM", assistant_hm: "Assistant HM", acting_hm: "Acting HM", teacher: "Teacher", technical_admin: "Technical Admin",
};

/** "Fr. John - Vicar", or just the name without a designation. */
export function staffName(name: string, designation: Designation | null | undefined): string {
  return designation ? `${name} - ${DESIGNATION_LABELS[designation]}` : name;
}

/** What a person may do now: admin access that has run out counts as teacher. */
export function getEffectiveRole(p: { role: Role; admin_access_until?: Date | string | null }, now: Date = new Date()): Role {
  if (p.role === "admin" && p.admin_access_until && new Date(p.admin_access_until).getTime() <= now.getTime()) return "teacher";
  return p.role;
}

/** Admins and super admins: all school work. */
export const isAdmin = (role: Role) => role === "super_admin" || role === "admin";
export const isSuperAdmin = (role: Role) => role === "super_admin";

/**
 * Role groups for guards: "admin" accepts admins and super admins; the others accept that role only.
 * (A super admin is also an admin; a teacher with expired admin access is a teacher.)
 */
export type RoleGuard = "super_admin" | "admin" | "teacher" | "ovbs_teacher";
export function hasRole(effective: Role, wanted: RoleGuard): boolean {
  return wanted === "admin" ? isAdmin(effective) : effective === wanted;
}

// ---------------------------------------------------------------------------
// Managing people
// ---------------------------------------------------------------------------

/** Who may open the Users page and manage teacher accounts and profiles. */
export const canManageUsers = (actor: Role) => isAdmin(actor);

/** Roles the actor may give: a super admin any; an admin only teacher. */
export function assignableRoles(actor: Role): Role[] {
  if (actor === "super_admin") return ["super_admin", "admin", "teacher"];
  if (actor === "admin") return ["teacher"];
  return [];
}

/**
 * May the actor edit (or deactivate) this person? Super admin: anyone. Admin: teachers and
 * teacher profiles without a login only, never admins or super admins (stored role counts:
 * a temporary admin is an admin while the role says so).
 */
export function canEditPerson(actor: Role, target: { role: Role }): boolean {
  if (actor === "super_admin") return true;
  if (actor === "admin") return target.role === "teacher";
  return false;
}

/** Reasons a change is refused, in plain words; null when it's allowed. */
export function roleChangeProblem(input: {
  actorId: string; actor: Role; targetId: string; from: Role; to: Role; activeSuperAdmins: number;
}): string | null {
  const { actorId, actor, targetId, from, to, activeSuperAdmins } = input;
  if (from === to) return null;
  if (actorId === targetId) return "You can't change your own role.";
  if (!assignableRoles(actor).includes(to) || !canEditPerson(actor, { role: from })) return "You can't give that role.";
  if (from === "super_admin" && activeSuperAdmins <= 1) return "This is the last active super admin: make someone else super admin first.";
  return null;
}

export function deactivationProblem(input: {
  actorId: string; actor: Role; targetId: string; target: Role; activeSuperAdmins: number;
}): string | null {
  if (input.actorId === input.targetId) return "You can't deactivate yourself.";
  if (!canEditPerson(input.actor, { role: input.target })) return "You can't change this account.";
  if (input.target === "super_admin" && input.activeSuperAdmins <= 1) return "This is the last active super admin and can't be deactivated.";
  return null;
}
