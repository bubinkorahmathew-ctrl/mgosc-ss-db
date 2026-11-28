/**
 * Phase S2 sign-in on a throwaway TiDB database: lockout, forced password change, sign-ins that
 * stop working after a reset or deactivation, the old-hash upgrade and the headmaster seed.
 * Auth.js itself only carries { id, authAt } in its cookie; everything checked here is ours.
 */
import { randomBytes, randomUUID, scryptSync } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDrizzle, type Db } from "@/db/client";
import { beginLoginAttempt, LOGIN_LIMITS } from "@/lib/authn/attempts";
import {
  createTeacherAccount, listTeacherEmails, resetTeacherAccountPassword, setTeacherAccountActive, updateTeacherAccount,
} from "@/lib/authn/accounts";
import { createFirstHeadmaster, resetHeadmasterPassword } from "@/lib/authn/headmaster";
import { changeOwnPassword, checkLogin, type Client, loadSessionUser, loginTarget, SESSION_DAYS, type SessionClaims } from "@/lib/authn/login";
import { hashPassword } from "@/lib/authn/password";
import type { TableName } from "@/lib/db/schema";
import { createTiDbTest, IDS, type TiDbTest } from "./harness";

const HEAD = { email: "head@test.invalid", password: "test-only-headmaster-pass" };
const SECRET = "test-secret-that-is-long-enough-1234567890";

let t: TiDbTest;
let db: Db;
beforeAll(async () => {
  t = await createTiDbTest();
  db = createDrizzle(t.url);
  await t.database.query("insert into users (id, email, password_hash, password_changed_at) values (?, ?, ?, ?)",
    [IDS.headmaster, HEAD.email, await hashPassword(HEAD.password), new Date(Date.now() - 60_000)]);
});
afterAll(async () => {
  await t?.destroy();
});

const device = (): Client => ({ device: randomUUID(), secret: SECRET });
const login = (email: string, password: string, from = device(), now?: Date) => checkLogin(db, email, password, from, now);

/** What Auth.js would put in the cookie after this sign-in. */
async function claimsFor(email: string, password: string): Promise<SessionClaims> {
  const result = await login(email, password);
  if (!result.ok) throw new Error(result.reason);
  return { id: result.user.id, authAt: result.user.authAt };
}
const user = (claims: SessionClaims) => loadSessionUser(db, claims);

async function newTeacher(class_ids: string[] = [IDS.class1]) {
  const email = `${randomUUID()}@test.invalid`;
  const { id, password } = await createTeacherAccount(t.database, IDS.headmaster,
    { email, full_name: "Test Teacher", phone: null, class_ids });
  return { id, email, password };
}
/** A teacher who has already replaced the temporary password. */
async function settledTeacher() {
  const teacher = await newTeacher();
  const password = `own-${randomUUID()}`;
  const changed = await changeOwnPassword(db, teacher.id, teacher.password, password, device());
  if (!changed.ok) throw new Error(changed.reason);
  return { ...teacher, password };
}

describe("sign in", () => {
  it("returns the role, and the sign-in resolves to the profile", async () => {
    const result = await login(HEAD.email, HEAD.password);
    expect(result).toMatchObject({ ok: true, user: { id: IDS.headmaster, role: "super_admin", mustChangePassword: false } });
    if (!result.ok) return;
    expect(await user({ id: result.user.id, authAt: result.user.authAt })).toMatchObject({
      id: IDS.headmaster, email: HEAD.email, mustChangePassword: false, profile: { role: "super_admin", active: true },
    });
    expect(await loginTarget(db, HEAD.email.toUpperCase())).toEqual({ role: "super_admin", mustChangePassword: false });
  });

  it("an unknown email and a wrong password look identical", async () => {
    const a = await login("nobody@test.invalid", "whatever");
    const b = await login(HEAD.email, "whatever");
    expect(a).toEqual({ ok: false, reason: "invalid" });
    expect(b).toEqual(a);
  });

  it("quotes in the email are data", async () => {
    expect(await login("' or '1'='1", HEAD.password)).toEqual({ ok: false, reason: "invalid" });
  });

  it("the database stores neither the password nor an email or address in the lockout table", async () => {
    const teacher = await newTeacher();
    await login(teacher.email, "a-wrong-guess", { device: "203.0.113.9", secret: SECRET });
    expect(JSON.stringify(await t.database.query("select * from users where id = ?", [teacher.id]))).not.toContain(teacher.password);
    const attempts = JSON.stringify(await t.database.query("select * from login_attempts"));
    expect(attempts).not.toContain(teacher.email);
    expect(attempts).not.toContain("203.0.113.9");
  });

  it("a deactivated account is told so only with the right password", async () => {
    const teacher = await newTeacher();
    await setTeacherAccountActive(t.database, IDS.headmaster, teacher.id, false);
    expect(await login(teacher.email, "guess-guess")).toEqual({ ok: false, reason: "invalid" });
    expect(await login(teacher.email, teacher.password)).toEqual({ ok: false, reason: "inactive" });
  });

  it("records the time of the last sign-in", async () => {
    const teacher = await newTeacher();
    await login(teacher.email, teacher.password);
    const [row] = await t.database.query<{ at: Date | null }>("select last_login_at at from users where id = ?", [teacher.id]);
    expect(row.at).not.toBeNull();
  });

  it("an old (scrypt) password still works once, and is then stored as bcrypt", async () => {
    const teacher = await newTeacher();
    const salt = randomBytes(16);
    const key = scryptSync("an-old-password", salt, 32, { N: 2 ** 15, r: 8, p: 3, maxmem: 128 * 1024 * 1024 });
    const old = ["scrypt", 15, 8, 3, salt.toString("base64url"), key.toString("base64url")].join("$");
    await t.database.query("update users set password_hash = ? where id = ?", [old, teacher.id]);
    expect((await login(teacher.email, "an-old-password")).ok).toBe(true);
    const [row] = await t.database.query<{ h: string }>("select password_hash h from users where id = ?", [teacher.id]);
    expect(row.h).toMatch(/^\$2[aby]\$12\$/);
    expect((await login(teacher.email, "an-old-password")).ok).toBe(true);
  });

  it("a reset during sign-in never leaves a working sign-in for the old password", async () => {
    for (let i = 0; i < 3; i++) {
      const teacher = await settledTeacher();
      const [result] = await Promise.all([
        login(teacher.email, teacher.password),
        resetTeacherAccountPassword(t.database, IDS.headmaster, teacher.id),
      ]);
      if (result.ok) expect(await user({ id: result.user.id, authAt: result.user.authAt })).toBeNull();
    }
  });
});

describe("sign-ins (the JWT claims)", () => {
  it("expire after 14 days however often they are used", async () => {
    const claims = await claimsFor(HEAD.email, HEAD.password);
    const later = claims.authAt + SESSION_DAYS * 86_400_000 + 60_000;
    expect(await loadSessionUser(db, claims, later)).toBeNull();
    expect(await loadSessionUser(db, claims, claims.authAt + 86_400_000)).not.toBeNull();
  });

  it("without “Remember me” a sign-in ends after 12 hours", async () => {
    const claims = { ...(await claimsFor(HEAD.email, HEAD.password)), remember: false };
    expect(await loadSessionUser(db, claims, claims.authAt + 11 * 3_600_000)).not.toBeNull();
    expect(await loadSessionUser(db, claims, claims.authAt + 13 * 3_600_000)).toBeNull();
    // with it (or from before the option existed): 14 days
    expect(await loadSessionUser(db, { ...claims, remember: true }, claims.authAt + 13 * 3_600_000)).not.toBeNull();
    expect(await loadSessionUser(db, { id: claims.id, authAt: claims.authAt }, claims.authAt + 13 * 3_600_000)).not.toBeNull();
  });

  it("forged and malformed claims are refused", async () => {
    const now = Date.now();
    for (const claims of [null, undefined, {}, { id: IDS.headmaster }, { id: "x", authAt: now },
      { id: `${IDS.headmaster}' or 1=1`, authAt: now }, { id: IDS.headmaster, authAt: now + 3_600_000 },
      { id: randomUUID(), authAt: now }]) {
      expect(await loadSessionUser(db, claims as SessionClaims)).toBeNull();
    }
  });

  it("stop working as soon as the profile is inactive, however that happened", async () => {
    const teacher = await settledTeacher();
    const claims = await claimsFor(teacher.email, teacher.password);
    await t.database.query("update profiles set active = false where id = ?", [teacher.id]);
    expect(await user(claims)).toBeNull();
  });

  it("are not revived by re-activation", async () => {
    const teacher = await settledTeacher();
    const claims = await claimsFor(teacher.email, teacher.password);
    await setTeacherAccountActive(t.database, IDS.headmaster, teacher.id, false);
    await setTeacherAccountActive(t.database, IDS.headmaster, teacher.id, true);
    expect(await user(claims)).toBeNull();
    expect(await user(await claimsFor(teacher.email, teacher.password))).not.toBeNull();
  });
});

describe("lockout", () => {
  const { pair, device: byDevice, account } = LOGIN_LIMITS;
  const attempt = (who: string, from: string, now?: Date) => beginLoginAttempt(db, { account: who, device: from, secret: SECRET, now });

  it("5 failures from one device lock that account there, even with the right password", async () => {
    expect(pair).toEqual({ max: 5, minutes: 15 });
    const teacher = await newTeacher();
    const from = device();
    for (let i = 0; i < pair.max; i++) expect(await login(teacher.email, "guess-guess", from)).toEqual({ ok: false, reason: "invalid" });
    expect(await login(teacher.email, teacher.password, from)).toEqual({ ok: false, reason: "limited" });
    expect((await login(teacher.email, teacher.password)).ok).toBe(true); // another device
  });

  it("lifts after 15 minutes, and retrying while locked doesn't extend it", async () => {
    const teacher = await newTeacher();
    const from = device();
    const start = new Date();
    const at = (minutes: number) => new Date(start.getTime() + minutes * 60_000);
    for (let i = 0; i < pair.max; i++) await login(teacher.email, "guess-guess", from, start);
    expect(await login(teacher.email, teacher.password, from, at(14))).toEqual({ ok: false, reason: "limited" });
    expect((await login(teacher.email, teacher.password, from, at(16))).ok).toBe(true);
  });

  it("a successful sign-in clears that device's failures", async () => {
    const teacher = await newTeacher();
    const from = device();
    for (let i = 0; i < pair.max - 1; i++) await login(teacher.email, "guess-guess", from);
    expect((await login(teacher.email, teacher.password, from)).ok).toBe(true);
    for (let i = 0; i < pair.max - 1; i++) await login(teacher.email, "guess-guess", from);
    expect((await login(teacher.email, teacher.password, from)).ok).toBe(true);
  });

  it("parallel guesses can't slip through", async () => {
    const who = randomUUID();
    const from = randomUUID();
    const all = await Promise.all(Array.from({ length: 20 }, () => attempt(who, from)));
    expect(all.filter((a) => a.allowed).length).toBeLessThanOrEqual(pair.max);
  });

  it("one device trying many accounts is stopped", async () => {
    const from = randomUUID();
    for (let i = 0; i < byDevice.max; i++) expect((await attempt(randomUUID(), from)).allowed).toBe(true);
    expect((await attempt(randomUUID(), from)).allowed).toBe(false);
  });

  it("one account tried from many devices has a wider limit", async () => {
    const who = randomUUID();
    for (let i = 0; i < account.max; i++) expect((await attempt(who, randomUUID())).allowed).toBe(true);
    expect((await attempt(who, randomUUID())).allowed).toBe(false);
  });

  it("successful sign-ins from a shared address don't count", async () => {
    const from = randomUUID();
    for (let i = 0; i < byDevice.max + 2; i++) {
      const a = await attempt(randomUUID(), from);
      if (!a.allowed) throw new Error("blocked");
      await a.succeeded();
    }
  });
});

describe("temporary passwords (forced change)", () => {
  it("a new teacher must choose a password before anything else", async () => {
    const teacher = await newTeacher();
    const result = await login(teacher.email, teacher.password);
    expect(result).toMatchObject({ ok: true, user: { role: "teacher", mustChangePassword: true } });
    if (!result.ok) return;
    expect(await user({ id: teacher.id, authAt: result.user.authAt })).toMatchObject({ mustChangePassword: true });

    const fresh = "my-own-new-password";
    expect(await changeOwnPassword(db, teacher.id, teacher.password, fresh, device())).toEqual({ ok: true, email: teacher.email });
    // the sign-in made with the temporary password is over; a new one with the new password is normal
    expect(await user({ id: teacher.id, authAt: result.user.authAt })).toBeNull();
    const again = await claimsFor(teacher.email, fresh);
    expect(await user(again)).toMatchObject({ mustChangePassword: false });
    expect((await login(teacher.email, teacher.password)).ok).toBe(false);
  });

  it("the temporary password is shown once and only its hash is stored", async () => {
    const teacher = await newTeacher();
    const [row] = await t.database.query<{ h: string; m: number }>("select password_hash h, must_change_password m from users where id = ?", [teacher.id]);
    expect(row.h).not.toContain(teacher.password);
    expect(Boolean(row.m)).toBe(true);
  });
});

describe("own password", () => {
  it("changing it ends every other sign-in", async () => {
    const teacher = await settledTeacher();
    const other = await claimsFor(teacher.email, teacher.password);
    expect((await changeOwnPassword(db, teacher.id, teacher.password, "a-new-password", device())).ok).toBe(true);
    expect(await user(other)).toBeNull();
    expect((await login(teacher.email, teacher.password)).ok).toBe(false);
    expect((await login(teacher.email, "a-new-password")).ok).toBe(true);
  });

  it("needs the current password, and guessing is locked after 5", async () => {
    const teacher = await settledTeacher();
    const from = device();
    for (let i = 0; i < LOGIN_LIMITS.pair.max; i++) {
      expect(await changeOwnPassword(db, teacher.id, "guess-guess", "another-password", from)).toEqual({ ok: false, reason: "invalid" });
    }
    expect(await changeOwnPassword(db, teacher.id, teacher.password, "another-password", from)).toEqual({ ok: false, reason: "limited" });
  });
});

describe("teacher accounts", () => {
  it("are created with a login, profile and classes", async () => {
    const teacher = await newTeacher([IDS.class2]);
    expect(await login(teacher.email, teacher.password)).toMatchObject({ ok: true, user: { role: "teacher" } });
    const visible = await t.as(teacher.id).select("classes");
    expect(visible.map((c) => c.id)).toEqual([IDS.class2]);
  });

  it("a bad class leaves nothing behind", async () => {
    const email = `${randomUUID()}@test.invalid`;
    await expect(createTeacherAccount(t.database, IDS.headmaster,
      { email, full_name: "Half Created", phone: null, class_ids: [randomUUID()] })).rejects.toThrow(/current year/);
    expect(await t.database.query("select 1 from users where email = ?", [email])).toEqual([]);
    expect(await t.database.query("select 1 from profiles where full_name = 'Half Created'")).toEqual([]);
  });

  it("emails are unique", async () => {
    await expect(createTeacherAccount(t.database, IDS.headmaster,
      { email: HEAD.email, full_name: "Copy", phone: null, class_ids: [] })).rejects.toThrow(/duplicate key/);
  });

  it("editing replaces this year's classes and keeps past years", async () => {
    const teacher = await newTeacher([IDS.class1]);
    const year = randomUUID();
    const old = randomUUID();
    await t.database.query(
      "insert into academic_years (id, name, start_date, end_date) values (?, '2020-21', '2020-06-01', '2021-03-31')", [year]);
    await t.database.query("insert into classes (id, name, academic_year_id) values (?, 'Old class', ?)", [old, year]);
    await t.database.query("insert into class_teachers (class_id, teacher_id) values (?, ?)", [old, teacher.id]);
    await updateTeacherAccount(t.database, IDS.headmaster, teacher.id,
      { full_name: "Renamed", phone: "9000000000", class_ids: [IDS.class3] });
    const rows = await t.database.query<{ class_id: string }>("select class_id from class_teachers where teacher_id = ?", [teacher.id]);
    expect(rows.map((r) => r.class_id).sort()).toEqual([old, IDS.class3].sort());
  });

  it("keep the 12th passed year, and a changed email becomes the sign-in email", async () => {
    const email = `${randomUUID()}@test.invalid`;
    const made = await createTeacherAccount(t.database, IDS.headmaster,
      { email, full_name: "Year Teacher", phone: null, twelfth_passed_year: 2010, class_ids: [] });
    const year = async () => (await t.database.query<{ y: number | null }>(
      "select twelfth_passed_year y from profiles where id = ?", [made.id]))[0].y;
    expect(await year()).toBe(2010);

    const moved = `${randomUUID()}@test.invalid`;
    await updateTeacherAccount(t.database, IDS.headmaster, made.id,
      { full_name: "Year Teacher", phone: null, email: moved, twelfth_passed_year: 2012, class_ids: [] });
    expect(await year()).toBe(2012);
    expect((await login(email, made.password)).ok).toBe(false);
    expect((await login(moved, made.password)).ok).toBe(true);

    // leaving the year out keeps it; another account's email is refused
    await updateTeacherAccount(t.database, IDS.headmaster, made.id, { full_name: "Year Teacher", phone: null, class_ids: [] });
    expect(await year()).toBe(2012);
    await expect(updateTeacherAccount(t.database, IDS.headmaster, made.id,
      { full_name: "Year Teacher", phone: null, email: HEAD.email, class_ids: [] })).rejects.toThrow(/duplicate key/);
    expect((await login(moved, made.password)).ok).toBe(true);
  });

  it("a reset replaces the password and ends every sign-in", async () => {
    const teacher = await settledTeacher();
    const claims = await claimsFor(teacher.email, teacher.password);
    const fresh = await resetTeacherAccountPassword(t.database, IDS.headmaster, teacher.id);
    expect(await user(claims)).toBeNull();
    expect((await login(teacher.email, teacher.password)).ok).toBe(false);
    expect((await login(teacher.email, fresh)).ok).toBe(true);
  });

  it("teachers can't manage accounts or list emails", async () => {
    const { id: target } = await newTeacher();
    const details = { full_name: "X", phone: null, class_ids: [] };
    const me = IDS.teacher1;
    await expect(createTeacherAccount(t.database, me, { ...details, email: "x@test.invalid" })).rejects.toThrow(/not allowed/);
    await expect(updateTeacherAccount(t.database, me, target, details)).rejects.toThrow(/not allowed/);
    await expect(setTeacherAccountActive(t.database, me, target, false)).rejects.toThrow(/not allowed/);
    await expect(resetTeacherAccountPassword(t.database, me, target)).rejects.toThrow(/not allowed/);
    expect((await listTeacherEmails(t.database, me)).size).toBe(0);
    expect((await listTeacherEmails(t.database, IDS.headmaster)).size).toBeGreaterThan(0);
  });

  it("the teacher functions can't touch an admin", async () => {
    const id = IDS.headmaster;
    await expect(resetTeacherAccountPassword(t.database, id, id)).rejects.toThrow(/not a teacher/);
    await expect(setTeacherAccountActive(t.database, id, id, false)).rejects.toThrow(/not a teacher/);
    await expect(updateTeacherAccount(t.database, id, id, { full_name: "X", phone: null, class_ids: [] }))
      .rejects.toThrow(/not a teacher/);
  });

  it("login tables are unreachable through the data client", async () => {
    for (const table of ["users", "login_attempts", "rate_limits"]) {
      await expect(t.as(IDS.headmaster).select(table as TableName)).rejects.toThrow(/unknown table/);
    }
  });
});

// last: changes the headmaster
describe("headmaster seed (npm run super-admin)", () => {
  it("refuses a second super admin", async () => {
    await expect(createFirstHeadmaster(db,
      { email: "two@test.invalid", full_name: "Second", password: "second-headmaster" })).rejects.toThrow(/already exists/);
  });

  it("resets only a super admin, signs them out, and needs no forced change", async () => {
    const teacher = await newTeacher();
    await expect(resetHeadmasterPassword(db, teacher.email, "not-for-teachers")).rejects.toThrow(/not a super admin/);
    const claims = await claimsFor(HEAD.email, HEAD.password);
    await resetHeadmasterPassword(db, HEAD.email, "replacement-password");
    expect(await user(claims)).toBeNull();
    expect(await login(HEAD.email, "replacement-password")).toMatchObject({ ok: true, user: { mustChangePassword: false } });
  });

  it("creates exactly one, even when run twice at once", async () => {
    await t.database.query("delete from profiles where role = 'super_admin'");
    const run = (n: number) => createFirstHeadmaster(db,
      { email: `first${n}@test.invalid`, full_name: "First", password: "first-headmaster-pass" });
    const out = await Promise.allSettled([run(1), run(2)]);
    expect(out.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await t.database.query("select id from profiles where role = 'super_admin'")).toHaveLength(1);
    const [made] = await t.database.query<{ email: string }>("select u.email from users u join profiles p on p.id = u.id where p.role = 'super_admin'");
    expect((await login(made.email, "first-headmaster-pass")).ok).toBe(true);
  });
});
