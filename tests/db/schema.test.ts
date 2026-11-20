import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb, IDS, type TestDb } from "./harness";

let db: TestDb;
beforeAll(async () => {
  db = await createTestDb();
});

const count = (r: { rows: unknown[] }) => r.rows.length;

describe("migration + seed", () => {
  it("applies cleanly and seeds the expected rows", async () => {
    const r = await db.query<{ n: number }>("select count(*)::int as n from public.students");
    expect(r.rows[0].n).toBe(10);
  });
});

describe("RLS smoke", () => {
  it("headmaster sees every student", async () => {
    const r = await db.asUser(IDS.headmaster, (d) => d.query("select id from public.students"));
    expect(count(r)).toBe(10);
  });

  it("teacher sees only students of own classes", async () => {
    const t1 = await db.asUser(IDS.teacher1, (d) =>
      d.query<{ class_id: string }>("select class_id from public.students"));
    expect(count(t1)).toBe(3);
    expect(t1.rows.every((s) => s.class_id === IDS.class1)).toBe(true);

    const t2 = await db.asUser(IDS.teacher2, (d) =>
      d.query<{ class_id: string }>("select class_id from public.students"));
    expect(count(t2)).toBe(7);
    expect(t2.rows.some((s) => s.class_id === IDS.class1)).toBe(false);
  });

  it("anonymous visitors see no students and no registrations", async () => {
    const s = await db.asAnon((d) => d.query("select id from public.students"));
    const r = await db.asAnon((d) => d.query("select id from public.registrations"));
    expect(count(s)).toBe(0);
    expect(count(r)).toBe(0);
  });

  it("anonymous insert into registrations is forced to pending", async () => {
    await db.asAnon((d) =>
      d.query(`insert into public.registrations (full_name, dob, gender, guardian_phone, school_class)
               values ('Test Child', '2020-01-01', 'male', '9000000099', 'LKG')`));
    const r = await db.query<{ status: string }>(
      "select status from public.registrations where full_name = 'Test Child'");
    expect(r.rows[0].status).toBe("pending");
  });

  it("anonymous status=approved / reviewed_by on insert is overridden to pending", async () => {
    await db.asAnon((d) =>
      d.query(`insert into public.registrations (full_name, dob, gender, guardian_phone, school_class, status, reviewed_by)
               values ('Sneaky', '2020-01-01', 'male', '9000000098', 'LKG', 'approved', $1)`, [IDS.headmaster]));
    const r = await db.query<{ status: string; reviewed_by: string | null }>(
      "select status, reviewed_by from public.registrations where full_name = 'Sneaky'");
    expect(r.rows[0]).toEqual({ status: "pending", reviewed_by: null });
  });

  it("teacher cannot update students", async () => {
    const r = await db.asUser(IDS.teacher1, (d) =>
      d.query(`update public.students set class_id = $1 where id = $2 returning id`,
        [IDS.class2, IDS.studentC1]));
    expect(count(r)).toBe(0); // no UPDATE policy -> zero rows affected
  });

  it("teacher cannot change own role", async () => {
    await expect(
      db.asUser(IDS.teacher1, (d) =>
        d.query(`update public.profiles set role = 'headmaster' where id = $1`, [IDS.teacher1])),
    ).rejects.toThrow(/name and phone/);
  });

  it("teacher can update own phone", async () => {
    const r = await db.asUser(IDS.teacher1, (d) =>
      d.query(`update public.profiles set phone = '9111111111' where id = $1 returning id`, [IDS.teacher1]));
    expect(count(r)).toBe(1);
  });

  it("approve_registration creates a student with the next admission number", async () => {
    const reg = await db.query<{ id: string }>(
      "select id from public.registrations where full_name = 'Christy Paul'");
    const out = await db.asUser(IDS.headmaster, (d) =>
      d.query<{ id: string }>("select public.approve_registration($1, $2) as id", [reg.rows[0].id, IDS.class1]));
    const s = await db.query<{ admission_no: string }>(
      "select admission_no from public.students where id = $1", [out.rows[0].id]);
    expect(s.rows[0].admission_no).toBe("SS-2026-0011");
  });

  it("teacher cannot approve registrations", async () => {
    const reg = await db.query<{ id: string }>(
      "select id from public.registrations where full_name = 'Test Child'");
    await expect(
      db.asUser(IDS.teacher1, (d) =>
        d.query("select public.approve_registration($1, $2)", [reg.rows[0].id, IDS.class1])),
    ).rejects.toThrow(/not allowed/);
  });

  it("verify_certificate exposes only valid/type/date/name to anon", async () => {
    await db.query(`insert into public.certificates (certificate_no, student_id, type, title, body_text,
      academic_year_id, student_name, class_name, year_name, class_id)
      values ('CERT-2026-0001', $1, 'merit', 'Merit', 'x', $2, 'Aaron Mathew', 'Class 1', '2026-27', $3)`,
      [IDS.studentC1, IDS.year, IDS.class1]);
    const r = await db.asAnon((d) => d.query("select * from public.verify_certificate('CERT-2026-0001')"));
    expect(Object.keys(r.rows[0] as object).sort()).toEqual(["issued_on", "student_name", "type", "valid"]);
    const direct = await db.asAnon((d) => d.query("select * from public.certificates"));
    expect(count(direct)).toBe(0);
  });
});
