import { randomUUID } from "node:crypto";
import type { CertificateType } from "@/lib/db/types";
import type { Database } from "./connection";
import { scaleProblems, type GradeBand } from "@/lib/grades";
import { DbError, invalid, notAllowed, violates } from "./errors";
import { currentNumberYear, formatNumber, reserveNumbers, type CounterKind } from "./numbers";
import { lockActor } from "./policies";
import { toDb, toId, type Row } from "./values";

export type TopperScope = {
  class_id: string; type: "marks" | "attendance"; exam_id: string | null; period_start: string; period_end: string;
};

const COPIED_FROM_REGISTRATION = [
  "full_name", "full_name_ml", "dob", "gender", "father_name", "mother_name",
  "guardian_phone", "address", "baptised", "school_class", "school_name", "prayer_group", "prayer_unit_id", "baptism_name", "father_phone", "email",
] as const;

/** The database functions the app called through dbc.rpc(). */
export function createFunctions(database: Database, uid: string | null) {
  return {
    currentNumberYear: () => currentNumberYear(database, new Date()),

    async nextNumber(kind: CounterKind, year: number): Promise<string> {
      if (kind !== "admission" && kind !== "certificate") throw invalid("unknown counter");
      if (!Number.isSafeInteger(year) || year < 1900 || year > 9999) throw invalid("invalid year");
      return database.transaction(async (tx) => {
        const actor = await lockActor(tx, uid);
        if (!actor.admin) throw notAllowed();
        return formatNumber(kind, year, await reserveNumbers(tx, kind, year, 1));
      });
    },

    async setCurrentAcademicYear(yearId: string): Promise<void> {
      const id = toId(yearId);
      await database.transaction(async (tx) => {
        const actor = await lockActor(tx, uid);
        if (!actor.admin) throw notAllowed();
        const years = await tx.query<{ id: string }>("select id from academic_years order by id for update");
        if (!years.some((y) => y.id === id)) throw new DbError("academic year not found", "P0001");
        await tx.query("update academic_years set is_current = false where is_current and id <> ?", [id]);
        await tx.query("update academic_years set is_current = true where id = ?", [id]);
      });
    },

    /** Create the student and mark the registration approved, all or nothing. */
    async approveRegistration(registrationId: string, classId: string): Promise<string> {
      const regId = toId(registrationId);
      const clsId = toId(classId);
      return database.transaction(async (tx) => {
        const actor = await lockActor(tx, uid);
        if (!actor.admin) throw notAllowed();
        const [reg] = await tx.query<Row>("select * from registrations where id = ? for update", [regId]);
        if (!reg) throw new DbError("registration not found", "P0001");
        if (reg.status !== "pending") throw new DbError("registration already reviewed", "P0001");
        const [cls] = await tx.query("select id from classes where id = ? for update", [clsId]);
        if (!cls) throw new DbError("class not found", "P0001");

        const now = new Date();
        const year = await currentNumberYear(tx, now);
        const admissionNo = formatNumber("admission", year, await reserveNumbers(tx, "admission", year, 1));
        const studentId = randomUUID();
        await tx.query(
          `insert into students (id, admission_no, class_id, ${COPIED_FROM_REGISTRATION.join(", ")}) values (?)`,
          [[studentId, admissionNo, clsId, ...COPIED_FROM_REGISTRATION.map((c) => reg[c])]]);
        await tx.query(
          "update registrations set status = 'approved', reviewed_by = ?, reviewed_at = ?, student_id = ? where id = ?",
          [actor.id, now, studentId, regId]);
        return studentId;
      });
    },

    /** The whole grade scale at once, all or nothing, so it is never half-edited. Admins only. */
    async replaceGradeScales(bands: GradeBand[]): Promise<void> {
      const problems = scaleProblems(bands);
      if (problems.length) throw violates(problems[0]);
      await database.transaction(async (tx) => {
        const actor = await lockActor(tx, uid);
        if (!actor.admin) throw notAllowed();
        await tx.query("delete from grade_scales");
        await tx.query(
          "insert into grade_scales (id, min_percent, max_percent, grade, grade_point, remark, is_pass) values ?",
          [bands.map((b) => [randomUUID(), b.min_percent, b.max_percent, b.grade.trim(), b.grade_point, b.remark, b.is_pass])]);
      });
    },

    /**
     * Confirm the toppers of one comparison (a class, a type, an exam or none, a period),
     * replacing any earlier confirmation of the same comparison. Admins only. Every student must
     * belong to the class or have results in it; the caller computed the values.
     */
    async confirmToppers(scope: TopperScope, picks: { student_id: string; value: number }[]): Promise<number> {
      if (scope.type !== "marks" && scope.type !== "attendance") throw invalid("unknown topper type");
      const classId = toId(scope.class_id);
      const examId = scope.exam_id ? toId(scope.exam_id) : null;
      for (const d of [scope.period_start, scope.period_end]) toDb("toppers", "period_start", d);
      if (scope.period_end < scope.period_start) throw violates("period_end must not be before period_start");
      return database.transaction(async (tx) => {
        const actor = await lockActor(tx, uid);
        if (!actor.admin) throw notAllowed();
        const [cls] = await tx.query<{ academic_year_id: string }>("select academic_year_id from classes where id = ? for update", [classId]);
        if (!cls) throw new DbError("class not found", "P0001");
        if (examId) {
          const [exam] = await tx.query<{ class_id: string }>("select class_id from exams where id = ? for update", [examId]);
          if (exam?.class_id !== classId) throw violates("exam is not for this class");
        }
        await tx.query(
          `delete from toppers where class_id = ? and type = ? and period_start = ? and period_end = ? and ${examId ? "exam_id = ?" : "exam_id is null"}`,
          [classId, scope.type, scope.period_start, scope.period_end, ...(examId ? [examId] : [])]);
        if (!picks.length) return 0;
        // a topper is in the class, or was (results or attendance there) before moving on
        const ids = [...new Set(picks.map((p) => toId(p.student_id)))];
        const belong = await tx.query(
          `select s.id from students s where s.id in (?) and (s.class_id = ?
             or exists (select 1 from marks m join exams e on e.id = m.exam_id where m.student_id = s.id and e.class_id = ?)
             or exists (select 1 from attendance a where a.student_id = s.id and a.class_id = ?))`,
          [ids, classId, classId, classId]);
        if (belong.length !== ids.length) throw violates("a topper is not a student of this class");
        const now = new Date();
        await tx.query(
          "insert into toppers (id, class_id, academic_year_id, exam_id, period_start, period_end, type, student_id, value, confirmed_by, confirmed_at) values ?",
          [picks.map((p) => {
            const value = Number(p.value);
            if (!(value >= 0 && value <= 100)) throw violates("value must be between 0 and 100");
            return [randomUUID(), classId, cls.academic_year_id, examId, scope.period_start, scope.period_end, scope.type,
              toId(p.student_id), value, actor.id, now];
          })]);
        return picks.length;
      });
    },

    /** Public, so it exposes these four fields and nothing else. */
    async verifyCertificate(no: string) {
      if (typeof no !== "string") throw invalid("invalid certificate number");
      const [c] = await database.query<{ revoked: number; type: CertificateType; issued_on: string; student_name: string }>(
        "select revoked, type, issued_on, student_name from certificates where certificate_no = ? limit 1", [no]);
      return c ? { valid: !c.revoked, type: c.type, issued_on: c.issued_on, student_name: c.student_name } : null;
    },
  };
}
