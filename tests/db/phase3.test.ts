/**
 * Teacher isolation: a teacher can read/write attendance, marks and activities
 * only for their own classes - enforced by Postgres RLS + triggers.
 * teacher1 -> Class 1; teacher2 -> Class 2 and Class 3.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb, IDS, type TestDb } from "./harness";

let db: TestDb;
beforeAll(async () => {
  db = await createTestDb();
});

const attendance = (student: string, cls: string, date: string, status = "present") =>
  [`insert into public.attendance (student_id, class_id, date, status) values ($1, $2, $3, $4)
    on conflict (student_id, date) do update set status = excluded.status returning id`, [student, cls, date, status]] as [string, unknown[]];

describe("attendance", () => {
  it("teacher can mark and update attendance for own class", async () => {
    const r = await db.asUser(IDS.teacher1, (d) => d.query(...attendance(IDS.studentC1, IDS.class1, "2026-11-15")));
    expect(r.rows.length).toBe(1);
    const u = await db.asUser(IDS.teacher1, (d) => d.query(...attendance(IDS.studentC1, IDS.class1, "2026-11-15", "late")));
    expect(u.rows.length).toBe(1);
  });

  it("teacher cannot mark attendance in another class", async () => {
    await expect(db.asUser(IDS.teacher1, (d) => d.query(...attendance(IDS.studentC2, IDS.class2, "2026-11-15"))))
      .rejects.toThrow(/row-level security/);
  });

  it("teacher cannot smuggle another class's student into own class", async () => {
    // class_id is teacher1's, but the student belongs to Class 2
    await expect(db.asUser(IDS.teacher1, (d) => d.query(...attendance(IDS.studentC2, IDS.class1, "2026-11-15"))))
      .rejects.toThrow();
  });

  it("teacher cannot read another class's attendance", async () => {
    await db.asUser(IDS.teacher2, (d) => d.query(...attendance(IDS.studentC2, IDS.class2, "2026-11-15")));
    const r = await db.asUser(IDS.teacher1, (d) =>
      d.query("select id from public.attendance where class_id = $1", [IDS.class2]));
    expect(r.rows.length).toBe(0);
  });

  it("teacher cannot update or delete another class's attendance", async () => {
    const u = await db.asUser(IDS.teacher1, (d) =>
      d.query("update public.attendance set status = 'absent' where class_id = $1 returning id", [IDS.class2]));
    expect(u.rows.length).toBe(0);
    const del = await db.asUser(IDS.teacher1, (d) => d.query("delete from public.attendance returning id"));
    expect(del.rows.length).toBe(0);
  });
});

describe("marks", () => {
  const mark = (exam: string, student: string, subject: string, value: number) =>
    [`insert into public.marks (exam_id, student_id, subject_id, marks_obtained) values ($1, $2, $3, $4)
      on conflict (exam_id, student_id, subject_id) do update set marks_obtained = excluded.marks_obtained
      returning id`, [exam, student, subject, value]] as [string, unknown[]];

  it("teacher can enter and update marks for own class", async () => {
    await db.asUser(IDS.teacher1, (d) => d.query(...mark(IDS.examC1, IDS.studentC1, IDS.subjectOT, 42)));
    const r = await db.asUser(IDS.teacher1, (d) => d.query(...mark(IDS.examC1, IDS.studentC1, IDS.subjectOT, 45)));
    expect(r.rows.length).toBe(1);
    const v = await db.query<{ m: string }>("select marks_obtained::text m from public.marks where exam_id = $1 and student_id = $2",
      [IDS.examC1, IDS.studentC1]);
    expect(Number(v.rows[0].m)).toBe(45);
  });

  it("marks must be within 0 and the subject maximum", async () => {
    await expect(db.asUser(IDS.teacher1, (d) => d.query(...mark(IDS.examC1, IDS.studentC1, IDS.subjectMV, 26))))
      .rejects.toThrow(/between 0 and 25/);
    await expect(db.asUser(IDS.teacher1, (d) => d.query(...mark(IDS.examC1, IDS.studentC1, IDS.subjectMV, -1))))
      .rejects.toThrow(/between 0 and/);
  });

  it("teacher cannot enter marks for another class's exam", async () => {
    await expect(db.asUser(IDS.teacher1, (d) => d.query(...mark(IDS.examC2, IDS.studentC2, IDS.subjectOT, 30))))
      .rejects.toThrow(/row-level security/);
  });

  it("teacher cannot enter marks for another class's student on own exam", async () => {
    await expect(db.asUser(IDS.teacher1, (d) => d.query(...mark(IDS.examC1, IDS.studentC2, IDS.subjectOT, 30))))
      .rejects.toThrow();
  });

  it("teacher cannot read, update or delete another class's marks", async () => {
    await db.asUser(IDS.teacher2, (d) => d.query(...mark(IDS.examC2, IDS.studentC2, IDS.subjectOT, 30)));
    const sel = await db.asUser(IDS.teacher1, (d) => d.query("select id from public.marks where exam_id = $1", [IDS.examC2]));
    expect(sel.rows.length).toBe(0);
    const upd = await db.asUser(IDS.teacher1, (d) =>
      d.query("update public.marks set marks_obtained = 50 where exam_id = $1 returning id", [IDS.examC2]));
    expect(upd.rows.length).toBe(0);
    const del = await db.asUser(IDS.teacher2, (d) => d.query("delete from public.marks returning id"));
    expect(del.rows.length).toBe(0); // teachers have no DELETE on marks at all
  });

  it("teacher cannot see other classes' exams", async () => {
    const r = await db.asUser(IDS.teacher1, (d) => d.query<{ id: string }>("select id from public.exams"));
    expect(r.rows.map((x) => x.id)).toEqual([IDS.examC1]);
  });

  it("teacher cannot create exams", async () => {
    await expect(db.asUser(IDS.teacher1, (d) => d.query(
      "insert into public.exams (name, class_id, academic_year_id) values ('X', $1, $2)", [IDS.class1, IDS.year])))
      .rejects.toThrow(/row-level security/);
  });
});

describe("activities", () => {
  const act = (cls: string, student: string | null) =>
    [`insert into public.activities (class_id, student_id, type, title, activity_date)
      values ($1, $2, 'competition', 'Quiz', '2026-11-15') returning id`, [cls, student]] as [string, unknown[]];

  it("teacher can add class-wide and per-student activities in own class", async () => {
    const a = await db.asUser(IDS.teacher1, (d) => d.query(...act(IDS.class1, null)));
    const b = await db.asUser(IDS.teacher1, (d) => d.query(...act(IDS.class1, IDS.studentC1)));
    expect(a.rows.length + b.rows.length).toBe(2);
  });

  it("teacher cannot add activities to another class or its students", async () => {
    await expect(db.asUser(IDS.teacher1, (d) => d.query(...act(IDS.class2, null)))).rejects.toThrow(/row-level security/);
    await expect(db.asUser(IDS.teacher1, (d) => d.query(...act(IDS.class1, IDS.studentC2)))).rejects.toThrow();
  });

  it("teacher cannot read or move another class's activities", async () => {
    await db.asUser(IDS.teacher2, (d) => d.query(...act(IDS.class2, null)));
    const sel = await db.asUser(IDS.teacher1, (d) => d.query("select id from public.activities where class_id = $1", [IDS.class2]));
    expect(sel.rows.length).toBe(0);
    // teacher2 tries to move own activity into teacher1's class
    await expect(db.asUser(IDS.teacher2, (d) =>
      d.query("update public.activities set class_id = $1 where class_id = $2", [IDS.class1, IDS.class2])))
      .rejects.toThrow(/row-level security/);
  });
});

describe("students (teacher view)", () => {
  it("teacher cannot read another class's student by id", async () => {
    const r = await db.asUser(IDS.teacher1, (d) => d.query("select * from public.students where id = $1", [IDS.studentC3]));
    expect(r.rows.length).toBe(0);
  });

  it("teacher2 sees both of their classes but not Class 1", async () => {
    const r = await db.asUser(IDS.teacher2, (d) => d.query<{ id: string }>("select id from public.classes order by name"));
    expect(r.rows.map((x) => x.id)).toEqual([IDS.class2, IDS.class3]);
  });
});
