/** Bulk upload end to end on TiDB: template -> filled file -> checks -> one all-or-nothing write. */
import ExcelJS from "exceljs";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { parseAttendance, parseMarks, parseStudents } from "@/lib/import/parse";
import { readSheet } from "@/lib/import/sheet";
import { attendanceTemplate, marksTemplate, studentTemplate } from "@/lib/import/templates";
import { createTiDbTest, daysAgo, IDS, PRAYER_UNIT, type Sandbox, type TiDbTest } from "./harness";

let t: TiDbTest;
let s: Sandbox;
beforeAll(async () => { t = await createTiDbTest(); });
afterAll(async () => { await t?.destroy(); });
beforeEach(async () => { s = await t.sandbox(); });
afterEach(async () => { await s?.end(); });

async function fill(template: Buffer, edit: (ws: ExcelJS.Worksheet) => void) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(template as unknown as ExcelJS.Buffer);
  edit(wb.worksheets[0]);
  return readSheet(new Uint8Array(await wb.xlsx.writeBuffer()));
}

const t1 = () => s.as(IDS.teacher1);
const classStudents = async (classId: string) =>
  (await s.as(IDS.headmaster).select("students", { where: [["class_id", "eq", classId]], order: [{ column: "full_name" }] }))
    .map((x) => ({ id: x.id, admission_no: x.admission_no, full_name: x.full_name }));
const subjects = async () =>
  (await s.as(IDS.headmaster).select("subjects", { order: [{ column: "sort_order" }] })).map((x) => ({ id: x.id, name: x.name, max: Number(x.max_marks) }));

describe("students", () => {
  it("a teacher's file goes into their class in one write, numbered in order", async () => {
    const units = await s.as(IDS.teacher1).select("prayer_units", { where: [["active", "eq", true]] });
    const sheet = await fill(await studentTemplate(units.map((u) => u.name)), (ws) => {
      ws.addRow(["Asha", "01/02/2020", "Female", "9000000001", "LKG", null, "St. Thomas", "Joseph", null, "9000000011"]);
      ws.addRow(["Binu", "02/03/2019", "Male", "9000000002", "UKG", null, "st. thomas", "Mathew", null, "+966501234567"]);
    });
    const { report, students } = parseStudents(sheet, units);
    expect(report).toMatchObject({ ready: 2, problems: 0 });
    const made = await t1().insert("students", students.map((x) => ({ ...x.data, class_id: IDS.class1, status: "active" as const })));
    expect(made.map((m) => [m.full_name, m.admission_no, m.class_id, m.prayer_unit_id, m.father_phone])).toEqual([
      ["Asha", "SS-2026-0011", IDS.class1, PRAYER_UNIT, "9000000011"],
      ["Binu", "SS-2026-0012", IDS.class1, PRAYER_UNIT, "+966501234567"],
    ]);
  });

  it("saves nothing when any row is refused", async () => {
    const before = await s.as(IDS.headmaster).count("students");
    const ok = {
      full_name: "Ok", dob: "2020-01-01", gender: "male" as const, guardian_phone: "9000000003", school_class: "LKG", class_id: IDS.class1,
      prayer_unit_id: PRAYER_UNIT, father_name: "Father", father_phone: "9000000003",
    };
    await expect(t1().insert("students", [ok, { ...ok, full_name: "Other class", class_id: IDS.class2 }])).rejects.toThrow(/row-level security/);
    await expect(t1().insert("students", [ok, { ...ok, father_name: "x".repeat(121) }])).rejects.toThrow();
    expect(await s.as(IDS.headmaster).count("students")).toBe(before);
  });
});

describe("marks", () => {
  it("a teacher saves the changed marks of their exam; another class's teacher cannot", async () => {
    const subs = await subjects();
    const students = await classStudents(IDS.class1);
    const saved = new Map((await t1().select("marks", { where: [["exam_id", "eq", IDS.examC1]] }))
      .map((m) => [`${m.student_id}:${m.subject_id}`, Number(m.marks_obtained)]));
    const sheet = await fill(await marksTemplate({ title: "x", subjects: subs, students, saved }), (ws) => {
      ws.getCell(2, 3).value = 1;
      ws.getCell(3, 3).value = 2;
    });
    const { report, entries } = parseMarks(sheet, { subjects: subs, students, existing: saved });
    expect(report.problems).toBe(0);
    expect(entries.length).toBeGreaterThan(0);
    const rows = entries.map((e) => ({ ...e, exam_id: IDS.examC1, entered_by: IDS.teacher1 }));

    await expect(s.as(IDS.teacher2).upsert("marks", rows)).rejects.toThrow(/row-level security/);
    const written = await t1().upsert("marks", rows);
    expect(written.map((w) => [w.student_id, w.subject_id, Number(w.marks_obtained), w.entered_by]))
      .toEqual(entries.map((e) => [e.student_id, e.subject_id, e.marks_obtained, IDS.teacher1]));
  });

  it("saves nothing when one mark is refused", async () => {
    const subs = await subjects();
    const [a, b] = await classStudents(IDS.class1);
    const before = await t1().select("marks", { where: [["exam_id", "eq", IDS.examC1]] });
    await expect(t1().upsert("marks", [
      { exam_id: IDS.examC1, student_id: a.id, subject_id: subs[0].id, marks_obtained: 0 },
      { exam_id: IDS.examC1, student_id: b.id, subject_id: subs[0].id, marks_obtained: subs[0].max + 1 },
    ])).rejects.toThrow(/between 0 and/);
    expect(await t1().select("marks", { where: [["exam_id", "eq", IDS.examC1]] })).toEqual(before);
  });
});

describe("attendance", () => {
  it("a teacher saves several days for their class; another class's teacher cannot", async () => {
    const students = await classStudents(IDS.class1);
    // two recent days: teachers write attendance only 14 days back
    const [first, second] = [daysAgo(9), daysAgo(2)];
    const sheet = await fill(await attendanceTemplate({ title: "x", students, date: first }), (ws) => {
      ws.getCell(1, 4).value = second.split("-").reverse().join("/");
      students.forEach((_, i) => { ws.getCell(i + 2, 3).value = "P"; ws.getCell(i + 2, 4).value = i ? "A" : "L"; });
    });
    const { report, entries } = parseAttendance(sheet, { students, today: daysAgo(0) });
    expect(report).toMatchObject({ fileErrors: [], problems: 0, ready: students.length });
    const rows = entries.map((e) => ({ ...e, class_id: IDS.class1, marked_by: IDS.teacher1 }));

    await expect(s.as(IDS.teacher2).upsert("attendance", rows)).rejects.toThrow(/row-level security/);
    const written = await t1().upsert("attendance", rows);
    expect(written).toHaveLength(students.length * 2);
    // uploading the same file again updates, never duplicates
    await t1().upsert("attendance", rows);
    expect(await t1().count("attendance", [["class_id", "eq", IDS.class1], ["date", "in", [first, second]]]))
      .toBe(students.length * 2);
  });

  it("saves nothing when one student is not in the class", async () => {
    const [c1] = await classStudents(IDS.class1);
    const before = await s.as(IDS.headmaster).count("attendance");
    await expect(s.as(IDS.headmaster).upsert("attendance", [
      { student_id: c1.id, class_id: IDS.class1, date: "2026-11-01", status: "present" },
      { student_id: IDS.studentC2, class_id: IDS.class1, date: "2026-11-01", status: "present" },
    ])).rejects.toThrow(/not in this class/);
    expect(await s.as(IDS.headmaster).count("attendance")).toBe(before);
  });
});
