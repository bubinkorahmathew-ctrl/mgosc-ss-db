/**
 * User management (lib/repo/users.ts) on a throwaway TiDB database: roles, temporary admin
 * access, designations, class assignment, invites, and the safety rules (no self role change or
 * self-deactivation, the last active super admin is protected, deactivated users can't sign in).
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDrizzle, type Db } from "@/db/client";
import { checkLogin, loadSessionUser, type Client } from "@/lib/authn/login";
import { createResetLink, INVITE_LINK_MINUTES, resetLinksOf, resetPasswordWithLink } from "@/lib/authn/reset";
import { createPerson, listPeople, resetToTemporaryPassword, updatePerson, type PersonInput } from "@/lib/repo/users";
import { createTiDbTest, IDS, type TiDbTest } from "./harness";
import { viewer } from "./viewers";

let t: TiDbTest;
let db: Db;
beforeAll(async () => {
  t = await createTiDbTest();
  db = createDrizzle(t.url);
});
afterAll(async () => {
  await t?.destroy();
});

const SUPER = viewer(IDS.headmaster, "super_admin");
const device = (): Client => ({ device: randomUUID(), secret: "test-secret-that-is-long-enough-1234567890" });
const email = () => `${randomUUID()}@test.invalid`;
const person = (over: Partial<PersonInput> = {}): PersonInput => ({
  full_name: "Test Person", email: null, role: "teacher", designation: null, phone: null, twelfth_passed_year: null,
  admin_access_until: null, active: true, classes: [], ...over,
});

/** A person with a login and a password they set themselves (through the invite link). */
async function withLogin(over: Partial<PersonInput> = {}, actor = SUPER) {
  const input = person({ email: email(), ...over });
  const { id } = await createPerson(actor, input);
  const link = await createResetLink(db, input.email!, new Date(), INVITE_LINK_MINUTES);
  const password = `pw-${randomUUID()}`;
  expect(await resetPasswordWithLink(db, link!.token, password)).toBe(true);
  return { id, input, email: input.email!, password };
}
const signIn = async (e: string, p: string) => {
  const r = await checkLogin(db, e, p, device());
  if (!r.ok) throw new Error(r.reason);
  return { id: r.user.id, authAt: r.user.authAt };
};
const auditOf = (id: string) => t.database.query<{ action: string }>("select action from audit_log where target_id = ? order by created_at", [id]);

describe("creating people", () => {
  it("a teacher profile can exist without a login, and gets one (and an invite) when an email is added", async () => {
    const { id, login } = await createPerson(SUPER, person({ full_name: "No Login Yet", designation: "teacher" }));
    expect(login).toBe(false);
    expect(await t.database.query("select 1 from users where id = ?", [id])).toEqual([]);

    const address = email();
    const { newLogin } = await updatePerson(SUPER, id, person({ full_name: "No Login Yet", designation: "teacher", email: address }));
    expect(newLogin).toBe(true);
    // no usable password until the invite is used
    const [u] = await t.database.query<{ m: number }>("select must_change_password m from users where id = ?", [id]);
    expect(Boolean(u.m)).toBe(false);
    expect((await checkLogin(db, address, "anything-at-all", device())).ok).toBe(false);
    expect((await auditOf(id)).map((a) => a.action)).toEqual(["create", "login_created"]);
  });

  it("the invite link lasts 48 hours, works once and sets the password", async () => {
    const p = await withLogin();
    const [link] = await resetLinksOf(db, p.id);
    expect(link.expiresAt.getTime() - link.createdAt.getTime()).toBe(48 * 3_600_000);
    expect(link.usedAt).not.toBeNull();
    expect((await checkLogin(db, p.email, p.password, device())).ok).toBe(true);
  });

  it("emails are unique, and admins need one", async () => {
    const p = await withLogin();
    await expect(createPerson(SUPER, person({ email: p.email }))).rejects.toThrow(/already uses this email/);
    await expect(createPerson(SUPER, person({ role: "admin" }))).rejects.toThrow(/needs an email/);
  });

  it("saves the class teacher flag, this year's classes only", async () => {
    const { id } = await createPerson(SUPER, person({ classes: [{ class_id: IDS.class1, is_class_teacher: true }, { class_id: IDS.class2, is_class_teacher: false }] }));
    const rows = await t.database.query<{ class_id: string; f: number }>("select class_id, is_class_teacher f from class_teachers where teacher_id = ? order by class_id", [id]);
    expect(rows.map((r) => [r.class_id, Boolean(r.f)]).sort()).toEqual([[IDS.class1, true], [IDS.class2, false]].sort());
    await expect(createPerson(SUPER, person({ classes: [{ class_id: randomUUID(), is_class_teacher: false }] }))).rejects.toThrow(/current year/);
    const [listed] = (await listPeople(SUPER, { q: "Test Person" })).filter((x) => x.id === id);
    expect(listed.classes.find((c) => c.id === IDS.class1)?.isClassTeacher).toBe(true);
  });
});

describe("roles", () => {
  it("an admin manages teachers only: no admin roles, no editing admins", async () => {
    const admin = await withLogin({ role: "admin", full_name: "Plain Admin" });
    const asAdmin = viewer(admin.id, "admin");
    await expect(createPerson(asAdmin, person({ role: "admin", email: email() }))).rejects.toThrow(/can't give that role/);
    const { id: teacher } = await createPerson(asAdmin, person({ full_name: "By Admin" }));
    await expect(updatePerson(asAdmin, teacher, person({ role: "admin" }))).rejects.toThrow(/can't give that role/);
    await expect(updatePerson(asAdmin, IDS.headmaster, person({ role: "super_admin" }))).rejects.toThrow(/can't change this account/);
    const other = await withLogin({ role: "admin" });
    await expect(updatePerson(asAdmin, other.id, other.input)).rejects.toThrow(/can't change this account/);
  });

  it("teachers can't manage people at all", async () => {
    await expect(createPerson(viewer(IDS.teacher1, "teacher"), person())).rejects.toThrow(/not allowed/);
    await expect(listPeople(viewer(IDS.teacher1, "teacher"))).rejects.toThrow(/not allowed/);
  });

  it("a stale session can't act: the actor is re-checked in the database", async () => {
    const admin = await withLogin({ role: "admin" });
    await updatePerson(SUPER, admin.id, { ...admin.input, role: "teacher" });
    await expect(createPerson(viewer(admin.id, "admin"), person())).rejects.toThrow(/not allowed/);
  });

  it("nobody changes their own role or deactivates themselves", async () => {
    const me = await withLogin({ role: "super_admin" });
    const asMe = viewer(me.id, "super_admin");
    await expect(updatePerson(asMe, me.id, { ...me.input, role: "admin" })).rejects.toThrow(/own role/);
    await expect(updatePerson(asMe, me.id, { ...me.input, active: false })).rejects.toThrow(/deactivate yourself/);
    await updatePerson(SUPER, me.id, { ...me.input, role: "teacher" }); // tidy up: one super admin again
  });

  it("the last active super admin stays: two super admins demoting each other at once leaves one", async () => {
    const [head] = await t.database.query<{ full_name: string }>("select full_name from profiles where id = ?", [IDS.headmaster]);
    const headInput = person({ full_name: head.full_name, role: "super_admin", email: "head@test.invalid" });
    for (const change of [{ role: "admin" as const }, { active: false }]) {
      const other = await withLogin({ role: "super_admin" });
      const out = await Promise.allSettled([
        updatePerson(SUPER, other.id, { ...other.input, ...change }),
        updatePerson(viewer(other.id, "super_admin"), IDS.headmaster, { ...headInput, ...change }),
      ]);
      expect(out.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      const left = await t.database.query<{ id: string }>("select id from profiles where role = 'super_admin' and active");
      expect(left).toHaveLength(1);
      // put things back: the fixture's super admin is the only one again
      if (left[0].id !== IDS.headmaster) {
        await updatePerson(viewer(other.id, "super_admin"), IDS.headmaster, headInput);
      }
      await t.database.query("update profiles set role = 'teacher', active = true where id = ?", [other.id]);
    }
    // and with only one left, a stale super admin session can't change it
    const gone = await withLogin({ role: "super_admin" });
    await updatePerson(SUPER, gone.id, { ...gone.input, role: "teacher" });
    await expect(updatePerson(viewer(gone.id, "super_admin"), IDS.headmaster, { ...headInput, role: "admin" })).rejects.toThrow(/not allowed/);
  });
  it("role changes and admin access are written to the audit log", async () => {
    const p = await withLogin();
    const until = new Date(Date.now() + 7 * 86_400_000);
    await updatePerson(SUPER, p.id, { ...p.input, role: "admin", admin_access_until: until });
    await updatePerson(SUPER, p.id, { ...p.input, role: "teacher" });
    const rows = await t.database.query<{ action: string; details: unknown }>(
      "select action, details from audit_log where target_id = ? order by created_at, action", [p.id]);
    expect(rows.map((r) => r.action)).toEqual(expect.arrayContaining(["create", "role", "admin_access"]));
    const roleChanges = rows.filter((r) => r.action === "role").map((r) => r.details);
    expect(roleChanges).toEqual(expect.arrayContaining([{ from: "teacher", to: "admin" }, { from: "admin", to: "teacher" }]));
  });
});

describe("temporary admin access", () => {
  it("is admin until the date, then a teacher again: in the session and in the data rules", async () => {
    const p = await withLogin({ classes: [{ class_id: IDS.class1, is_class_teacher: true }] });
    const claims = await signIn(p.email, p.password);
    const soon = new Date(Date.now() + 86_400_000);
    await updatePerson(SUPER, p.id, { ...p.input, role: "admin", admin_access_until: soon });

    const now = await loadSessionUser(db, claims);
    expect(now?.profile.role).toBe("admin");
    expect(await t.as(p.id).count("registrations")).toBeGreaterThanOrEqual(0);
    const all = await t.as(p.id).count("students");

    // the date passes
    await t.database.query("update profiles set admin_access_until = ? where id = ?", [new Date(Date.now() - 60_000), p.id]);
    expect((await loadSessionUser(db, claims))?.profile.role).toBe("teacher");
    expect((await checkLogin(db, p.email, p.password, device()))).toMatchObject({ ok: true, user: { role: "teacher" } });
    const mine = await t.as(p.id).count("students");
    expect(mine).toBeLessThan(all);
    expect(await t.as(p.id).count("registrations")).toBe(0);
    await expect(createPerson(viewer(p.id, "admin"), person())).rejects.toThrow(/not allowed/);
    // their classes were kept all along
    expect(await t.database.query("select 1 from class_teachers where teacher_id = ?", [p.id])).toHaveLength(1);
  });

  it("is cleared when the role is no longer admin", async () => {
    const p = await withLogin();
    await updatePerson(SUPER, p.id, { ...p.input, role: "admin", admin_access_until: new Date(Date.now() + 86_400_000) });
    await updatePerson(SUPER, p.id, { ...p.input, role: "teacher", admin_access_until: new Date(Date.now() + 86_400_000) });
    const [row] = await t.database.query<{ u: Date | null }>("select admin_access_until u from profiles where id = ?", [p.id]);
    expect(row.u).toBeNull();
  });
});

describe("deactivation and passwords", () => {
  it("a deactivated person can't sign in, and their sign-ins end at once", async () => {
    const p = await withLogin();
    const claims = await signIn(p.email, p.password);
    await updatePerson(SUPER, p.id, { ...p.input, active: false });
    expect(await loadSessionUser(db, claims)).toBeNull();
    expect(await checkLogin(db, p.email, p.password, device())).toMatchObject({ ok: false });
    expect(await createResetLink(db, p.email)).toBeNull(); // no reset or invite link either
    expect((await auditOf(p.id)).map((a) => a.action)).toContain("deactivate");
  });

  it("the temporary-password fallback forces a change and ends sign-ins", async () => {
    const p = await withLogin();
    const claims = await signIn(p.email, p.password);
    const temp = await resetToTemporaryPassword(SUPER, p.id);
    expect(await loadSessionUser(db, claims)).toBeNull();
    expect(await checkLogin(db, p.email, temp, device())).toMatchObject({ ok: true, user: { mustChangePassword: true } });
    await expect(resetToTemporaryPassword(SUPER, IDS.headmaster)).rejects.toThrow(/Account page/);
  });
});
