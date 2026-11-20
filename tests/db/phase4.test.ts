/**
 * Certificates: numbering + snapshots are set by Postgres, issued certificates are frozen,
 * teachers issue only for their own class and can never revoke.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb, IDS, type TestDb } from "./harness";

let db: TestDb;
beforeAll(async () => {
  db = await createTestDb();
});

type Cert = {
  id: string; certificate_no: string; student_name: string; student_name_ml: string | null;
  class_name: string; year_name: string; issued_by: string | null; revoked: boolean;
  class_teacher_name: string | null; academic_year_id: string;
};

const issue = (student: string, cls: string | null, extra: Record<string, unknown> = {}) => {
  const cols = { student_id: student, class_id: cls, type: "completion", title: "Certificate", body_text: "Body", ...extra };
  const keys = Object.keys(cols);
  return [
    `insert into public.certificates (${keys.join(", ")}) values (${keys.map((_, i) => `$${i + 1}`).join(", ")}) returning *`,
    Object.values(cols),
  ] as [string, unknown[]];
};

describe("certificate numbering and snapshots", () => {
  it("assigns sequential CERT numbers and fills snapshots from the database", async () => {
    const a = await db.asUser(IDS.headmaster, (d) => d.query<Cert>(...issue(IDS.studentC1, IDS.class1,
      { certificate_no: "FAKE-1", student_name: "Forged", class_name: "X", year_name: "Y", revoked: true })));
    const b = await db.asUser(IDS.headmaster, (d) => d.query<Cert>(...issue(IDS.studentC1, IDS.class1)));
    const c1 = a.rows[0], c2 = b.rows[0];
    expect(c1.certificate_no).toBe("CERT-2026-0001");
    expect(c2.certificate_no).toBe("CERT-2026-0002");
    expect(c1).toMatchObject({
      student_name: "Aaron Mathew", student_name_ml: "ആരോൺ മാത്യു", class_name: "Class 1", year_name: "2026-27",
      issued_by: IDS.headmaster, revoked: false, class_teacher_name: "Mary Thomas", academic_year_id: IDS.year,
    });
  });

  it("defaults the class to the student's current class", async () => {
    const r = await db.asUser(IDS.headmaster, (d) => d.query<Cert>(...issue(IDS.studentC2, null)));
    expect(r.rows[0].class_name).toBe("Class 2");
  });

  it("rejects an exam from another class", async () => {
    await expect(db.asUser(IDS.headmaster, (d) => d.query(...issue(IDS.studentC1, IDS.class1, { exam_id: IDS.examC2 }))))
      .rejects.toThrow(/exam is not for this class/);
  });

  it("a failed insert does not consume a number", async () => {
    await expect(db.asUser(IDS.teacher1, (d) => d.query(...issue(IDS.studentC2, IDS.class2)))).rejects.toThrow();
    const r = await db.asUser(IDS.headmaster, (d) => d.query<Cert>(...issue(IDS.studentC3, IDS.class3)));
    expect(r.rows[0].certificate_no).toBe("CERT-2026-0004");
  });
});

describe("certificate permissions", () => {
  it("teacher can issue for own class; issuer is forced to the teacher", async () => {
    const r = await db.asUser(IDS.teacher1, (d) => d.query<Cert>(...issue(IDS.studentC1, IDS.class1, { issued_by: IDS.headmaster })));
    expect(r.rows[0].issued_by).toBe(IDS.teacher1);
  });

  it("teacher cannot issue for another class's student", async () => {
    await expect(db.asUser(IDS.teacher1, (d) => d.query(...issue(IDS.studentC2, IDS.class1)))).rejects.toThrow();
    await expect(db.asUser(IDS.teacher1, (d) => d.query(...issue(IDS.studentC2, IDS.class2)))).rejects.toThrow(/row-level security/);
  });

  it("teacher cannot revoke or delete", async () => {
    const u = await db.asUser(IDS.teacher1, (d) => d.query("update public.certificates set revoked = true returning id"));
    expect(u.rows.length).toBe(0);
    const del = await db.asUser(IDS.teacher1, (d) => d.query("delete from public.certificates returning id"));
    expect(del.rows.length).toBe(0);
  });

  it("teacher sees only own-class certificates", async () => {
    const r = await db.asUser(IDS.teacher1, (d) => d.query<Cert>("select class_name from public.certificates"));
    expect(new Set(r.rows.map((x) => x.class_name))).toEqual(new Set(["Class 1"]));
  });

  it("headmaster can revoke and restore, but not edit the content", async () => {
    const id = (await db.query<Cert>("select id from public.certificates order by certificate_no limit 1")).rows[0].id;
    const r = await db.asUser(IDS.headmaster, (d) =>
      d.query<{ revoked: boolean; revoked_at: string | null }>("update public.certificates set revoked = true where id = $1 returning revoked, revoked_at", [id]));
    expect(r.rows[0].revoked).toBe(true);
    expect(r.rows[0].revoked_at).not.toBeNull();
    await expect(db.asUser(IDS.headmaster, (d) =>
      d.query("update public.certificates set body_text = 'changed' where id = $1", [id]))).rejects.toThrow(/cannot be edited/);
    const v = await db.asAnon((d) => d.query<{ valid: boolean }>("select * from public.verify_certificate($1)", ["CERT-2026-0001"]));
    expect(v.rows[0].valid).toBe(false);
  });

  it("deleting a linked activity still works (link becomes null)", async () => {
    const act = await db.asUser(IDS.headmaster, (d) => d.query<{ id: string }>(
      `insert into public.activities (class_id, type, title, activity_date) values ($1, 'event', 'Carol', '2026-11-01') returning id`, [IDS.class1]));
    const actId = act.rows[0].id;
    await db.asUser(IDS.headmaster, (d) => d.query(...issue(IDS.studentC1, IDS.class1, { type: "participation", activity_id: actId })));
    await db.asUser(IDS.headmaster, (d) => d.query("delete from public.activities where id = $1", [actId]));
    const r = await db.query("select id from public.certificates where activity_id = $1", [actId]);
    expect(r.rows.length).toBe(0);
  });

  it("anon verification exposes only minimal fields", async () => {
    const r = await db.asAnon((d) => d.query("select * from public.verify_certificate($1)", ["CERT-2026-0002"]));
    expect(Object.keys(r.rows[0] as object).sort()).toEqual(["issued_on", "student_name", "type", "valid"]);
    const direct = await db.asAnon((d) => d.query("select * from public.certificates"));
    expect(direct.rows.length).toBe(0);
  });
});
