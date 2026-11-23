/** Super admin, admin, teacher: what the school asked for on top of the original rules. */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, afterEach, describe, expect, it } from "vitest";
import { createTeacherAccount, resetTeacherAccountPassword, setTeacherAccountActive } from "@/lib/authn/accounts";
import type { Rows } from "@/lib/db/schema";
import type { Condition } from "@/lib/db/sql";
import { createTiDbTest, IDS, type Sandbox, type TiDbTest } from "./harness";

const ADMIN = "33333333-3333-3333-3333-333333333331";
const OTHER_ADMIN = "33333333-3333-3333-3333-333333333332";

let t: TiDbTest;
let s: Sandbox;
beforeAll(async () => {
  t = await createTiDbTest();
  await t.database.query(
    "insert into profiles (id, full_name, role) values (?, 'Admin One', 'headmaster'), (?, 'Admin Two', 'headmaster')",
    [ADMIN, OTHER_ADMIN]);
});
afterAll(async () => {
  await t?.destroy();
});
beforeEach(async () => {
  s = await t.sandbox();
});
afterEach(async () => {
  await s?.end();
});

const child = (over: Partial<Rows["students"]> = {}): Partial<Rows["students"]> => ({
  full_name: "New Child", dob: "2020-01-01", gender: "female", guardian_phone: "9000000000", school_class: "LKG",
  class_id: IDS.class1, ...over,
});
const byId = (id: string): Condition[] => [["id", "eq", id]];

describe("teacher adds students", () => {
  const t1 = () => s.as(IDS.teacher1);

  it("to an own class, with the next admission number", async () => {
    const [made] = await t1().insert("students", child({ prayer_group: "St. Thomas" }));
    expect(made).toMatchObject({ admission_no: "SS-2026-0011", class_id: IDS.class1, status: "active", prayer_group: "St. Thomas" });
  });
  it("several at once, numbered in order", async () => {
    const made = await t1().insert("students", [child({ full_name: "A" }), child({ full_name: "B" })]);
    expect(made.map((x) => x.admission_no)).toEqual(["SS-2026-0011", "SS-2026-0012"]);
  });
  it("cannot choose the number, status or photo", async () => {
    const [made] = await t1().insert("students", child({ admission_no: "FAKE", status: "passed_out", photo_url: "https://x" }));
    expect(made).toMatchObject({ admission_no: "SS-2026-0011", status: "active", photo_url: null });
  });
  it("not to another class, or to no class", async () => {
    await expect(t1().insert("students", child({ class_id: IDS.class2 }))).rejects.toThrow(/row-level security/);
    await expect(t1().insert("students", child({ class_id: null }))).rejects.toThrow(/row-level security/);
    await expect(t1().insert("students", [child(), child({ class_id: IDS.class3 })])).rejects.toThrow(/row-level security/);
  });
  it("not to a past year's class, even if once assigned", async () => {
    const year = randomUUID();
    const old = randomUUID();
    await s.raw("insert into academic_years (id, name, start_date, end_date) values (?, '2020-21', '2020-06-01', '2021-03-31')", [year]);
    await s.raw("insert into classes (id, name, academic_year_id) values (?, 'Old', ?)", [old, year]);
    await s.raw("insert into class_teachers (class_id, teacher_id) values (?, ?)", [old, IDS.teacher1]);
    await expect(t1().insert("students", child({ class_id: old }))).rejects.toThrow(/current year/);
  });
  it("not when deactivated or signed out", async () => {
    await expect(s.as(null).insert("students", child())).rejects.toThrow(/row-level security/);
    await s.raw("update profiles set active = false where id = ?", [IDS.teacher1]);
    await expect(t1().insert("students", child())).rejects.toThrow(/row-level security/);
  });
  it("still cannot edit, move or delete", async () => {
    const [made] = await t1().insert("students", child());
    expect(await t1().update("students", { address: "x" }, byId(made.id))).toEqual([]);
    expect(await t1().update("students", { class_id: IDS.class2 }, byId(made.id))).toEqual([]);
    expect(await t1().delete("students", byId(made.id))).toEqual([]);
  });
  it("can then record attendance, marks and activities for that student, as themselves", async () => {
    const [made] = await t1().insert("students", child());
    const base = { student_id: made.id, class_id: IDS.class1 };
    const [a] = await t1().upsert("attendance", { ...base, date: "2026-11-22", status: "present", marked_by: IDS.teacher2 });
    const [m] = await t1().upsert("marks", {
      exam_id: IDS.examC1, student_id: made.id, subject_id: IDS.subjectOT, marks_obtained: 30, entered_by: IDS.headmaster,
    });
    const [act] = await t1().insert("activities", {
      ...base, type: "note", title: "Welcome", activity_date: "2026-11-22", created_by: IDS.teacher2,
    });
    expect([a.marked_by, m.entered_by, act.created_by]).toEqual([IDS.teacher1, IDS.teacher1, IDS.teacher1]);
    const [edited] = await t1().update("activities", { notes: "hi", created_by: IDS.teacher2 }, byId(act.id));
    expect(edited.created_by).toBe(IDS.teacher1);
  });
  it("cannot use up certificate numbers", async () => {
    await expect(t1().nextNumber("certificate", 2026)).rejects.toThrow(/not allowed/);
  });
});

describe("certificates", () => {
  const cert = { student_id: IDS.studentC1, class_id: IDS.class1, type: "completion" as const, title: "Certificate", body_text: "Body" };

  it("teachers cannot issue, by any route through the data layer", async () => {
    await expect(s.as(IDS.teacher1).insert("certificates", cert)).rejects.toThrow(/row-level security/);
    await expect(s.as(IDS.teacher1).insert("certificates", [cert, cert])).rejects.toThrow(/row-level security/);
    await expect(s.as(IDS.teacher1).insert("certificates", { ...cert, issued_by: IDS.headmaster })).rejects.toThrow(/row-level security/);
  });
  it("admins issue and teachers still see their class's certificates", async () => {
    const [made] = await s.as(ADMIN).insert("certificates", cert);
    expect(made.issued_by).toBe(ADMIN);
    expect((await s.as(IDS.teacher1).select("certificates")).map((c) => c.id)).toEqual([made.id]);
    expect(await s.as(IDS.teacher2).select("certificates")).toEqual([]);
  });
});

describe("admin", () => {
  const admin = () => s.as(ADMIN);

  it("does all school work", async () => {
    expect(await admin().count("students")).toBe(10);
    expect((await admin().insert("students", child({ class_id: IDS.class3 })))[0].admission_no).toBe("SS-2026-0011");
    expect(await admin().update("students", { class_id: IDS.class2 }, byId(IDS.studentC1))).toHaveLength(1);
    expect(await admin().insert("subjects", { name: "Hymns", max_marks: 25 })).toHaveLength(1);
  });
  it("manages teachers and their own profile", async () => {
    expect(await admin().update("profiles", { phone: "1" }, byId(IDS.teacher1))).toHaveLength(1);
    expect(await admin().update("profiles", { phone: "1" }, byId(ADMIN))).toHaveLength(1);
  });
  it("cannot touch the super admin", async () => {
    expect(await admin().update("profiles", { active: false }, byId(IDS.headmaster))).toEqual([]);
    expect(await admin().update("profiles", { full_name: "x" }, byId(IDS.headmaster))).toEqual([]);
    expect(await admin().delete("profiles", byId(IDS.headmaster))).toEqual([]);
  });
  it("cannot touch another admin", async () => {
    expect(await admin().update("profiles", { active: false }, byId(OTHER_ADMIN))).toEqual([]);
    expect(await admin().delete("profiles", byId(OTHER_ADMIN))).toEqual([]);
  });
  it("cannot create admins or promote teachers", async () => {
    await expect(admin().insert("profiles", { id: randomUUID(), full_name: "X", role: "headmaster" })).rejects.toThrow(/row-level security/);
    await expect(admin().update("profiles", { role: "headmaster" }, byId(IDS.teacher1))).rejects.toThrow(/super admin/);
  });
  it("cannot make itself super", async () => {
    const patch = { is_super: true } as unknown as Partial<Rows["profiles"]>;
    await expect(admin().update("profiles", patch, byId(ADMIN))).rejects.toThrow(/unknown column/);
    await expect(s.as(IDS.headmaster).update("profiles", patch, byId(ADMIN))).rejects.toThrow(/unknown column/);
  });
  it("reads but cannot change school settings", async () => {
    const one: Condition[] = [["id", "eq", 1]];
    expect(await admin().select("school_settings")).toHaveLength(1);
    expect(await admin().update("school_settings", { school_name: "x" }, one)).toEqual([]);
    expect(await admin().delete("school_settings", one)).toEqual([]);
    expect(await s.as(IDS.headmaster).update("school_settings", { school_name: "x" }, one)).toHaveLength(1);
  });
  it("cannot use the teacher account functions on admins", async () => {
    await expect(resetTeacherAccountPassword(s.database, ADMIN, IDS.headmaster)).rejects.toThrow(/not a teacher/);
    await expect(setTeacherAccountActive(s.database, ADMIN, OTHER_ADMIN, false)).rejects.toThrow(/not a teacher/);
  });
  it("can create teacher logins", async () => {
    const made = await createTeacherAccount(s.database, ADMIN,
      { email: "new.teacher@test.invalid", full_name: "New Teacher", phone: null, class_ids: [IDS.class1] });
    expect(made.id).toBeTruthy();
  });
});
