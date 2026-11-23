import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import {
  markExistingStudents, parseAttendance, parseMarks, parseStudents, studentKey,
} from "@/lib/import/parse";
import { parseDate, readSheet, SheetError } from "@/lib/import/sheet";
import { attendanceTemplate, marksTemplate, studentTemplate } from "@/lib/import/templates";

/** Opens a template like Excel would, lets the test type into it, and saves it again. */
async function fill(template: Buffer, edit: (ws: ExcelJS.Worksheet) => void): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(template as unknown as ExcelJS.Buffer);
  edit(wb.worksheets[0]);
  return new Uint8Array(await wb.xlsx.writeBuffer());
}

const STUDENTS = [
  { id: "00000000-0000-0000-0000-000000000001", admission_no: "SS-2026-0001", full_name: "Anna Mathew" },
  { id: "00000000-0000-0000-0000-000000000002", admission_no: "SS-2026-0002", full_name: "Joel Varghese" },
];
const SUBJECTS = [
  { id: "10000000-0000-0000-0000-000000000001", name: "Bible", max: 50 },
  { id: "10000000-0000-0000-0000-000000000002", name: "Prayers (Syriac)", max: 25 },
];

describe("parseDate", () => {
  it.each([
    ["05/03/2015", "2015-03-05"], ["5/3/2015", "2015-03-05"], ["05-03-2015", "2015-03-05"], ["05.03.2015", "2015-03-05"],
    ["2015-03-05", "2015-03-05"], [new Date(Date.UTC(2015, 2, 5)), "2015-03-05"], [42068, "2015-03-05"],
  ])("%s -> %s", (input, out) => expect(parseDate(input)).toBe(out));

  it.each(["31/02/2015", "13/13/2015", "2015/03/05", "abc", "", "05/03/15"])("rejects %s", (input) => {
    expect(parseDate(input)).toBeNull();
  });
});

describe("readSheet", () => {
  it("rejects files that are not Excel workbooks", async () => {
    await expect(readSheet(new TextEncoder().encode("name,dob\nA,01/01/2015"))).rejects.toBeInstanceOf(SheetError);
    await expect(readSheet(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]))).rejects.toThrow("could not be read");
  });

  it("refuses more than 500 rows", async () => {
    const file = await fill(await studentTemplate(), (ws) => {
      for (let r = 2; r <= 502; r++) ws.getCell(r, 1).value = `Child ${r}`;
    });
    await expect(readSheet(file)).rejects.toThrow("at most 500");
  });

  it("skips empty rows and reads formulas by their result", async () => {
    const file = await fill(await studentTemplate(), (ws) => {
      ws.getCell(2, 1).value = "A";
      ws.getCell(5, 1).value = { formula: "\"B\"", result: "B" } as ExcelJS.CellFormulaValue;
    });
    const sheet = await readSheet(file);
    expect(sheet.rows.map((r) => [r.row, r.cells[0]])).toEqual([[2, "A"], [5, "B"]]);
  });
});

describe("students upload", () => {
  const row = (ws: ExcelJS.Worksheet, r: number, values: (string | Date | number | null)[]) =>
    values.forEach((v, i) => { ws.getCell(r, i + 1).value = v; });

  it("accepts a correctly filled template and reports each problem with its row", async () => {
    const file = await fill(await studentTemplate(), (ws) => {
      row(ws, 2, ["Anna  Mathew", "05/03/2015", "Female", "98470 12345", "Grade 3", "St. Mary's", "St. George", "Mathew", "Mary", "98470 55555", " Family@Example.COM ", "Thrissur", "  Mariam "]);
      row(ws, 3, ["Joel", new Date(Date.UTC(2016, 0, 9)), "m", 9847012346, "4", null, null, null, null, null, null]);
      row(ws, 4, ["Bad Date", "31/02/2015", "Male", "9847012347", "Grade 1"]);
      row(ws, 5, ["No Phone", "01/01/2014", "Boy", null, "Std 9", null, null, null, null, "123", "not-an-email", null, "<b>x</b>"]);
      row(ws, 6, ["anna mathew", "5/3/2015", "F", "9847012348", "LKG"]);
      row(ws, 7, [null, "01/01/2014", "Other", "12", "Grade 13"]);
    });
    const { report, students } = parseStudents(await readSheet(file));

    expect(report.fileErrors).toEqual([]);
    expect(students.map((s) => s.data.full_name)).toEqual(["Anna Mathew", "Joel"]);
    expect(students[0].data).toMatchObject({
      dob: "2015-03-05", gender: "female", guardian_phone: "9847012345", school_class: "Grade 3",
      prayer_group: "St. George", baptism_name: "Mariam", school_name: "St. Mary's",
      father_phone: "9847055555", email: "family@example.com", address: "Thrissur",
    });
    expect(students[1].data).toMatchObject({
      dob: "2016-01-09", gender: "male", guardian_phone: "9847012346", school_class: "Grade 4", baptism_name: null,
      father_phone: null, email: null,
    });
    expect(students[0].data).not.toHaveProperty("baptised");

    const errors = Object.fromEntries(report.rows.map((r) => [r.row, r.errors]));
    expect(errors[4]).toEqual(["Date of birth \"31/02/2015\" is not a valid date. Use DD/MM/YYYY."]);
    expect(errors[5]).toEqual([
      "Enter a valid phone number (10 digits).", // father's mobile
      "Phone number is required.",
      "Enter a valid email address.",
      "Baptism name contains characters that are not allowed.",
    ]);
    expect(errors[6]).toEqual(["Same name and date of birth as row 2."]);
    expect(errors[7]).toEqual([
      "Gender must be Male or Female.",
      "School class \"Grade 13\" is not valid. Use LKG, UKG or Grade 1 to Grade 12.",
      "Child's name is required.",
      "Enter a valid phone number (10 digits).",
    ]);
    expect(report).toMatchObject({ ready: 2, problems: 4 });
  });

  it("flags children already saved", async () => {
    const file = await fill(await studentTemplate(), (ws) => {
      row(ws, 2, ["Anna Mathew", "05/03/2015", "Female", "9847012345", "Grade 3"]);
      row(ws, 3, ["Joel", "09/01/2016", "Male", "9847012346", "Grade 4"]);
    });
    const parsed = markExistingStudents(parseStudents(await readSheet(file)),
      new Map([[studentKey("ANNA MATHEW", "2015-03-05"), "SS-2025-0007"]]));
    expect(parsed.report.rows[0].errors).toEqual(["Already saved as SS-2025-0007."]);
    expect(parsed.students.map((s) => s.data.full_name)).toEqual(["Joel"]);
    expect(parsed.report).toMatchObject({ ready: 1, problems: 1 });
  });

  it("needs the template's columns", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("x");
    ws.addRow(["Name", "Birthday", "Gender"]);
    ws.addRow(["A", "01/01/2015", "Male"]);
    const { report } = parseStudents(await readSheet(new Uint8Array(await wb.xlsx.writeBuffer())));
    expect(report.fileErrors).toEqual(expect.arrayContaining([
      "The column \"Date of birth\" is missing. Use the template.",
      "The column \"Phone\" is missing. Use the template.",
      "The column \"Birthday\" is not recognised. Use the template's columns.",
    ]));
    expect(report.ready).toBe(0);
  });
});

describe("marks upload", () => {
  const saved = new Map([[`${STUDENTS[0].id}:${SUBJECTS[0].id}`, 40]]);

  it("lists the class with saved marks and reads changes back", async () => {
    const template = await marksTemplate({ title: "Term 1", subjects: SUBJECTS, students: STUDENTS, saved });
    const check = await readSheet(new Uint8Array(template));
    expect(check.headers).toEqual(["Admission no", "Name", "Bible (max 50)", "Prayers (Syriac) (max 25)"]);
    expect(check.rows.map((r) => r.cells)).toEqual([["SS-2026-0001", "Anna Mathew", 40, null], ["SS-2026-0002", "Joel Varghese", null, null]]);

    const file = await fill(template, (ws) => {
      ws.getCell(2, 4).value = 20.5;
      ws.getCell(3, 3).value = "45";
      ws.getCell(3, 4).value = "";
    });
    const { report, entries } = parseMarks(await readSheet(file), { subjects: SUBJECTS, students: STUDENTS, existing: saved });
    expect(report).toMatchObject({ fileErrors: [], ready: 2, problems: 0 });
    expect(report.rows.map((r) => r.detail)).toEqual(["1 new, 1 unchanged", "1 new"]);
    expect(entries).toEqual([
      { student_id: STUDENTS[0].id, subject_id: SUBJECTS[1].id, marks_obtained: 20.5 },
      { student_id: STUDENTS[1].id, subject_id: SUBJECTS[0].id, marks_obtained: 45 },
    ]);
  });

  it("rejects bad marks, unknown students and unknown subjects", async () => {
    const template = await marksTemplate({ title: "Term 1", subjects: SUBJECTS, students: STUDENTS, saved: new Map() });
    const file = await fill(template, (ws) => {
      ws.getCell(2, 3).value = 51;
      ws.getCell(2, 4).value = "ab";
      ws.getCell(3, 3).value = 10.123;
      ws.getCell(4, 1).value = "SS-2026-0099";
      ws.getCell(4, 3).value = 5;
      ws.getCell(5, 1).value = "ss-2026-0001";
      ws.getCell(5, 3).value = 5;
    });
    const { report, entries } = parseMarks(await readSheet(file), { subjects: SUBJECTS, students: STUDENTS, existing: new Map() });
    expect(report.rows.map((r) => r.errors)).toEqual([
      ["Bible: 51 is more than the maximum 50.", "Prayers (Syriac): \"ab\" is not a number."],
      ["Bible: use at most 2 decimals."],
      ["Admission no SS-2026-0099 is not a student of this class."],
      ["SS-2026-0001 is already on row 2."],
    ]);
    expect(entries).toEqual([]);
    expect(report.ready).toBe(0);

    const extra = await fill(template, (ws) => { ws.getCell(1, 5).value = "Maths"; ws.getCell(1, 6).value = "Total"; });
    const r2 = parseMarks(await readSheet(extra), { subjects: SUBJECTS, students: STUDENTS, existing: new Map() });
    expect(r2.report.fileErrors).toEqual(["The column \"Maths\" is not a subject. Subjects: Bible, Prayers (Syriac)."]);
  });
});

describe("attendance upload", () => {
  it("reads several days, typed as text or as Excel dates", async () => {
    const template = await attendanceTemplate({ title: "Class 1", students: STUDENTS, date: "2026-11-22" });
    const file = await fill(template, (ws) => {
      ws.getCell(1, 4).value = new Date(Date.UTC(2026, 10, 15));
      ws.getCell(2, 3).value = "P";
      ws.getCell(2, 4).value = "late";
      ws.getCell(3, 3).value = "a";
    });
    const { report, entries } = parseAttendance(await readSheet(file), { students: STUDENTS, today: "2026-11-23" });
    expect(report).toMatchObject({ fileErrors: [], ready: 2, problems: 0 });
    expect(report.rows.map((r) => r.detail)).toEqual(["1 present, 1 late", "1 absent"]);
    expect(entries).toEqual([
      { student_id: STUDENTS[0].id, date: "2026-11-22", status: "present" },
      { student_id: STUDENTS[0].id, date: "2026-11-15", status: "late" },
      { student_id: STUDENTS[1].id, date: "2026-11-22", status: "absent" },
    ]);
  });

  it("rejects future, repeated and non-date columns and unknown marks", async () => {
    const template = await attendanceTemplate({ title: "Class 1", students: STUDENTS, date: "2026-11-22" });
    const file = await fill(template, (ws) => {
      ws.getCell(1, 4).value = "29/11/2026";
      ws.getCell(1, 5).value = "22-11-2026";
      ws.getCell(1, 6).value = "Remarks";
      ws.getCell(2, 3).value = "X";
    });
    const { report } = parseAttendance(await readSheet(file), { students: STUDENTS, today: "2026-11-23" });
    expect(report.fileErrors).toEqual([
      "29/11/2026 is in the future.",
      "The date 22/11/2026 appears twice.",
      "The column \"Remarks\" is not a date. Date columns need a heading like DD/MM/YYYY.",
    ]);
    expect(report.rows[0].errors).toEqual(["22/11/2026: \"X\" is not P, A or L."]);
    expect(report.ready).toBe(0);
  });
});
