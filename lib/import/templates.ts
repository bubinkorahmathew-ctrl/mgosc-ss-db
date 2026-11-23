import "server-only";
import ExcelJS from "exceljs";
import { SCHOOL_CLASSES } from "@/lib/config";
import { formatDate } from "@/lib/dates";
import { safeCell } from "@/lib/xlsx";
import { MAX_ROWS } from "./sheet";
import { STUDENT_COLUMNS, studentHeader, subjectHeader, type ClassStudent, type Subject } from "./parse";

const LAST = MAX_ROWS + 1; // data rows 2..LAST

function headerRow(ws: ExcelJS.Worksheet, headers: string[], widths: number[]) {
  const row = ws.addRow(headers);
  row.font = { bold: true };
  row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFF6FF" } };
  widths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  ws.views = [{ state: "frozen", ySplit: 1 }];
}

function validate(ws: ExcelJS.Worksheet, column: number, from: number, to: number, rule: ExcelJS.DataValidation) {
  for (let r = from; r <= to; r++) ws.getCell(r, column).dataValidation = rule;
}

const list = (values: string[], title: string): ExcelJS.DataValidation => ({
  type: "list", allowBlank: true, formulae: [`"${values.join(",")}"`],
  showErrorMessage: true, errorTitle: title, error: `Choose one of: ${values.join(", ")}`,
});

function instructions(wb: ExcelJS.Workbook, lines: string[]) {
  const ws = wb.addWorksheet("How to fill");
  ws.getColumn(1).width = 110;
  ws.addRow(["How to fill this file"]).font = { bold: true, size: 13 };
  ws.addRow([]);
  for (const l of lines) ws.addRow([l]).alignment = { wrapText: true, vertical: "top" };
}

async function done(wb: ExcelJS.Workbook) {
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export async function studentTemplate(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Students");
  headerRow(ws, STUDENT_COLUMNS.map(studentHeader), STUDENT_COLUMNS.map((c) => c.width));
  const col = (key: string) => STUDENT_COLUMNS.findIndex((c) => c.key === key) + 1;
  // typed as text, so Excel keeps DD/MM/YYYY and leading zeros as they are
  for (const key of ["dob", "guardian_phone", "father_phone"]) ws.getColumn(col(key)).numFmt = "@";
  validate(ws, col("gender"), 2, LAST, list(["Male", "Female"], "Gender"));
  validate(ws, col("school_class"), 2, LAST, list([...SCHOOL_CLASSES], "School class"));
  instructions(wb, [
    "1. Fill one student per row on the \"Students\" sheet. Do not change the header row.",
    "2. Columns marked * are required: Name, Date of birth, Gender, Phone and School class.",
    "3. Date of birth: DD/MM/YYYY, for example 05/03/2015.",
    "4. Gender: Male or Female. School class: LKG, UKG or Grade 1 to Grade 12. Baptism name is optional.",
    "5. Phone and Father's mobile: 10 digits. Email is optional. Admission numbers are created automatically when the students are saved.",
    `6. At most ${MAX_ROWS} students per file. Every student goes into the class you choose on the upload page.`,
    "7. Upload the file and check the preview. Nothing is saved until every row is correct and you press Save.",
  ]);
  return done(wb);
}

export async function marksTemplate(opts: {
  title: string; subjects: Subject[]; students: ClassStudent[]; saved: Map<string, number>;
}): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Marks");
  headerRow(ws, ["Admission no", "Name", ...opts.subjects.map(subjectHeader)],
    [15, 28, ...opts.subjects.map((s) => Math.max(12, subjectHeader(s).length + 2))]);
  for (const s of opts.students) {
    ws.addRow([safeCell(s.admission_no), safeCell(s.full_name), ...opts.subjects.map((sub) => opts.saved.get(`${s.id}:${sub.id}`) ?? null)]);
  }
  const last = Math.max(2, opts.students.length + 1);
  opts.subjects.forEach((s, i) => validate(ws, i + 3, 2, last, {
    type: "decimal", operator: "between", allowBlank: true, formulae: [0, s.max],
    showErrorMessage: true, errorTitle: s.name, error: `Enter a mark from 0 to ${s.max}.`,
  }));
  instructions(wb, [
    `Exam: ${opts.title}`,
    "1. Enter marks next to each student. Saved marks are already filled in.",
    "2. Leave a cell blank to keep it as it is. Blank cells never delete a saved mark.",
    "3. Do not change the Admission no column: students are matched by it.",
    "4. Upload the file and check the preview. Nothing is saved until every row is correct and you press Save.",
  ]);
  return done(wb);
}

export async function attendanceTemplate(opts: { title: string; students: ClassStudent[]; date: string }): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Attendance");
  headerRow(ws, ["Admission no", "Name", formatDate(opts.date)], [15, 28, 13]);
  // headers stay text, so a typed 05/11/2026 is never turned into a US-style date
  for (let c = 3; c <= 14; c++) ws.getRow(1).getCell(c).numFmt = "@";
  for (const s of opts.students) ws.addRow([safeCell(s.admission_no), safeCell(s.full_name), null]);
  const last = Math.max(2, opts.students.length + 1);
  // room for more days next to the first one
  for (let c = 3; c <= 14; c++) validate(ws, c, 2, last, list(["P", "A", "L"], "Attendance"));
  instructions(wb, [
    `Class: ${opts.title}`,
    "1. Mark each student P (present), A (absent) or L (late) under the date.",
    "2. To add more days, type another date (DD/MM/YYYY) in the header row, in the next column.",
    "3. Leave a cell blank to skip that student for that day. Days in the future are not allowed.",
    "4. Do not change the Admission no column: students are matched by it.",
    "5. Upload the file and check the preview. Nothing is saved until every row is correct and you press Save.",
  ]);
  return done(wb);
}
