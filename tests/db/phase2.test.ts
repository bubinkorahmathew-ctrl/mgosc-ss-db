import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb, IDS, type TestDb } from "./harness";

let db: TestDb;
beforeAll(async () => {
  db = await createTestDb();
});

describe("registrations", () => {
  it("anonymous visitors cannot read, update or delete registrations", async () => {
    const upd = await db.asAnon((d) => d.query("update public.registrations set status = 'approved' returning id"));
    const del = await db.asAnon((d) => d.query("delete from public.registrations returning id"));
    expect(upd.rows.length).toBe(0);
    expect(del.rows.length).toBe(0);
  });

  it("teachers cannot read registrations", async () => {
    const r = await db.asUser(IDS.teacher1, (d) => d.query("select id from public.registrations"));
    expect(r.rows.length).toBe(0);
  });

  it("rate-limit table is not reachable by anon or teachers", async () => {
    await expect(db.asAnon((d) => d.query("select * from public.registration_attempts"))).rejects.toThrow(/permission denied/);
    await expect(db.asUser(IDS.teacher1, (d) => d.query("insert into public.registration_attempts (ip_hash) values ('x')")))
      .rejects.toThrow(/permission denied/);
  });

  it("approval is atomic and cannot happen twice", async () => {
    const { rows } = await db.query<{ id: string }>(
      "select id from public.registrations where full_name = 'Christy Paul'");
    const id = rows[0].id;
    await db.asUser(IDS.headmaster, (d) => d.query("select public.approve_registration($1, $2)", [id, IDS.class2]));
    await expect(db.asUser(IDS.headmaster, (d) =>
      d.query("select public.approve_registration($1, $2)", [id, IDS.class2]))).rejects.toThrow(/already reviewed/);
    const s = await db.query<{ n: number }>(
      "select count(*)::int n from public.students where full_name = 'Christy Paul'");
    expect(s.rows[0].n).toBe(1);
    const reg = await db.query<{ status: string; reviewed_by: string; student_id: string }>(
      "select status, reviewed_by, student_id from public.registrations where id = $1", [id]);
    expect(reg.rows[0].status).toBe("approved");
    expect(reg.rows[0].reviewed_by).toBe(IDS.headmaster);
    expect(reg.rows[0].student_id).toBeTruthy();
  });
});

describe("students", () => {
  it("teachers cannot insert or delete students", async () => {
    await expect(db.asUser(IDS.teacher1, (d) => d.query(
      `insert into public.students (admission_no, full_name, dob, gender, guardian_phone, school_class, class_id)
       values ('X-1', 'Intruder', '2020-01-01', 'male', '9000000000', 'LKG', $1)`, [IDS.class1])))
      .rejects.toThrow(/row-level security/);
    const del = await db.asUser(IDS.teacher1, (d) =>
      d.query("delete from public.students where id = $1 returning id", [IDS.studentC1]));
    expect(del.rows.length).toBe(0);
  });

  it("headmaster can move a student between classes", async () => {
    const r = await db.asUser(IDS.headmaster, (d) =>
      d.query("update public.students set class_id = $1 where id = $2 returning class_id", [IDS.class2, IDS.studentC1]));
    expect(r.rows.length).toBe(1);
    await db.asUser(IDS.headmaster, (d) =>
      d.query("update public.students set class_id = $1 where id = $2", [IDS.class1, IDS.studentC1]));
  });

  it("admission numbers are sequential and unique", async () => {
    const a = await db.asUser(IDS.headmaster, (d) =>
      d.query<{ n: string }>("select public.next_number('admission', 2026) as n"));
    const b = await db.asUser(IDS.headmaster, (d) =>
      d.query<{ n: string }>("select public.next_number('admission', 2026) as n"));
    expect(Number(b.rows[0].n.slice(-4))).toBe(Number(a.rows[0].n.slice(-4)) + 1);
  });

  it("teachers cannot generate admission numbers", async () => {
    await expect(db.asUser(IDS.teacher1, (d) => d.query("select public.next_number('admission', 2026)")))
      .rejects.toThrow(/not allowed/);
  });
});

describe("classes, teachers, academic years", () => {
  it("teachers cannot create classes or assign themselves", async () => {
    await expect(db.asUser(IDS.teacher1, (d) => d.query(
      "insert into public.class_teachers (class_id, teacher_id) values ($1, $2)", [IDS.class2, IDS.teacher1])))
      .rejects.toThrow(/row-level security/);
    await expect(db.asUser(IDS.teacher1, (d) => d.query(
      "insert into public.classes (name, academic_year_id) values ('Hack', $1)", [IDS.year])))
      .rejects.toThrow(/row-level security/);
  });

  it("teachers cannot read other teachers' profiles unless they share a class", async () => {
    const r = await db.asUser(IDS.teacher1, (d) => d.query<{ id: string }>("select id from public.profiles"));
    expect(r.rows.map((x) => x.id)).toEqual([IDS.teacher1]);
  });

  it("set_current_academic_year keeps exactly one current year", async () => {
    const { rows } = await db.asUser(IDS.headmaster, (d) => d.query<{ id: string }>(
      "insert into public.academic_years (name, start_date, end_date) values ('2027-28', '2027-06-01', '2028-03-31') returning id"));
    await db.asUser(IDS.headmaster, (d) => d.query("select public.set_current_academic_year($1)", [rows[0].id]));
    const cur = await db.query<{ name: string }>("select name from public.academic_years where is_current");
    expect(cur.rows).toEqual([{ name: "2027-28" }]);
    // restore
    await db.asUser(IDS.headmaster, (d) => d.query("select public.set_current_academic_year($1)", [IDS.year]));
  });

  it("teachers cannot change the current academic year", async () => {
    await expect(db.asUser(IDS.teacher1, (d) => d.query("select public.set_current_academic_year($1)", [IDS.year])))
      .rejects.toThrow(/not allowed/);
  });

  it("a deactivated teacher loses access immediately", async () => {
    await db.query("update public.profiles set active = false where id = $1", [IDS.teacher1]);
    const r = await db.asUser(IDS.teacher1, (d) => d.query("select id from public.students"));
    expect(r.rows.length).toBe(0);
    await db.query("update public.profiles set active = true where id = $1", [IDS.teacher1]);
  });
});
