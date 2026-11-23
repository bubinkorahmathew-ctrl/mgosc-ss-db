import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createTeacherAccount, listTeacherEmails, resetTeacherAccountPassword, setTeacherAccountActive, updateTeacherAccount,
} from "@/lib/authn/accounts";
import { createFirstHeadmaster, resetHeadmasterPassword } from "@/lib/authn/headmaster";
import { changePassword, signInWithPassword } from "@/lib/authn/login";
import { hashPassword } from "@/lib/authn/password";
import { endSession, resolveSession, SESSION_DAYS } from "@/lib/authn/session";
import { beginAttempt, SIGN_IN_LIMITS } from "@/lib/authn/throttle";
import type { TableName } from "@/lib/db/schema";
import { createTiDbTest, IDS, type TiDbTest } from "./harness";

const HEAD = { email: "head@test.invalid", password: "test-only-headmaster-pass" };

let t: TiDbTest;
beforeAll(async () => {
  t = await createTiDbTest();
  await t.database.query("insert into users (id, email, password_hash) values (?, ?, ?)",
    [IDS.headmaster, HEAD.email, await hashPassword(HEAD.password)]);
});
afterAll(async () => {
  await t?.destroy();
});

const client = () => ({ ip: randomUUID(), salt: "test-salt" });
const signIn = (email: string, password: string, from = client()) => signInWithPassword(t.database, email, password, from);

async function tokenFor(email: string, password: string) {
  const result = await signIn(email, password);
  if (!result.ok) throw new Error(result.reason);
  return result.session.token;
}
async function newTeacher(class_ids: string[] = [IDS.class1]) {
  const email = `${randomUUID()}@test.invalid`;
  const { id, password } = await createTeacherAccount(t.database, IDS.headmaster,
    { email, full_name: "Test Teacher", phone: null, class_ids });
  return { id, email, password };
}

describe("sign in", () => {
  it("returns the role and a working session", async () => {
    const result = await signIn(HEAD.email, HEAD.password);
    expect(result).toMatchObject({ ok: true, role: "headmaster" });
    if (!result.ok) return;
    const user = await resolveSession(t.database, result.session.token);
    expect(user).toMatchObject({ id: IDS.headmaster, email: HEAD.email, profile: { role: "headmaster", active: true } });
    expect(Object.keys(user!.profile).sort()).toEqual(["active", "created_at", "full_name", "id", "phone", "role"]);
  });

  it("an unknown email and a wrong password look identical", async () => {
    const a = await signIn("nobody@test.invalid", "whatever");
    const b = await signIn(HEAD.email, "whatever");
    expect(a).toEqual({ ok: false, reason: "wrong" });
    expect(b).toEqual(a);
  });

  it("quotes in the email are data", async () => {
    expect(await signIn("' or '1'='1", HEAD.password)).toEqual({ ok: false, reason: "wrong" });
  });

  it("the database stores neither the token nor the password", async () => {
    const teacher = await newTeacher();
    const token = await tokenFor(teacher.email, teacher.password);
    const rows = [
      ...(await t.database.query("select * from sessions where user_id = ?", [teacher.id])),
      ...(await t.database.query("select * from users where id = ?", [teacher.id])),
    ];
    expect(JSON.stringify(rows)).not.toContain(token);
    expect(JSON.stringify(rows)).not.toContain(teacher.password);
  });

  it("a deactivated account is told so only with the right password", async () => {
    const teacher = await newTeacher();
    await setTeacherAccountActive(t.database, IDS.headmaster, teacher.id, false);
    expect(await signIn(teacher.email, "guess")).toEqual({ ok: false, reason: "wrong" });
    expect(await signIn(teacher.email, teacher.password)).toEqual({ ok: false, reason: "inactive" });
  });

  it("a reset during sign-in never leaves a session for the old password", async () => {
    const teacher = await newTeacher();
    const [login] = await Promise.all([
      signIn(teacher.email, teacher.password),
      resetTeacherAccountPassword(t.database, IDS.headmaster, teacher.id),
    ]);
    if (login.ok) expect(await resolveSession(t.database, login.session.token)).toBeNull();
    expect(await t.database.query("select 1 from sessions where user_id = ?", [teacher.id])).toEqual([]);
  });
});

describe("sessions", () => {
  it("expire", async () => {
    const token = await tokenFor(HEAD.email, HEAD.password);
    const later = new Date(Date.now() + SESSION_DAYS * 86_400_000 + 60_000);
    expect(await resolveSession(t.database, token, later)).toBeNull();
  });

  it("sign-out ends only that device's session", async () => {
    const one = await tokenFor(HEAD.email, HEAD.password);
    const two = await tokenFor(HEAD.email, HEAD.password);
    await endSession(t.database, one);
    expect(await resolveSession(t.database, one)).toBeNull();
    expect(await resolveSession(t.database, two)).not.toBeNull();
  });

  it("forged and malformed tokens are refused", async () => {
    for (const token of [undefined, "", "x", "A".repeat(43), `${"A".repeat(42)}'`, "A".repeat(5000)]) {
      expect(await resolveSession(t.database, token)).toBeNull();
    }
  });

  it("stop working as soon as the profile is inactive, however that happened", async () => {
    const teacher = await newTeacher();
    const token = await tokenFor(teacher.email, teacher.password);
    await t.database.query("update profiles set active = false where id = ?", [teacher.id]);
    expect(await resolveSession(t.database, token)).toBeNull();
  });

  it("are not revived by re-activation", async () => {
    const teacher = await newTeacher();
    const token = await tokenFor(teacher.email, teacher.password);
    await setTeacherAccountActive(t.database, IDS.headmaster, teacher.id, false);
    await setTeacherAccountActive(t.database, IDS.headmaster, teacher.id, true);
    expect(await resolveSession(t.database, token)).toBeNull();
  });
});

describe("rate limit", () => {
  const { pair, ip, account } = SIGN_IN_LIMITS;
  const attempt = (who: string, from: string, now?: Date) => beginAttempt(t.database, who, from, "test-salt", now);

  it("blocks one account from one address, even with the right password", async () => {
    const teacher = await newTeacher();
    const from = client();
    for (let i = 0; i < pair.max; i++) expect(await signIn(teacher.email, "guess", from)).toEqual({ ok: false, reason: "wrong" });
    expect(await signIn(teacher.email, teacher.password, from)).toEqual({ ok: false, reason: "limited" });
    expect((await signIn(teacher.email, teacher.password)).ok).toBe(true); // another address
  });

  it("parallel guesses can't slip through", async () => {
    const who = randomUUID();
    const from = randomUUID();
    const all = await Promise.all(Array.from({ length: 20 }, () => attempt(who, from)));
    expect(all.filter((a) => a.allowed).length).toBeLessThanOrEqual(pair.max);
  });

  it("blocks one address trying many accounts", async () => {
    const from = randomUUID();
    for (let i = 0; i < ip.max; i++) expect((await attempt(randomUUID(), from)).allowed).toBe(true);
    expect((await attempt(randomUUID(), from)).allowed).toBe(false);
  });

  it("blocks one account from many addresses", async () => {
    const who = randomUUID();
    for (let i = 0; i < account.max; i++) expect((await attempt(who, randomUUID())).allowed).toBe(true);
    expect((await attempt(who, randomUUID())).allowed).toBe(false);
  });

  it("successful sign-ins from a shared address don't count", async () => {
    const from = randomUUID();
    for (let i = 0; i < ip.max + 2; i++) {
      const a = await attempt(randomUUID(), from);
      if (!a.allowed) throw new Error("blocked");
      await a.succeeded();
    }
  });

  it("lifts after the window, and retrying while blocked doesn't extend it", async () => {
    const who = randomUUID();
    const from = randomUUID();
    const start = new Date();
    const at = (minutes: number) => new Date(start.getTime() + minutes * 60_000);
    for (let i = 0; i < pair.max; i++) await attempt(who, from, start);
    expect((await attempt(who, from, at(pair.minutes - 1))).allowed).toBe(false);
    expect((await attempt(who, from, at(pair.minutes + 1))).allowed).toBe(true);
  });

  it("stores neither the email nor the IP", async () => {
    await attempt("private@test.invalid", "203.0.113.9");
    const all = JSON.stringify(await t.database.query("select * from sign_in_attempts"));
    expect(all).not.toContain("private@test.invalid");
    expect(all).not.toContain("203.0.113.9");
  });
});

describe("own password", () => {
  it("changing it signs out other devices and keeps this one", async () => {
    const teacher = await newTeacher();
    const other = await tokenFor(teacher.email, teacher.password);
    const result = await changePassword(t.database, teacher.id, teacher.password, "a-new-password", client());
    if (!result.ok) throw new Error(result.reason);
    expect(await resolveSession(t.database, other)).toBeNull();
    expect(await resolveSession(t.database, result.session.token)).not.toBeNull();
    expect((await signIn(teacher.email, teacher.password)).ok).toBe(false);
    expect((await signIn(teacher.email, "a-new-password")).ok).toBe(true);
  });

  it("needs the current password, and guessing is limited", async () => {
    const teacher = await newTeacher();
    const from = client();
    for (let i = 0; i < SIGN_IN_LIMITS.pair.max; i++) {
      expect(await changePassword(t.database, teacher.id, "guess", "another-password", from)).toEqual({ ok: false, reason: "wrong" });
    }
    expect(await changePassword(t.database, teacher.id, teacher.password, "another-password", from))
      .toEqual({ ok: false, reason: "limited" });
  });
});

describe("teacher accounts", () => {
  it("are created with a login, profile and classes", async () => {
    const teacher = await newTeacher([IDS.class2]);
    expect(await signIn(teacher.email, teacher.password)).toMatchObject({ ok: true, role: "teacher" });
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

  it("a reset replaces the password and ends every session", async () => {
    const teacher = await newTeacher();
    const token = await tokenFor(teacher.email, teacher.password);
    const fresh = await resetTeacherAccountPassword(t.database, IDS.headmaster, teacher.id);
    expect(await resolveSession(t.database, token)).toBeNull();
    expect((await signIn(teacher.email, teacher.password)).ok).toBe(false);
    expect((await signIn(teacher.email, fresh)).ok).toBe(true);
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

  it("the teacher functions can't touch a headmaster", async () => {
    const id = IDS.headmaster;
    await expect(resetTeacherAccountPassword(t.database, id, id)).rejects.toThrow(/not a teacher/);
    await expect(setTeacherAccountActive(t.database, id, id, false)).rejects.toThrow(/not a teacher/);
    await expect(updateTeacherAccount(t.database, id, id, { full_name: "X", phone: null, class_ids: [] }))
      .rejects.toThrow(/not a teacher/);
  });

  it("login tables are unreachable through the data client", async () => {
    for (const table of ["users", "sessions", "sign_in_attempts"]) {
      await expect(t.as(IDS.headmaster).select(table as TableName)).rejects.toThrow(/unknown table/);
    }
  });
});

// last: changes the headmaster
describe("headmaster command", () => {
  it("refuses a second headmaster", async () => {
    await expect(createFirstHeadmaster(t.database,
      { email: "two@test.invalid", full_name: "Second", password: "second-headmaster" })).rejects.toThrow(/already exists/);
  });

  it("resets only a headmaster, and signs them out", async () => {
    const teacher = await newTeacher();
    await expect(resetHeadmasterPassword(t.database, teacher.email, "not-for-teachers")).rejects.toThrow(/not a super admin/);
    const token = await tokenFor(HEAD.email, HEAD.password);
    await resetHeadmasterPassword(t.database, HEAD.email, "replacement-password");
    expect(await resolveSession(t.database, token)).toBeNull();
    expect((await signIn(HEAD.email, "replacement-password")).ok).toBe(true);
  });

  it("creates exactly one, even when run twice at once", async () => {
    await t.database.query("delete from profiles where role = 'headmaster'");
    const run = (n: number) => createFirstHeadmaster(t.database,
      { email: `first${n}@test.invalid`, full_name: "First", password: "first-headmaster-pass" });
    const out = await Promise.allSettled([run(1), run(2)]);
    expect(out.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await t.database.query("select id from profiles where role = 'headmaster'")).toHaveLength(1);
  });
});
