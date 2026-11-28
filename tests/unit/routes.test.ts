import { describe, expect, it } from "vitest";
import { homeFor, redirectFor } from "@/lib/authn/routes";
import { credentialsSchema, safeNext } from "@/lib/validation/auth";

const admin = { role: "headmaster", mustChangePassword: false } as const;
const teacher = { role: "teacher", mustChangePassword: false } as const;
const ovbs = { role: "ovbs_teacher", mustChangePassword: false } as const;

describe("who may open what (proxy)", () => {
  it("signed out: every staff area goes to sign-in, remembering the page", () => {
    expect(redirectFor("/admin", null)).toBe("/login?next=%2Fadmin");
    expect(redirectFor("/teacher/attendance", null)).toBe("/login?next=%2Fteacher%2Fattendance");
    expect(redirectFor("/ovbs", null)).toBe("/login?next=%2Fovbs");
    expect(redirectFor("/change-password", null)).toBe("/login");
    expect(redirectFor("/login", null)).toBeNull();
  });

  it("each role only reaches its own area", () => {
    for (const [user, own] of [[admin, "/admin"], [teacher, "/teacher"], [ovbs, "/ovbs"]] as const) {
      expect(homeFor(user.role)).toBe(own);
      for (const area of ["/admin", "/teacher", "/ovbs"]) {
        expect(redirectFor(`${area}/students`, user)).toBe(area === own ? null : own);
      }
      expect(redirectFor("/login", user)).toBe(own);
      expect(redirectFor("/change-password", user)).toBe(own);
    }
  });

  it("an area name inside a longer word is not that area", () => {
    expect(redirectFor("/administrator", null)).toBeNull();
    expect(redirectFor("/teachers", null)).toBeNull();
  });

  it("a temporary password must be changed before anything else", () => {
    for (const user of [admin, teacher, ovbs]) {
      const forced = { ...user, mustChangePassword: true };
      expect(redirectFor("/change-password", forced)).toBeNull();
      for (const path of ["/admin", "/teacher", "/ovbs/x", "/login"]) expect(redirectFor(path, forced)).toBe("/change-password");
    }
  });

  it("sign-in accepts the form Auth.js passes on (all text, with extra fields)", () => {
    const fromAuthJs = { email: " Head@Example.com ", password: "secret-pass", remember: "false", callbackUrl: "/admin" };
    expect(credentialsSchema.safeParse(fromAuthJs)).toMatchObject({ success: true, data: { email: "head@example.com", password: "secret-pass" } });
    expect(credentialsSchema.safeParse({ ...fromAuthJs, remember: "true" }).success).toBe(true);
    expect(credentialsSchema.safeParse({ email: "not-an-email", password: "x" }).success).toBe(false);
  });

  it("?next= only follows same-site paths", () => {
    expect(safeNext("/teacher/marks")).toBe("/teacher/marks");
    for (const bad of ["https://evil.example", "//evil.example", "/\\evil.example", "", undefined]) expect(safeNext(bad)).toBeNull();
  });
});
