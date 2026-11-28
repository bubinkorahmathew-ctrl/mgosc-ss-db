/**
 * S4: who may do what, per role, through the real lib/repo functions (the only way the app
 * reaches data). Roles: super admin, admin, teacher, OVBS staff (ovbs_teacher), visitor.
 * Accounting has its own file (accounting.test.ts); sign-in has auth.test.ts.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { listPeople, recentAudit } from "@/lib/repo/users";
import { getClassOptions } from "@/lib/repo/classes";
import { listRegistrations } from "@/lib/repo/registrations";
import { getSettings, saveSettings } from "@/lib/repo/settings";
import { getStudentProfile } from "@/lib/repo/student-profile";
import { createStudent, deleteStudent, listStudents } from "@/lib/repo/students";
import { saveAttendance } from "@/lib/repo/teaching";
import { listReceipts } from "@/lib/repo/accounting/receipts";
import { cashBook } from "@/lib/repo/accounting/books";
import { createTiDbTest, daysAgo, IDS, PRAYER_UNIT, type TiDbTest } from "./harness";
import { viewer } from "./viewers";

const OVBS = "0b500000-0000-4000-8000-000000000001";

let t: TiDbTest;
beforeAll(async () => {
  t = await createTiDbTest(async (db) => {
    await db.query("insert into profiles (id, full_name, role) values (?, 'OVBS Helper', 'ovbs_teacher')", [OVBS]);
  });
});
afterAll(async () => {
  await t?.destroy();
});

const superAdmin = viewer(IDS.headmaster, "super_admin");
const admin = viewer(IDS.headmaster, "admin");        // same account, as a plain admin
const teacher = viewer(IDS.teacher1, "teacher");
const ovbs = viewer(OVBS, "ovbs_teacher", false);
const all = { status: "all", page: 1 } as never;

const newStudent = (class_id: string | null) => ({
  full_name: `Access Test ${randomUUID().slice(0, 6)}`, dob: "2015-05-05", gender: "male", father_name: "Father",
  mother_name: null, father_phone: "9876543210", guardian_phone: "9876543210", email: null, address: null,
  school_class: "Grade 5", school_name: null, prayer_unit_id: PRAYER_UNIT, baptism_name: null, class_id, status: "active",
}) as never;

describe("students", () => {
  it("admins see every student, a teacher only their class, OVBS staff and visitors none", async () => {
    const forAdmin = await listStudents(admin, all);
    const forTeacher = await listStudents(teacher, all);
    expect(forAdmin.total).toBeGreaterThan(forTeacher.total);
    expect(forTeacher.rows.every((s) => s.class_id === IDS.class1)).toBe(true);
    expect((await listStudents(ovbs, all)).total).toBe(0);
    expect((await listStudents(null as never, all)).total).toBe(0);
  });

  it("a student profile of another class is not visible to a teacher or OVBS staff", async () => {
    expect(await getStudentProfile(admin, IDS.studentC2)).not.toBeNull();
    expect(await getStudentProfile(teacher, IDS.studentC2)).toBeNull();
    expect(await getStudentProfile(ovbs, IDS.studentC1)).toBeNull();
  });

  it("teachers add students to their own class only; OVBS staff can't add any", async () => {
    await expect(createStudent(teacher, newStudent(IDS.class1))).resolves.toMatchObject({ admission_no: expect.stringMatching(/^SS-/) });
    await expect(createStudent(teacher, newStudent(IDS.class2))).rejects.toThrow(/not assigned/);
    await expect(createStudent(ovbs, newStudent(IDS.class1))).rejects.toThrow(/not allowed/);
  });

  it("only the super admin deletes a student", async () => {
    const s = await createStudent(admin, newStudent(IDS.class1));
    await expect(deleteStudent(admin, s.id)).rejects.toThrow(/super admin/);
    await expect(deleteStudent(teacher, s.id)).rejects.toThrow(/not allowed/);
    await expect(deleteStudent(superAdmin, s.id)).resolves.toBeUndefined();
  });
});

describe("attendance", () => {
  const day = { class_id: IDS.class1, date: daysAgo(1), entries: [{ student_id: IDS.studentC1, status: "present" as const, remark: null }] };
  it("teachers mark their own class; OVBS staff can't", async () => {
    expect(await saveAttendance(teacher, day)).toBe(1);
    await expect(saveAttendance(teacher, { ...day, class_id: IDS.class2 })).rejects.toThrow(/not assigned/);
    await expect(saveAttendance(ovbs, day)).rejects.toThrow(/not allowed/);
  });
});

describe("staff, registrations, settings", () => {
  it("the Users page: admins and super admins only", async () => {
    await expect(listPeople(superAdmin)).resolves.not.toHaveLength(0);
    await expect(listPeople(admin)).resolves.not.toHaveLength(0);
    for (const v of [teacher, ovbs, null]) {
      await expect(listPeople(v)).rejects.toThrow(/not allowed|sign in/);
      await expect(recentAudit(v)).rejects.toThrow(/not allowed|sign in/);
    }
  });

  it("registrations: admins see them, nobody else does", async () => {
    expect((await listRegistrations(admin, "pending")).length).toBeGreaterThan(0);
    expect(await listRegistrations(teacher, "pending")).toEqual([]);
    expect(await listRegistrations(ovbs, "pending")).toEqual([]);
  });

  it("school settings: everyone signed in may read them, only the super admin changes them", async () => {
    expect((await getSettings(teacher)).school_name).toBeTruthy();
    const settings = { school_name: "X", address: null, headmaster_name: null, vicar_name: null, certificate_wording: {} } as never;
    await expect(saveSettings(admin, settings)).rejects.toThrow(/super admin/);
    await expect(saveSettings(teacher, settings)).rejects.toThrow(/not allowed/);
    await expect(saveSettings(ovbs, settings)).rejects.toThrow(/not allowed/);
  });

  it("classes: a teacher sees only theirs, OVBS staff none", async () => {
    expect((await getClassOptions(admin)).length).toBeGreaterThan(1);
    expect((await getClassOptions(teacher)).map((c) => c.id)).toEqual([IDS.class1]);
    expect(await getClassOptions(ovbs)).toEqual([]);
  });
});

describe("accounting", () => {
  it("OVBS staff and teachers can't reach the books", async () => {
    await expect(listReceipts(ovbs)).rejects.toThrow(/not allowed/);
    await expect(cashBook(teacher, "2026-01-01", "2026-12-31")).rejects.toThrow(/not allowed/);
    await expect(cashBook(ovbs, "2026-01-01", "2026-12-31")).rejects.toThrow(/not allowed/);
  });
});
