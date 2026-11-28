/**
 * Every permission case of the original Postgres tests, run against TiDB.
 * As in those files, cases within a block build on each other.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTiDbTest, daysAgo, IDS, PRAYER_UNIT, type Sandbox, type TiDbTest } from "./harness";

let t: TiDbTest;
beforeAll(async () => {
  t = await createTiDbTest();
});
afterAll(async () => {
  await t?.destroy();
});

let s: Sandbox;
function freshData() {
  beforeAll(async () => {
    s = await t.sandbox();
  });
  afterAll(async () => {
    await s?.end();
  });
}
const anon = () => s.as(null);
const head = () => s.as(IDS.headmaster);
const t1 = () => s.as(IDS.teacher1);
const t2 = () => s.as(IDS.teacher2);

const child = (full_name: string, guardian_phone = "9000000099") =>
  ({
    full_name, dob: "2020-01-01", gender: "male" as const, guardian_phone, school_class: "LKG",
    prayer_unit_id: PRAYER_UNIT, father_name: "Father", father_phone: guardian_phone,
  });
const regId = async (name: string) =>
  (await s.raw<{ id: string }>("select id from registrations where full_name = ?", [name]))[0].id;
const ANY = [["full_name", "ilike", "%"]] as const;

describe("schema", () => {
  freshData();

  it("applies cleanly and loads the expected rows", async () => {
    expect(await head().count("students")).toBe(10);
  });
  it("headmaster sees every student", async () => {
    expect(await head().select("students")).toHaveLength(10);
  });
  it("teacher sees only students of own classes", async () => {
    const one = await t1().select("students");
    expect(one).toHaveLength(3);
    expect(one.every((x) => x.class_id === IDS.class1)).toBe(true);
    const two = await t2().select("students");
    expect(two).toHaveLength(7);
    expect(two.some((x) => x.class_id === IDS.class1)).toBe(false);
  });
  it("anonymous visitors see no students and no registrations", async () => {
    expect(await anon().select("students")).toEqual([]);
    expect(await anon().select("registrations")).toEqual([]);
  });
  it("anonymous insert into registrations is forced to pending", async () => {
    expect(await anon().insert("registrations", child("Test Child"))).toEqual([]);
    const [r] = await s.raw<{ status: string }>("select status from registrations where full_name = 'Test Child'");
    expect(r.status).toBe("pending");
  });
  it("anonymous status=approved / reviewed_by on insert is overridden to pending", async () => {
    await anon().insert("registrations", { ...child("Sneaky"), status: "approved", reviewed_by: IDS.headmaster });
    const [r] = await s.raw("select status, reviewed_by from registrations where full_name = 'Sneaky'");
    expect(r).toEqual({ status: "pending", reviewed_by: null });
  });
  it("teacher cannot update students", async () => {
    expect(await t1().update("students", { class_id: IDS.class2 }, [["id", "eq", IDS.studentC1]])).toEqual([]);
  });
  it("teacher cannot change own role", async () => {
    await expect(t1().update("profiles", { role: "admin" }, [["id", "eq", IDS.teacher1]])).rejects.toThrow(/name and phone/);
  });
  it("teacher can update own phone", async () => {
    expect(await t1().update("profiles", { phone: "9111111111" }, [["id", "eq", IDS.teacher1]])).toHaveLength(1);
  });
  it("approve_registration creates a student with the next admission number", async () => {
    const id = await head().approveRegistration(await regId("Christy Paul"), IDS.class1);
    expect((await head().select("students", { where: [["id", "eq", id]] }))[0].admission_no).toBe("SS-2026-0011");
  });
  it("teacher cannot approve registrations", async () => {
    await expect(t1().approveRegistration(await regId("Test Child"), IDS.class1)).rejects.toThrow(/not allowed/);
  });
  it("verify_certificate exposes only valid/type/date/name to anon", async () => {
    const [c] = await head().insert("certificates", { student_id: IDS.studentC1, type: "merit", title: "Merit", body_text: "x" });
    const v = await anon().verifyCertificate(c.certificate_no);
    expect(Object.keys(v!).sort()).toEqual(["issued_on", "student_name", "type", "valid"]);
    expect(await anon().select("certificates")).toEqual([]);
  });
});

describe("phase 2", () => {
  freshData();

  it("anonymous visitors cannot read, update or delete registrations", async () => {
    expect(await anon().update("registrations", { status: "approved" }, ANY)).toEqual([]);
    expect(await anon().delete("registrations", ANY)).toEqual([]);
  });
  it("teachers cannot read registrations", async () => {
    expect(await t1().select("registrations")).toEqual([]);
  });
  it("rate-limit table is not reachable by anon or teachers", async () => {
    await expect(anon().select("number_counters")).rejects.toThrow(/permission denied/);
    await expect(t1().insert("number_counters", { name: "receipt", year: 2026, last_value: 99 })).rejects.toThrow(/permission denied/);
  });
  it("approval is atomic and cannot happen twice", async () => {
    const id = await regId("Christy Paul");
    await head().approveRegistration(id, IDS.class2);
    await expect(head().approveRegistration(id, IDS.class2)).rejects.toThrow(/already reviewed/);
    expect(await head().count("students", [["full_name", "eq", "Christy Paul"]])).toBe(1);
    const [r] = await head().select("registrations", { where: [["id", "eq", id]] });
    expect(r.status).toBe("approved");
    expect(r.reviewed_by).toBe(IDS.headmaster);
    expect(r.student_id).toBeTruthy();
  });
  it("teachers cannot add students to other classes, or delete students", async () => {
    await expect(t1().insert("students", { ...child("Intruder"), admission_no: "X-1", class_id: IDS.class2 }))
      .rejects.toThrow(/row-level security/);
    expect(await t1().delete("students", [["id", "eq", IDS.studentC1]])).toEqual([]);
  });
  it("headmaster can move a student between classes", async () => {
    expect(await head().update("students", { class_id: IDS.class2 }, [["id", "eq", IDS.studentC1]])).toHaveLength(1);
    await head().update("students", { class_id: IDS.class1 }, [["id", "eq", IDS.studentC1]]);
  });
  it("admission numbers are sequential and unique", async () => {
    const a = await head().nextNumber("admission", 2026);
    const b = await head().nextNumber("admission", 2026);
    expect(Number(b.slice(-4))).toBe(Number(a.slice(-4)) + 1);
  });
  it("teachers cannot generate admission numbers", async () => {
    await expect(t1().nextNumber("admission", 2026)).rejects.toThrow(/not allowed/);
  });
  it("teachers cannot create classes or assign themselves", async () => {
    await expect(t1().insert("class_teachers", { class_id: IDS.class2, teacher_id: IDS.teacher1 })).rejects.toThrow(/row-level security/);
    await expect(t1().insert("classes", { name: "Hack", academic_year_id: IDS.year })).rejects.toThrow(/row-level security/);
  });
  it("teachers cannot read other teachers' profiles unless they share a class", async () => {
    expect((await t1().select("profiles")).map((p) => p.id)).toEqual([IDS.teacher1]);
  });
  it("set_current_academic_year keeps exactly one current year", async () => {
    const [y] = await head().insert("academic_years", { name: "2027-28", start_date: "2027-06-01", end_date: "2028-03-31" });
    await head().setCurrentAcademicYear(y.id);
    expect((await head().select("academic_years", { where: [["is_current", "eq", true]] })).map((x) => x.name)).toEqual(["2027-28"]);
    await head().setCurrentAcademicYear(IDS.year);
  });
  it("teachers cannot change the current academic year", async () => {
    await expect(t1().setCurrentAcademicYear(IDS.year)).rejects.toThrow(/not allowed/);
  });
  it("a deactivated teacher loses access immediately", async () => {
    await head().update("profiles", { active: false }, [["id", "eq", IDS.teacher1]]);
    expect(await t1().select("students")).toEqual([]);
    await head().update("profiles", { active: true }, [["id", "eq", IDS.teacher1]]);
  });
});

describe("phase 3", () => {
  freshData();

  const attendance = (who: string, student_id: string, class_id: string, status: "present" | "late" = "present") =>
    s.as(who).upsert("attendance", { student_id, class_id, date: daysAgo(2), status });
  const mark = (who: string, exam_id: string, student_id: string, subject_id: string, marks_obtained: number) =>
    s.as(who).upsert("marks", { exam_id, student_id, subject_id, marks_obtained });
  const activity = (who: string, class_id: string, student_id: string | null) =>
    s.as(who).insert("activities", { class_id, student_id, type: "competition", title: "Quiz", activity_date: "2026-11-15" });

  it("teacher can mark and update attendance for own class", async () => {
    expect(await attendance(IDS.teacher1, IDS.studentC1, IDS.class1)).toHaveLength(1);
    expect((await attendance(IDS.teacher1, IDS.studentC1, IDS.class1, "late"))[0].status).toBe("late");
  });
  it("teacher cannot mark attendance in another class", async () => {
    await expect(attendance(IDS.teacher1, IDS.studentC2, IDS.class2)).rejects.toThrow(/row-level security/);
  });
  it("teacher cannot smuggle another class's student into own class", async () => {
    await expect(attendance(IDS.teacher1, IDS.studentC2, IDS.class1)).rejects.toThrow();
  });
  it("teacher cannot read another class's attendance", async () => {
    await attendance(IDS.teacher2, IDS.studentC2, IDS.class2);
    expect(await t1().select("attendance", { where: [["class_id", "eq", IDS.class2]] })).toEqual([]);
  });
  it("teacher cannot update or delete another class's attendance", async () => {
    expect(await t1().update("attendance", { status: "absent" }, [["class_id", "eq", IDS.class2]])).toEqual([]);
    expect(await t1().delete("attendance", [["date", "eq", daysAgo(2)]])).toEqual([]);
  });
  it("teacher can enter and update marks for own class", async () => {
    await mark(IDS.teacher1, IDS.examC1, IDS.studentC1, IDS.subjectOT, 42);
    expect(await mark(IDS.teacher1, IDS.examC1, IDS.studentC1, IDS.subjectOT, 45)).toHaveLength(1);
    expect((await t1().select("marks"))[0].marks_obtained).toBe(45);
  });
  it("marks must be within 0 and the subject maximum", async () => {
    await expect(mark(IDS.teacher1, IDS.examC1, IDS.studentC1, IDS.subjectMV, 26)).rejects.toThrow(/between 0 and 25/);
    await expect(mark(IDS.teacher1, IDS.examC1, IDS.studentC1, IDS.subjectMV, -1)).rejects.toThrow(/between 0 and/);
  });
  it("teacher cannot enter marks for another class's exam", async () => {
    await expect(mark(IDS.teacher1, IDS.examC2, IDS.studentC2, IDS.subjectOT, 30)).rejects.toThrow(/row-level security/);
  });
  it("teacher cannot enter marks for another class's student on own exam", async () => {
    await expect(mark(IDS.teacher1, IDS.examC1, IDS.studentC2, IDS.subjectOT, 30)).rejects.toThrow();
  });
  it("teacher cannot read, update or delete another class's marks", async () => {
    await mark(IDS.teacher2, IDS.examC2, IDS.studentC2, IDS.subjectOT, 30);
    const c2 = [["exam_id", "eq", IDS.examC2]] as const;
    expect(await t1().select("marks", { where: c2 })).toEqual([]);
    expect(await t1().update("marks", { marks_obtained: 50 }, c2)).toEqual([]);
    expect(await t2().delete("marks", c2)).toEqual([]);
  });
  it("teacher cannot see other classes' exams", async () => {
    expect((await t1().select("exams")).map((e) => e.id)).toEqual([IDS.examC1]);
  });
  it("teacher cannot create exams", async () => {
    await expect(t1().insert("exams", { name: "X", class_id: IDS.class1, academic_year_id: IDS.year })).rejects.toThrow(/row-level security/);
  });
  it("teacher can add class-wide and per-student activities in own class", async () => {
    expect(await activity(IDS.teacher1, IDS.class1, null)).toHaveLength(1);
    expect(await activity(IDS.teacher1, IDS.class1, IDS.studentC1)).toHaveLength(1);
  });
  it("teacher cannot add activities to another class or its students", async () => {
    await expect(activity(IDS.teacher1, IDS.class2, null)).rejects.toThrow(/row-level security/);
    await expect(activity(IDS.teacher1, IDS.class1, IDS.studentC2)).rejects.toThrow();
  });
  it("teacher cannot read or move another class's activities", async () => {
    await activity(IDS.teacher2, IDS.class2, null);
    const c2 = [["class_id", "eq", IDS.class2]] as const;
    expect(await t1().select("activities", { where: c2 })).toEqual([]);
    await expect(t2().update("activities", { class_id: IDS.class1 }, c2)).rejects.toThrow(/row-level security/);
  });
  it("teacher cannot read another class's student by id", async () => {
    expect(await t1().select("students", { where: [["id", "eq", IDS.studentC3]] })).toEqual([]);
  });
  it("teacher2 sees both of their classes but not Class 1", async () => {
    expect((await t2().select("classes", { order: [{ column: "name" }] })).map((c) => c.id)).toEqual([IDS.class2, IDS.class3]);
  });
});

describe("phase 4", () => {
  freshData();

  const issue = (who: string, student_id: string, class_id: string | null, extra: Record<string, unknown> = {}) =>
    s.as(who).insert("certificates", { student_id, class_id, type: "completion", title: "Certificate", body_text: "Body", ...extra });

  it("assigns sequential CERT numbers and fills snapshots from the database", async () => {
    const [a] = await issue(IDS.headmaster, IDS.studentC1, IDS.class1,
      { certificate_no: "FAKE-1", student_name: "Forged", class_name: "X", year_name: "Y", revoked: true });
    const [b] = await issue(IDS.headmaster, IDS.studentC1, IDS.class1);
    expect(a.certificate_no).toBe("CERT-2026-0001");
    expect(b.certificate_no).toBe("CERT-2026-0002");
    expect(a).toMatchObject({
      student_name: "Aaron Mathew", student_name_ml: "ആരോൺ മാത്യു", class_name: "Class 1", year_name: "2026-27",
      issued_by: IDS.headmaster, revoked: false, class_teacher_name: "Mary Thomas", academic_year_id: IDS.year,
    });
  });
  it("defaults the class to the student's current class", async () => {
    expect((await issue(IDS.headmaster, IDS.studentC2, null))[0].class_name).toBe("Class 2");
  });
  it("rejects an exam from another class", async () => {
    await expect(issue(IDS.headmaster, IDS.studentC1, IDS.class1, { exam_id: IDS.examC2 })).rejects.toThrow(/exam is not for this class/);
  });
  it("a failed insert does not consume a number", async () => {
    // fails in the INSERT itself, after the number was reserved: the rollback must give it back
    await expect(issue(IDS.headmaster, IDS.studentC1, IDS.class1, { body_text: "x".repeat(70_000) })).rejects.toThrow();
    expect((await issue(IDS.headmaster, IDS.studentC3, IDS.class3))[0].certificate_no).toBe("CERT-2026-0004");
  });
  it("teacher cannot issue, even for own class", async () => {
    await expect(issue(IDS.teacher1, IDS.studentC1, IDS.class1)).rejects.toThrow(/row-level security/);
  });
  it("teacher cannot issue for another class's student", async () => {
    await expect(issue(IDS.teacher1, IDS.studentC2, IDS.class1)).rejects.toThrow();
    await expect(issue(IDS.teacher1, IDS.studentC2, IDS.class2)).rejects.toThrow(/row-level security/);
  });
  it("teacher cannot revoke or delete", async () => {
    const all = [["title", "ilike", "%"]] as const;
    expect(await t1().update("certificates", { revoked: true }, all)).toEqual([]);
    expect(await t1().delete("certificates", all)).toEqual([]);
  });
  it("teacher sees only own-class certificates", async () => {
    expect(new Set((await t1().select("certificates")).map((c) => c.class_name))).toEqual(new Set(["Class 1"]));
  });
  it("headmaster can revoke and restore, but not edit the content", async () => {
    const where = [["certificate_no", "eq", "CERT-2026-0001"]] as const;
    const [r] = await head().update("certificates", { revoked: true }, where);
    expect(r.revoked).toBe(true);
    expect(r.revoked_at).not.toBeNull();
    await expect(head().update("certificates", { body_text: "changed" }, where)).rejects.toThrow(/cannot be edited/);
    expect((await anon().verifyCertificate("CERT-2026-0001"))!.valid).toBe(false);
    const [back] = await head().update("certificates", { revoked: false }, where);
    expect(back).toMatchObject({ revoked: false, revoked_at: null });
  });
  it("deleting a linked activity still works (link becomes null)", async () => {
    const [a] = await head().insert("activities", { class_id: IDS.class1, type: "event", title: "Carol", activity_date: "2026-11-01" });
    const [c] = await issue(IDS.headmaster, IDS.studentC1, IDS.class1, { type: "participation", activity_id: a.id });
    await head().delete("activities", [["id", "eq", a.id]]);
    expect((await head().select("certificates", { where: [["id", "eq", c.id]] }))[0].activity_id).toBeNull();
  });
  it("anon verification exposes only minimal fields", async () => {
    const v = await anon().verifyCertificate("CERT-2026-0002");
    expect(Object.keys(v!).sort()).toEqual(["issued_on", "student_name", "type", "valid"]);
    expect(await anon().select("certificates")).toEqual([]);
  });
});
