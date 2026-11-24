import { randomUUID } from "node:crypto";
import type { CertificateType } from "@/lib/db/types";
import type { Database } from "./connection";
import { DbError, invalid, notAllowed } from "./errors";
import { currentNumberYear, formatNumber, reserveNumbers, type CounterKind } from "./numbers";
import { lockActor } from "./policies";
import { toId, type Row } from "./values";

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
        if (!actor.headmaster) throw notAllowed();
        return formatNumber(kind, year, await reserveNumbers(tx, kind, year, 1));
      });
    },

    async setCurrentAcademicYear(yearId: string): Promise<void> {
      const id = toId(yearId);
      await database.transaction(async (tx) => {
        const actor = await lockActor(tx, uid);
        if (!actor.headmaster) throw notAllowed();
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
        if (!actor.headmaster) throw notAllowed();
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

    /** Public, so it exposes these four fields and nothing else. */
    async verifyCertificate(no: string) {
      if (typeof no !== "string") throw invalid("invalid certificate number");
      const [c] = await database.query<{ revoked: number; type: CertificateType; issued_on: string; student_name: string }>(
        "select revoked, type, issued_on, student_name from certificates where certificate_no = ? limit 1", [no]);
      return c ? { valid: !c.revoked, type: c.type, issued_on: c.issued_on, student_name: c.student_name } : null;
    },
  };
}
