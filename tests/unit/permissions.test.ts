import { describe, expect, it } from "vitest";
import {
  assignableRoles, canEditPerson, deactivationProblem, getEffectiveRole, hasRole, roleChangeProblem, staffName,
} from "@/lib/permissions";

const NOW = new Date("2026-12-01T10:00:00Z");

describe("effective role", () => {
  it("admin access with a date counts until that moment, then the person is a teacher", () => {
    expect(getEffectiveRole({ role: "admin", admin_access_until: "2026-12-02T00:00:00Z" }, NOW)).toBe("admin");
    expect(getEffectiveRole({ role: "admin", admin_access_until: "2026-12-01T09:59:59Z" }, NOW)).toBe("teacher");
    expect(getEffectiveRole({ role: "admin", admin_access_until: null }, NOW)).toBe("admin"); // permanent
    expect(getEffectiveRole({ role: "super_admin", admin_access_until: "2000-01-01" }, NOW)).toBe("super_admin");
    expect(getEffectiveRole({ role: "teacher" }, NOW)).toBe("teacher");
  });

  it("the admin guard accepts admins and super admins only", () => {
    expect(hasRole("super_admin", "admin")).toBe(true);
    expect(hasRole("admin", "admin")).toBe(true);
    expect(hasRole("teacher", "admin")).toBe(false);
    expect(hasRole("admin", "super_admin")).toBe(false);
    expect(hasRole("ovbs_teacher", "teacher")).toBe(false);
  });
});

describe("managing people", () => {
  it("an admin manages teachers only and can give no role but teacher", () => {
    expect(assignableRoles("super_admin")).toEqual(["super_admin", "admin", "teacher"]);
    expect(assignableRoles("admin")).toEqual(["teacher"]);
    expect(assignableRoles("teacher")).toEqual([]);
    expect(canEditPerson("admin", { role: "teacher" })).toBe(true);
    expect(canEditPerson("admin", { role: "admin" })).toBe(false);
    expect(canEditPerson("admin", { role: "super_admin" })).toBe(false);
    expect(canEditPerson("super_admin", { role: "admin" })).toBe(true);
  });

  it("nobody changes their own role; an admin can't grant admin; the last super admin stays", () => {
    const base = { actorId: "a", actor: "super_admin" as const, targetId: "b", activeSuperAdmins: 2 };
    expect(roleChangeProblem({ ...base, from: "teacher", to: "admin" })).toBeNull();
    expect(roleChangeProblem({ ...base, targetId: "a", from: "super_admin", to: "admin" })).toMatch(/own role/);
    expect(roleChangeProblem({ ...base, actor: "admin", from: "teacher", to: "admin" })).toMatch(/can't give/);
    expect(roleChangeProblem({ ...base, actor: "admin", from: "teacher", to: "super_admin" })).toMatch(/can't give/);
    expect(roleChangeProblem({ ...base, from: "super_admin", to: "admin", activeSuperAdmins: 1 })).toMatch(/last active super admin/);
  });

  it("nobody deactivates themselves or the last super admin", () => {
    const base = { actorId: "a", actor: "super_admin" as const, targetId: "b", target: "teacher" as const, activeSuperAdmins: 1 };
    expect(deactivationProblem(base)).toBeNull();
    expect(deactivationProblem({ ...base, targetId: "a" })).toMatch(/yourself/);
    expect(deactivationProblem({ ...base, target: "super_admin" })).toMatch(/last active super admin/);
    expect(deactivationProblem({ ...base, actor: "admin", target: "admin" })).toMatch(/can't change/);
  });

  it("designation is shown next to the name", () => {
    expect(staffName("Fr. John", "vicar")).toBe("Fr. John - Vicar");
    expect(staffName("Mary", "hm")).toBe("Mary - HM");
    expect(staffName("Anu", null)).toBe("Anu");
  });
});
