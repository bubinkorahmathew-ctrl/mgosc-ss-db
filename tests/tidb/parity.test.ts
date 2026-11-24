/**
 * Differential test: the original Postgres policies and triggers (PGlite) are the oracle.
 * The same operation, by the same person, on the same rows, must end the same way on TiDB.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { teacherAttendanceFrom } from "@/lib/db/policies";
import { COLUMNS, PRIMARY_KEY, type Rows, type TableName } from "@/lib/db/schema";
import type { Condition } from "@/lib/db/sql";
import { createTiDbTest, IDS, PRAYER_UNIT, TIDB_ONLY_TABLES, type Sandbox, type TiDbTest } from "./harness";

const COTEACHER = "22222222-2222-2222-2222-222222222223";
const INACTIVE = "22222222-2222-2222-2222-222222222224";
const UNASSIGNED = "22222222-2222-2222-2222-222222222225";
const NO_PROFILE = "22222222-2222-2222-2222-222222222229";
const MOVED = "5d000000-0000-0000-0000-000000000002";

const ACTORS = {
  anonymous: null,
  headmaster: IDS.headmaster,
  teacher1: IDS.teacher1,
  teacher2: IDS.teacher2,
  coteacher: COTEACHER,
  inactive: INACTIVE,
  unassigned: UNASSIGNED,
  noProfile: NO_PROFILE,
} as const;
type ActorName = keyof typeof ACTORS;

let t: TiDbTest;
beforeAll(async () => {
  t = await createTiDbTest(async (pg) => {
    await pg.exec(`
      insert into auth.users (id) values ('${COTEACHER}'), ('${INACTIVE}'), ('${UNASSIGNED}');
      insert into profiles (id, full_name, role, active) values
        ('${COTEACHER}', 'Co Teacher', 'teacher', true),
        ('${INACTIVE}', 'Former Teacher', 'teacher', false),
        ('${UNASSIGNED}', 'New Teacher', 'teacher', true);
      insert into class_teachers (class_id, teacher_id) values
        ('${IDS.class1}', '${COTEACHER}'), ('${IDS.class2}', '${INACTIVE}');

      insert into marks (exam_id, student_id, subject_id, marks_obtained)
        select e.id, s.id, '${IDS.subjectOT}', 20 from exams e join students s on s.class_id = e.class_id;
      insert into attendance (student_id, class_id, date, status)
        select id, class_id, '2026-11-08', 'present' from students;
      insert into activities (class_id, type, title, activity_date)
        select id, 'event', 'Picnic', '2026-11-08' from classes;
      insert into activities (class_id, student_id, type, title, activity_date)
        select class_id, id, 'note', 'Note', '2026-11-08' from students;
      insert into certificates (student_id, type, title, body_text)
        select id, 'completion', 'Certificate', 'Body' from students;
    `);
    // history that stays behind when a student changes class: the subtle part of the rules
    await pg.query("update students set class_id = $1 where id = $2", [IDS.class2, MOVED]);
  });
});
afterAll(async () => {
  await t?.destroy();
});

type Op =
  | { kind: "insert"; table: TableName; values: Record<string, unknown>; conflict?: string[] }
  | { kind: "update"; table: TableName; values: Record<string, unknown>; where: Record<string, unknown> }
  | { kind: "delete"; table: TableName; where: Record<string, unknown> };

/** "error", or the number of rows affected. Always rolled back. */
async function onPostgres(uid: string | null, op: Op): Promise<number | "error"> {
  const params: unknown[] = [];
  const p = (v: unknown) => `$${params.push(v !== null && typeof v === "object" ? JSON.stringify(v) : v)}`;
  const where = (w: Record<string, unknown>) => Object.entries(w).map(([k, v]) => `"${k}" = ${p(v)}`).join(" and ");
  let sql: string;
  if (op.kind === "insert") {
    const keys = Object.keys(op.values);
    sql = `insert into ${op.table} (${keys.map((k) => `"${k}"`).join(", ")}) values (${keys.map((k) => p(op.values[k])).join(", ")})`;
    if (op.conflict) {
      const set = keys.filter((k) => !op.conflict!.includes(k)).map((k) => `"${k}" = excluded."${k}"`);
      sql += ` on conflict (${op.conflict.map((k) => `"${k}"`).join(", ")}) do update set ${set.join(", ")}`;
    }
  } else if (op.kind === "update") {
    sql = `update ${op.table} set ${Object.entries(op.values).map(([k, v]) => `"${k}" = ${p(v)}`).join(", ")} where ${where(op.where)}`;
  } else {
    sql = `delete from ${op.table} where ${where(op.where)}`;
  }

  await t.pg.exec("begin");
  try {
    await t.pg.query("select set_config('request.jwt.claim.sub', $1, true)", [uid ?? ""]);
    await t.pg.exec(`set local role ${uid ? "authenticated" : "anon"}`);
    return (await t.pg.query(sql, params)).affectedRows ?? 0;
  } catch {
    return "error";
  } finally {
    await t.pg.exec("rollback");
  }
}

async function onTiDb(uid: string | null, op: Op): Promise<number | "error"> {
  const s: Sandbox = await t.sandbox();
  try {
    const db = s.as(uid);
    const count = async () => Number((await s.raw<{ n: number }>(`select count(*) as n from \`${op.table}\``))[0].n);
    const where = (w: Record<string, unknown>) => Object.entries(w).map(([k, v]) => [k, "eq", v] as Condition);
    try {
      if (op.kind === "update") return (await db.update(op.table, op.values as Partial<Rows[TableName]>, where(op.where))).length;
      if (op.kind === "delete") return (await db.delete(op.table, where(op.where))).length;
      if (op.conflict) return (await db.upsert(op.table as "marks", op.values as Partial<Rows["marks"]>)).length;
      // anonymous inserts return no rows, so count what landed
      const before = await count();
      // fields that are required on TiDB only (the spec has no such columns)
      const values = op.table === "students" || op.table === "registrations"
        ? { prayer_unit_id: PRAYER_UNIT, father_name: "Father", father_phone: "9000000009", ...op.values }
        : op.values;
      await db.insert(op.table, values as Partial<Rows[TableName]>);
      return (await count()) - before;
    } catch (e) {
      // a programming error must not pass as "denied"
      if ((e as Error).name !== "DbError") throw e;
      return "error";
    }
  } finally {
    await s.end();
  }
}

const child = { full_name: "Parity Child", dob: "2020-01-01", gender: "male", guardian_phone: "9000000000", school_class: "LKG" };
const cert = { type: "custom", title: "Certificate", body_text: "Body" };
const note = { type: "note", title: "Parity", activity_date: "2026-11-15" };
const att = { date: "2026-11-15", status: "present" };

const ins = (table: TableName, values: Record<string, unknown>, conflict?: string[]): Op => ({ kind: "insert", table, values, conflict });
const upd = (table: TableName, values: Record<string, unknown>, where: Record<string, unknown>): Op => ({ kind: "update", table, values, where });
const del = (table: TableName, where: Record<string, unknown>): Op => ({ kind: "delete", table, where });

const CASES: Record<string, Op> = {
  "profiles: edit teacher1's phone": upd("profiles", { phone: "1" }, { id: IDS.teacher1 }),
  "profiles: edit coteacher's phone": upd("profiles", { phone: "1" }, { id: COTEACHER }),
  "profiles: promote teacher1": upd("profiles", { role: "headmaster" }, { id: IDS.teacher1 }),
  "profiles: deactivate teacher2": upd("profiles", { active: false }, { id: IDS.teacher2 }),
  "profiles: empty name": upd("profiles", { full_name: "" }, { id: IDS.teacher2 }),
  "profiles: delete": del("profiles", { id: UNASSIGNED }),

  "years: create": ins("academic_years", { name: "2030-31", start_date: "2030-06-01", end_date: "2031-03-31" }),
  "years: end before start": ins("academic_years", { name: "2031-32", start_date: "2031-06-01", end_date: "2031-01-01" }),
  "years: second current": ins("academic_years", { name: "2032-33", start_date: "2032-06-01", end_date: "2033-03-31", is_current: true }),
  "years: rename": upd("academic_years", { name: "Renamed" }, { id: IDS.year }),
  "years: delete in use": del("academic_years", { id: IDS.year }),

  "classes: create": ins("classes", { name: "Class 9", academic_year_id: IDS.year }),
  "classes: duplicate": ins("classes", { name: "Class 1", academic_year_id: IDS.year }),
  "classes: rename": upd("classes", { name: "Renamed" }, { id: IDS.class1 }),

  "assignments: create": ins("class_teachers", { class_id: IDS.class3, teacher_id: IDS.teacher1 }),
  "assignments: delete": del("class_teachers", { class_id: IDS.class1, teacher_id: COTEACHER }),

  "students: create": ins("students", { ...child, admission_no: "P-1", class_id: IDS.class1 }),
  "students: create with empty name": ins("students", { ...child, full_name: "", admission_no: "P-2" }),
  "students: edit": upd("students", { address: "New" }, { id: IDS.studentC1 }),
  "students: move": upd("students", { class_id: IDS.class3 }, { id: IDS.studentC1 }),
  "students: delete": del("students", { id: IDS.studentC3 }),

  "registrations: submit": ins("registrations", child),
  "registrations: submit approved": ins("registrations", { ...child, status: "approved", reviewed_by: IDS.headmaster }),
  "registrations: submit with empty name": ins("registrations", { ...child, full_name: "" }),
  "registrations: reject": upd("registrations", { status: "rejected" }, { status: "pending" }),
  "registrations: delete": del("registrations", { status: "pending" }),

  "attempts: insert": ins("registration_attempts", { ip_hash: "x" }),
  "attempts: delete": del("registration_attempts", { ip_hash: "x" }),
  "counters: insert": ins("number_counters", { kind: "admission", year: 2040, last_value: 1 }),
  "counters: delete": del("number_counters", { kind: "admission" }),

  "subjects: create": ins("subjects", { name: "Hymns", max_marks: 25 }),
  "subjects: zero maximum": ins("subjects", { name: "Zero", max_marks: 0 }),
  "subjects: edit": upd("subjects", { max_marks: 60 }, { id: IDS.subjectOT }),
  "subjects: delete in use": del("subjects", { id: IDS.subjectOT }),
  "subjects: delete unused": del("subjects", { id: IDS.subjectMV }),

  "exams: create": ins("exams", { name: "Final", class_id: IDS.class1, academic_year_id: IDS.year }),
  "exams: edit": upd("exams", { name: "Mid" }, { id: IDS.examC1 }),
  "exams: delete": del("exams", { id: IDS.examC1 }),

  "marks: own class": ins("marks", { exam_id: IDS.examC1, student_id: IDS.studentC1, subject_id: IDS.subjectMV, marks_obtained: 10 }),
  "marks: class 2": ins("marks", { exam_id: IDS.examC2, student_id: IDS.studentC2, subject_id: IDS.subjectMV, marks_obtained: 10 }),
  "marks: wrong class's student": ins("marks", { exam_id: IDS.examC1, student_id: IDS.studentC2, subject_id: IDS.subjectMV, marks_obtained: 10 }),
  "marks: over maximum": ins("marks", { exam_id: IDS.examC1, student_id: IDS.studentC1, subject_id: IDS.subjectMV, marks_obtained: 26 }),
  "marks: upsert existing": ins("marks",
    { exam_id: IDS.examC1, student_id: IDS.studentC1, subject_id: IDS.subjectOT, marks_obtained: 30 },
    ["exam_id", "student_id", "subject_id"]),
  "marks: upsert moved student": ins("marks",
    { exam_id: IDS.examC1, student_id: MOVED, subject_id: IDS.subjectOT, marks_obtained: 30 },
    ["exam_id", "student_id", "subject_id"]),
  "marks: edit": upd("marks", { marks_obtained: 31 }, { student_id: IDS.studentC1 }),
  "marks: edit class 3": upd("marks", { marks_obtained: 31 }, { student_id: IDS.studentC3 }),
  "marks: edit moved student": upd("marks", { marks_obtained: 31 }, { student_id: MOVED }),
  "marks: negative": upd("marks", { marks_obtained: -1 }, { student_id: IDS.studentC1 }),
  "marks: repoint exam": upd("marks", { exam_id: IDS.examC2 }, { student_id: IDS.studentC1 }),
  "marks: delete": del("marks", { student_id: IDS.studentC1 }),

  "attendance: own class": ins("attendance", { ...att, student_id: IDS.studentC1, class_id: IDS.class1 }),
  "attendance: class 2": ins("attendance", { ...att, student_id: IDS.studentC2, class_id: IDS.class2 }),
  "attendance: smuggled student": ins("attendance", { ...att, student_id: IDS.studentC2, class_id: IDS.class1 }),
  "attendance: upsert existing": ins("attendance",
    { date: "2026-11-08", status: "late", student_id: IDS.studentC1, class_id: IDS.class1 }, ["student_id", "date"]),
  "attendance: upsert over old class's row": ins("attendance",
    { date: "2026-11-08", status: "late", student_id: MOVED, class_id: IDS.class2 }, ["student_id", "date"]),
  "attendance: edit": upd("attendance", { status: "absent" }, { student_id: IDS.studentC1 }),
  "attendance: edit moved student": upd("attendance", { status: "absent" }, { student_id: MOVED }),
  "attendance: edit whole class 3": upd("attendance", { status: "absent" }, { class_id: IDS.class3 }),
  "attendance: move row": upd("attendance", { class_id: IDS.class2 }, { student_id: IDS.studentC1 }),
  "attendance: delete": del("attendance", { class_id: IDS.class1 }),

  "activities: class-wide": ins("activities", { ...note, class_id: IDS.class1 }),
  "activities: class 2 student": ins("activities", { ...note, class_id: IDS.class2, student_id: IDS.studentC2 }),
  "activities: smuggled student": ins("activities", { ...note, class_id: IDS.class1, student_id: IDS.studentC2 }),
  "activities: empty title": ins("activities", { ...note, title: "", class_id: IDS.class1 }),
  "activities: edit": upd("activities", { notes: "Edited" }, { student_id: IDS.studentC1 }),
  "activities: edit moved student": upd("activities", { notes: "Edited" }, { student_id: MOVED }),
  "activities: move class": upd("activities", { class_id: IDS.class1 }, { class_id: IDS.class2 }),
  "activities: delete": del("activities", { class_id: IDS.class1 }),

  "certificates: own class": ins("certificates", { ...cert, student_id: IDS.studentC1, class_id: IDS.class1 }),
  "certificates: default class": ins("certificates", { ...cert, student_id: IDS.studentC2 }),
  "certificates: smuggled student": ins("certificates", { ...cert, student_id: IDS.studentC2, class_id: IDS.class1 }),
  "certificates: moved student, old class": ins("certificates", { ...cert, student_id: MOVED, class_id: IDS.class1 }),
  "certificates: other class's exam": ins("certificates", { ...cert, student_id: IDS.studentC1, class_id: IDS.class1, exam_id: IDS.examC2 }),
  "certificates: revoke": upd("certificates", { revoked: true }, { student_id: IDS.studentC1 }),
  "certificates: edit body": upd("certificates", { body_text: "Changed" }, { student_id: IDS.studentC1 }),
  "certificates: rename student": upd("certificates", { student_name: "Forged" }, { student_id: IDS.studentC1 }),
  "certificates: unlink class": upd("certificates", { class_id: null }, { student_id: IDS.studentC1 }),
  "certificates: relink class": upd("certificates", { class_id: IDS.class3 }, { student_id: IDS.studentC1 }),
  "certificates: delete": del("certificates", { student_id: IDS.studentC1 }),

  "settings: second row": ins("school_settings", { id: 2, certificate_wording: {} }),
  "settings: edit": upd("school_settings", { school_name: "Changed" }, { id: 1 }),
  "settings: delete": del("school_settings", { id: 1 }),
};

// The only places where TiDB is deliberately stricter (see lib/db/policies.ts). Nothing is looser.
const STRICTER_READ = new Set(["academic_years", "subjects", "school_settings"]);
const isStricterRead = (actor: ActorName, table: TableName) =>
  (actor === "inactive" || actor === "noProfile") && STRICTER_READ.has(table);

describe.each(Object.keys(ACTORS) as ActorName[])("%s", (actor) => {
  const uid = ACTORS[actor];

  const specTables = (Object.keys(COLUMNS) as TableName[]).filter((table) => !TIDB_ONLY_TABLES.has(table));
  it.each(specTables)("reads the same rows of %s", async (table) => {
    const keys = PRIMARY_KEY[table];
    const key = (r: object) => keys.map((k) => (r as Record<string, unknown>)[k]).join("|");
    let spec: string[] | "error";
    await t.pg.exec("begin");
    try {
      await t.pg.query("select set_config('request.jwt.claim.sub', $1, true)", [uid ?? ""]);
      await t.pg.exec(`set local role ${uid ? "authenticated" : "anon"}`);
      spec = (await t.pg.query<Record<string, unknown>>(`select * from ${table}`)).rows.map(key).sort();
    } catch {
      spec = "error";
    } finally {
      await t.pg.exec("rollback");
    }
    if (isStricterRead(actor, table)) spec = [];

    let actual: string[] | "error";
    try {
      actual = (await t.as(uid).select(table)).map(key).sort();
    } catch (e) {
      if ((e as Error).name !== "DbError") throw e;
      actual = "error";
    }
    expect(actual).toEqual(spec);
  });

  it.each(Object.keys(CASES))("writes the same way: %s", async (name) => {
    const op = CASES[name];
    // Deliberate changes asked for by the school:
    //   looser:   teachers add students to their own classes
    //   stricter: teachers no longer issue certificates
    //   stricter: teachers write attendance only 14 days back (the fixture's rows are from 2026-11-08)
    const teacherIssues = actor !== "headmaster" && op.kind === "insert" && op.table === "certificates";
    const attendanceDate = op.table !== "attendance" ? null : op.kind === "insert" ? op.values.date as string : "2026-11-08";
    const tooOld = actor !== "headmaster" && attendanceDate !== null && attendanceDate < teacherAttendanceFrom();
    const spec = await onPostgres(uid, op);
    const expected = name === "students: create" && (actor === "teacher1" || actor === "coteacher") ? 1
      : teacherIssues ? "error"
      : tooOld ? (spec === "error" || op.kind === "insert" ? "error" : 0)
      : spec;
    expect(await onTiDb(uid, op)).toBe(expected);
  });
});
