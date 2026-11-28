/**
 * Data rules that Postgres enforced with triggers and CHECK constraints. TiDB supports neither
 * here (no triggers; CHECKs are ignored by the cluster), so every write passes through this file.
 */
import { todayIST } from "./time";
import type { Executor } from "./connection";
import { DbError, notAllowed, violates } from "./errors";
import { reserveNumbers, currentNumberYear, formatNumber } from "./numbers";
import type { Actor, Facts } from "./policies";
import type { TableName } from "./schema";
import type { Row } from "./values";

const ids = (rows: Row[], column: string) =>
  [...new Set(rows.map((r) => r[column]).filter((v): v is string => typeof v === "string"))].sort();

/** Lock the referenced students and exams, so nobody can move them between the check and the write. */
export async function loadFacts(tx: Executor, table: TableName, rows: Row[]): Promise<Facts> {
  const facts: Facts = { studentClass: new Map(), examClass: new Map() };
  if (!["marks", "attendance", "activities", "certificates", "exam_attendance"].includes(table)) return facts;
  const students = ids(rows, "student_id");
  if (students.length) {
    const found = await tx.query<{ id: string; class_id: string | null }>(
      "select id, class_id from students where id in (?) order by id for update", [students]);
    for (const s of found) facts.studentClass.set(s.id, s.class_id);
  }
  const exams = ["marks", "certificates", "exam_attendance"].includes(table) ? ids(rows, "exam_id") : [];
  if (exams.length) {
    const found = await tx.query<{ id: string; class_id: string }>(
      "select id, class_id from exams where id in (?) order by id for update", [exams]);
    for (const e of found) facts.examClass.set(e.id, e.class_id);
  }
  return facts;
}

/** BEFORE INSERT, ahead of the permission check: values the caller never gets to choose. */
export function forceInsertValues(table: TableName, row: Row, actor: Actor, facts: Facts, now: Date): void {
  if (!actor.admin) {
    // a teacher can only ever record work as themselves
    if (table === "marks") row.entered_by = actor.id;
    if (table === "attendance" || table === "exam_attendance") row.marked_by = actor.id;
    if (table === "activities") row.created_by = actor.id;
    if (table === "students") {
      Object.assign(row, { status: "active", inactive_reason: null, photo_url: null, created_at: now });
      delete row.admission_no; // assigned in completeStudents
    }
  }
  switch (table) {
    case "registrations": // trg_registration_insert
      Object.assign(row, {
        status: "pending", reviewed_by: null, reviewed_at: null, review_note: null, student_id: null, submitted_at: now,
      });
      break;
    case "certificates": // trg_certificate_insert (the snapshot part is in completeCertificates)
      row.class_id = row.class_id ?? facts.studentClass.get(row.student_id as string) ?? null;
      row.issued_by = actor.id;
      row.revoked = false;
      row.revoked_at = null;
      row.created_at = now;
      row.issued_on = row.issued_on ?? todayIST(now);
      break;
    case "marks": // trg_validate_marks
    case "attendance":
    case "exam_attendance":
      row.updated_at = now;
      break;
  }
}

/** Throws if an update changes something the caller may never change; adjusts derived values. */
export function applyUpdateRules(table: TableName, before: Row[], patch: Row, actor: Actor, now: Date): Row {
  const out = { ...patch };
  const changes = (column: string) => column in patch && before.some((r) => !same(r[column], patch[column]));

  if ("id" in patch && changes("id")) {
    throw notAllowed(table === "profiles" ? "you can only change your name and phone" : "ids cannot be changed");
  }

  if (table === "profiles" && actor.admin && !actor.superAdmin) {
    if (["role", "admin_access_until"].some(changes)) throw notAllowed("only a super admin can change roles");
  }
  if (table === "profiles" && !actor.admin) { // trg_guard_profile
    if (["role", "active", "created_at", "designation", "admin_access_until"].some(changes)) throw notAllowed("you can only change your name and phone");
  }

  if (table === "students" && !actor.admin && changes("class_id")) { // trg_guard_student_class
    throw notAllowed("only an admin can change a student's class");
  }

  if (table === "certificates") {
    // trg_certificate_freeze
    for (const column of Object.keys(patch)) {
      if (column === "revoked" || column === "revoked_at" || !changes(column)) continue;
      const unlink = ["exam_id", "activity_id", "topper_id", "class_id", "issued_by"].includes(column) && patch[column] === null;
      if (!unlink) throw notAllowed("issued certificates cannot be edited; revoke and issue a new one");
    }
    // trg_certificate_revoke: the time is never taken from the caller
    delete out.revoked_at;
    if ("revoked" in patch && changes("revoked")) out.revoked_at = patch.revoked ? now : null;
  }

  if (!actor.admin) {
    if (table === "marks") out.entered_by = actor.id;
    if (table === "attendance" || table === "exam_attendance") out.marked_by = actor.id;
    if (table === "activities") delete out.created_by;
  }
  if (table === "marks" || table === "attendance" || table === "exam_attendance") out.updated_at = now;
  if (table === "school_settings") out.updated_at = now;
  return out;
}

function same(a: unknown, b: unknown) {
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  if (typeof b === "boolean" && a !== null) return Boolean(a) === b;
  return a === b;
}

/**
 * Checks on the final state of rows. `touched` lists the columns an update sets (null for an
 * insert), mirroring Postgres' `BEFORE UPDATE OF student_id, class_id` triggers.
 */
export async function validateRows(
  tx: Executor, table: TableName, rows: Row[], facts: Facts, touched: ReadonlySet<string> | null,
): Promise<void> {
  const sets = (...columns: string[]) => !touched || columns.some((c) => touched.has(c));

  if (table === "marks") {
    const subjects = ids(rows, "subject_id");
    const max = new Map<string, number>();
    if (subjects.length) {
      const found = await tx.query<{ id: string; max_marks: number }>(
        "select id, max_marks from subjects where id in (?) order by id for update", [subjects]);
      for (const s of found) max.set(s.id, Number(s.max_marks));
    }
    for (const row of rows) {
      const mx = max.get(row.subject_id as string);
      const value = row.marks_obtained as number | undefined;
      if (mx === undefined) throw new DbError("subject not found", "23503");
      if (value === undefined) throw new DbError("marks_obtained is required", "23502");
      // trg_validate_marks
      if (!(value >= 0 && value <= mx)) throw violates(`marks_obtained must be between 0 and ${mx}`);
      if (row.is_absent && Number(value) !== 0) throw violates("a subject marked absent carries 0 marks");
    }
    // no marks for a student marked absent for the whole exam
    const pairs = rows.map((r) => [r.exam_id, r.student_id]);
    if (pairs.length) {
      const absent = await tx.query(
        "select 1 from exam_attendance where (exam_id, student_id) in (?) and status = 'absent' limit 1 for update", [pairs]);
      if (absent.length) throw violates("the student was absent for this exam");
    }
    if (sets("student_id", "exam_id")) { // trg_marks_student_class
      for (const row of rows) {
        const studentClass = facts.studentClass.get(row.student_id as string);
        if (!studentClass || studentClass !== facts.examClass.get(row.exam_id as string)) {
          throw violates("student is not in this exam's class");
        }
      }
    }
  }

  if (table === "attendance" && sets("date")) {
    const today = todayIST(new Date());
    if (rows.some((r) => typeof r.date === "string" && r.date > today)) throw violates("attendance cannot be marked for a future date");
  }

  if (table === "exam_attendance" && sets("student_id", "exam_id")) {
    for (const row of rows) {
      const studentClass = facts.studentClass.get(row.student_id as string);
      if (!studentClass || studentClass !== facts.examClass.get(row.exam_id as string)) {
        throw violates("student is not in this exam's class");
      }
    }
  }

  if (table === "attendance" && sets("student_id", "class_id")) { // trg_attendance_class
    for (const row of rows) {
      const studentClass = facts.studentClass.get(row.student_id as string);
      if (!studentClass || studentClass !== row.class_id) throw violates("student is not in this class");
    }
  }

  if (table === "activities" && sets("student_id", "class_id")) { // trg_activity_student
    for (const row of rows) {
      if (row.student_id != null && facts.studentClass.get(row.student_id as string) !== row.class_id) {
        throw violates("student is not in this class");
      }
    }
  }

  // a public registration may only pick a unit that is offered on the form
  if (table === "registrations" && !touched) {
    const units = ids(rows, "prayer_unit_id");
    const active = units.length
      ? await tx.query("select id from prayer_units where id in (?) and active for update", [units]) : [];
    if (active.length !== units.length) throw violates("choose a prayer unit from the list");
  }

  // CHECK constraints
  for (const row of rows) {
    switch (table) {
      case "profiles":
      case "students":
      case "registrations":
        checkLength(row, "full_name", 1, 120);
        if (table !== "profiles") {
          checkLength(row, "full_name_ml", 0, 120);
          checkLength(row, "prayer_group", 0, 120);
          checkLength(row, "baptism_name", 0, 120);
          checkLength(row, "father_name", 1, 120);
          checkLength(row, "father_phone", 8, 16);
          checkLength(row, "email", 0, 254);
        }
        break;
      case "prayer_units":
        checkLength(row, "name", 1, 120);
        break;
      case "attendance":
      case "exam_attendance":
        checkLength(row, "remark", 0, 200);
        break;
      case "activities":
        checkLength(row, "title", 1, 200);
        break;
      case "academic_years":
        if (typeof row.start_date === "string" && typeof row.end_date === "string" && row.end_date <= row.start_date) {
          throw violates("end_date must be after start_date");
        }
        break;
      case "subjects":
        // numeric(6,2) rounds before the check, so 0.004 is zero
        if (row.max_marks !== undefined && !(Math.round(Number(row.max_marks) * 100) > 0)) {
          throw violates("max_marks must be greater than 0");
        }
        checkRange(row, "pass_percent", 0, 100);
        break;
      case "exams":
        checkRange(row, "weight", 0, 100);
        break;
      case "grade_scales":
        checkRange(row, "min_percent", 0, 100);
        checkRange(row, "max_percent", 0, 100);
        checkLength(row, "grade", 1, 8);
        checkLength(row, "remark", 0, 60);
        if (row.min_percent !== undefined && row.max_percent !== undefined && Number(row.min_percent) > Number(row.max_percent)) {
          throw violates("min_percent must not be above max_percent");
        }
        break;
      case "toppers":
        checkRange(row, "value", 0, 100);
        if (typeof row.period_start === "string" && typeof row.period_end === "string" && row.period_end < row.period_start) {
          throw violates("period_end must not be before period_start");
        }
        break;
      case "school_settings":
        if (row.id !== undefined && row.id !== 1) throw violates("there is only one settings row");
        checkRange(row, "attendance_topper_min_pct", 0, 100);
        break;
    }
  }
}

function checkRange(row: Row, column: string, min: number, max: number) {
  const value = row[column];
  if (value === undefined || value === null) return;
  const n = Number(value);
  if (!(n >= min && n <= max)) throw violates(`${column} must be between ${min} and ${max}`);
}

function checkLength(row: Row, column: string, min: number, max: number) {
  const value = row[column];
  if (typeof value !== "string") return;
  const length = [...value].length; // characters, not UTF-16 units
  if (length < min || length > max) throw violates(`${column} must be ${min} to ${max} characters`);
}

/** Admission numbers, and teachers add to current classes only. Runs in the insert's transaction. */
export async function completeStudents(tx: Executor, rows: Row[], actor: Actor, now: Date): Promise<void> {
  if (!actor.admin) {
    const classes = ids(rows, "class_id");
    const current = await tx.query(
      `select c.id from classes c join academic_years y on y.id = c.academic_year_id
        where c.id in (?) and y.is_current for update`, [classes]);
    if (current.length !== classes.length) throw notAllowed("not allowed: class is not in the current year");
  }
  const unnumbered = rows.filter((r) => !r.admission_no);
  if (!unnumbered.length) return;
  const year = await currentNumberYear(tx, now);
  const first = await reserveNumbers(tx, "admission", year, unnumbered.length);
  unnumbered.forEach((row, i) => {
    row.admission_no = formatNumber("admission", year, first + i);
  });
}

/** trg_certificate_insert: snapshots and numbers. Runs last, in the insert's transaction. */
export async function completeCertificates(tx: Executor, rows: Row[], facts: Facts, now: Date): Promise<void> {
  for (const row of rows) {
    if (!facts.studentClass.has(row.student_id as string)) throw new DbError("student not found", "23503");
    if (!row.class_id) throw violates("student is not in a class");
    if (row.exam_id && facts.examClass.get(row.exam_id as string) !== row.class_id) {
      throw violates("exam is not for this class");
    }
  }

  const activities = ids(rows, "activity_id");
  if (activities.length) {
    const found = await tx.query<{ id: string; class_id: string }>(
      "select id, class_id from activities where id in (?) order by id for update", [activities]);
    for (const row of rows) {
      if (row.activity_id && found.find((a) => a.id === row.activity_id)?.class_id !== row.class_id) {
        throw violates("activity is not for this class");
      }
    }
  }

  // a topper certificate names a confirmed topper of the same student, class and kind
  const topperIds = ids(rows, "topper_id");
  const toppers = topperIds.length
    ? await tx.query<{ id: string; student_id: string; class_id: string; type: string }>(
      "select id, student_id, class_id, type from toppers where id in (?) for update", [topperIds])
    : [];
  for (const row of rows) {
    const isTopperType = row.type === "class_topper" || row.type === "attendance_topper";
    if (!row.topper_id) {
      if (isTopperType) throw violates("a topper certificate needs a confirmed topper");
      continue;
    }
    const t = toppers.find((x) => x.id === row.topper_id);
    const kind = row.type === "class_topper" ? "marks" : row.type === "attendance_topper" ? "attendance" : null;
    if (!t || t.student_id !== row.student_id || t.class_id !== row.class_id || t.type !== kind) {
      throw violates("the topper does not match this certificate");
    }
  }

  const classIds = ids(rows, "class_id");
  const students = await tx.query<{ id: string; full_name: string; full_name_ml: string | null }>(
    "select id, full_name, full_name_ml from students where id in (?) for update", [ids(rows, "student_id")]);
  const classes = await tx.query<{ id: string; name: string; section: string | null; year_id: string; year_name: string }>(
    `select c.id, c.name, c.section, y.id as year_id, y.name as year_name
       from classes c join academic_years y on y.id = c.academic_year_id
      where c.id in (?) for update`, [classIds]);
  const teachers = await tx.query<{ class_id: string; full_name: string }>(
    `select ct.class_id, p.full_name from class_teachers ct join profiles p on p.id = ct.teacher_id
      where ct.class_id in (?) and p.active order by lower(p.full_name), p.full_name`, [classIds]);

  for (const row of rows) {
    const s = students.find((x) => x.id === row.student_id);
    const c = classes.find((x) => x.id === row.class_id);
    if (!s || !c) throw new DbError("class not found", "23503");
    row.academic_year_id = c.year_id;
    row.student_name = s.full_name;
    row.student_name_ml = s.full_name_ml;
    row.class_name = c.section ? `${c.name} - ${c.section}` : c.name;
    row.year_name = c.year_name;
    row.class_teacher_name = teachers.filter((t) => t.class_id === c.id).map((t) => t.full_name).join(", ") || null;
  }

  const year = await currentNumberYear(tx, now);
  const first = await reserveNumbers(tx, "certificate", year, rows.length);
  rows.forEach((row, i) => {
    row.certificate_no = formatNumber("certificate", year, first + i);
  });
}
