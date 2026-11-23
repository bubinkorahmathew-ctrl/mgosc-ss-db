/**
 * Checks uploaded rows before anything is saved. Nothing here touches the database: the caller
 * passes in what it may see (subjects, the class's students, saved marks) and saves only when
 * the report has no problems.
 */
import { SCHOOL_CLASSES } from "@/lib/config";
import { formatDate } from "@/lib/dates";
import { personalFields, type PersonalFields } from "@/lib/validation/common";
import { header, parseDate, text, type Cell, type Sheet } from "./sheet";

export type ImportRow = { row: number; name: string; detail: string; errors: string[] };
export type ImportReport = {
  fileErrors: string[];
  rows: ImportRow[];
  /** rows that will be saved */
  ready: number;
  /** rows with errors */
  problems: number;
  saved?: number;
};

/** The most the database takes in one save. */
export const MAX_ENTRIES = 5000;

type Column = { key: string; label: string; required?: boolean; aliases: string[] };

/** Columns people often add next to the data; they are ignored rather than reported. */
const IGNORED = new Set(["", "no", "sl no", "s no", "sno", "serial no", "#", "total", "out of", "percentage", "rank", "attendance"]);

function mapColumns(headers: Cell[], columns: Column[], errors: string[], allowUnknown = false) {
  const found = new Map<string, number>();
  const unknown: { index: number; text: string }[] = [];
  headers.forEach((h, index) => {
    const name = header(h);
    const column = columns.find((c) => c.aliases.includes(name));
    if (!column) {
      if (!IGNORED.has(name)) unknown.push({ index, text: text(h) });
      return;
    }
    if (found.has(column.key)) errors.push(`The column "${column.label}" appears twice.`);
    else found.set(column.key, index);
  });
  for (const c of columns) if (c.required && !found.has(c.key)) errors.push(`The column "${c.label}" is missing. Use the template.`);
  if (!allowUnknown) for (const u of unknown) errors.push(`The column "${u.text}" is not recognised. Use the template's columns.`);
  return { found, unknown };
}

const report = (fileErrors: string[], rows: ImportRow[], ready: (r: ImportRow) => boolean): ImportReport => ({
  fileErrors,
  rows,
  ready: fileErrors.length ? 0 : rows.filter((r) => !r.errors.length && ready(r)).length,
  problems: rows.filter((r) => r.errors.length).length,
});

// ---------------------------------------------------------------------------
// Students
// ---------------------------------------------------------------------------
export const STUDENT_COLUMNS: (Column & { hint?: string; width: number })[] = [
  { key: "full_name", label: "Name", required: true, aliases: ["name", "student name", "child's name", "full name"], width: 26 },
  { key: "dob", label: "Date of birth", required: true, hint: "DD/MM/YYYY", aliases: ["date of birth", "dob", "birth date"], width: 16 },
  { key: "gender", label: "Gender", required: true, hint: "Male/Female", aliases: ["gender", "sex"], width: 12 },
  { key: "guardian_phone", label: "Phone", required: true, aliases: ["phone", "guardian phone", "mobile", "phone number"], width: 15 },
  { key: "school_class", label: "School class", required: true, hint: "LKG, UKG, Grade 1-12", aliases: ["school class", "standard", "std"], width: 14 },
  { key: "school_name", label: "School name", aliases: ["school name", "school"], width: 24 },
  { key: "prayer_group", label: "Prayer group", aliases: ["prayer group", "prayer group name"], width: 20 },
  { key: "father_name", label: "Father's name", aliases: ["father's name", "father", "father name", "fathers name"], width: 20 },
  { key: "mother_name", label: "Mother's name", aliases: ["mother's name", "mother", "mother name", "mothers name"], width: 20 },
  { key: "father_phone", label: "Father's mobile", aliases: ["father's mobile", "father's mobile number", "father's phone", "father mobile", "father phone"], width: 16 },
  { key: "email", label: "Email", aliases: ["email", "e-mail", "email address"], width: 26 },
  { key: "address", label: "Address", aliases: ["address"], width: 30 },
  { key: "baptism_name", label: "Baptism name", aliases: ["baptism name", "baptismal name"], width: 20 },
];

export const studentHeader = (c: (typeof STUDENT_COLUMNS)[number]) =>
  `${c.label}${c.required ? " *" : ""}${c.hint ? ` (${c.hint})` : ""}`;

function schoolClass(value: string): string | null {
  const v = value.toLowerCase().replace(/\s+/g, " ").trim();
  const exact = SCHOOL_CLASSES.find((c) => c.toLowerCase() === v);
  if (exact) return exact;
  const n = /^(?:grade|std|standard|class)?\s*\.?\s*(\d{1,2})(?:st|nd|rd|th)?$/.exec(v);
  if (n && Number(n[1]) >= 1 && Number(n[1]) <= 12) return `Grade ${Number(n[1])}`;
  return null;
}

function gender(value: string): "male" | "female" | null {
  const v = value.toLowerCase();
  if (["male", "m", "boy"].includes(v)) return "male";
  if (["female", "f", "girl"].includes(v)) return "female";
  return null;
}

export type ParsedStudent = { row: number; key: string; data: PersonalFields };

/** Same child: same name (any case) and date of birth. */
export const studentKey = (name: string, dob: string) => `${name.toLowerCase()}|${dob}`;

export function parseStudents(sheet: Sheet) {
  const fileErrors: string[] = [];
  const { found } = mapColumns(sheet.headers, STUDENT_COLUMNS, fileErrors);
  const at = (cells: Cell[], key: string) => (found.has(key) ? cells[found.get(key)!] : null);
  const rows: ImportRow[] = [];
  const students: ParsedStudent[] = [];
  const seen = new Map<string, number>();

  for (const { row, cells } of sheet.rows) {
    const errors: string[] = [];
    const name = text(at(cells, "full_name"));
    const dobCell = at(cells, "dob");
    const dob = parseDate(dobCell);
    if (text(dobCell) && !dob) errors.push(`Date of birth "${text(dobCell)}" is not a valid date. Use DD/MM/YYYY.`);
    const g = gender(text(at(cells, "gender")));
    if (text(at(cells, "gender")) && !g) errors.push(`Gender must be Male or Female.`);
    const sc = schoolClass(text(at(cells, "school_class")));
    if (text(at(cells, "school_class")) && !sc) errors.push(`School class "${text(at(cells, "school_class"))}" is not valid. Use LKG, UKG or Grade 1 to Grade 12.`);

    const result = personalFields.safeParse({
      full_name: name,
      dob: dob ?? (text(dobCell) ? "invalid" : undefined),
      gender: g ?? undefined,
      guardian_phone: text(at(cells, "guardian_phone")) || undefined,
      school_class: sc ?? undefined,
      school_name: text(at(cells, "school_name")),
      prayer_group: text(at(cells, "prayer_group")),
      father_name: text(at(cells, "father_name")),
      mother_name: text(at(cells, "mother_name")),
      father_phone: text(at(cells, "father_phone")),
      email: text(at(cells, "email")),
      address: text(at(cells, "address")),
      baptism_name: text(at(cells, "baptism_name")),
    });
    if (!result.success) {
      const reported = new Set<string>();
      for (const issue of result.error.issues) {
        const field = String(issue.path[0] ?? "");
        // already explained above, with the value that was typed
        if ((field === "dob" && text(dobCell) && !dob) || (field === "gender" && text(at(cells, "gender")))
          || (field === "school_class" && text(at(cells, "school_class")))) continue;
        if (reported.has(field)) continue;
        reported.add(field);
        errors.push(issue.message);
      }
    }

    let key = "";
    if (result.success && !errors.length) {
      key = studentKey(result.data.full_name, result.data.dob);
      const first = seen.get(key);
      if (first) errors.push(`Same name and date of birth as row ${first}.`);
      else {
        seen.set(key, row);
        students.push({ row, key, data: result.data });
      }
    }
    rows.push({
      row, name: name || "(no name)", errors,
      detail: [dob ? formatDate(dob) : "", sc ?? "", g ? (g === "male" ? "Male" : "Female") : ""].filter(Boolean).join(" · "),
    });
  }
  if (!sheet.rows.length && !fileErrors.length) fileErrors.push("The file has no students. Fill in the template below the header row.");
  return { report: report(fileErrors, rows, () => true), students };
}

/** Marks rows whose child is already saved (key -> admission number). */
export function markExistingStudents(parsed: ReturnType<typeof parseStudents>, existing: Map<string, string>) {
  for (const s of parsed.students) {
    const no = existing.get(s.key);
    if (no) parsed.report.rows.find((r) => r.row === s.row)?.errors.push(`Already saved as ${no}.`);
  }
  parsed.students = parsed.students.filter((s) => !existing.has(s.key));
  parsed.report = report(parsed.report.fileErrors, parsed.report.rows, () => true);
  return parsed;
}

// ---------------------------------------------------------------------------
// Rows matched to students by admission number
// ---------------------------------------------------------------------------
export type ClassStudent = { id: string; admission_no: string; full_name: string };

const ADMISSION: Column = {
  key: "admission_no", label: "Admission no", required: true,
  aliases: ["admission no", "admission number", "adm no", "admission no.", "admission_no", "admn no"],
};
const NAME: Column = { key: "name", label: "Name", aliases: ["name", "student name", "student"] };

function matchStudents(sheet: Sheet, found: Map<string, number>, students: ClassStudent[]) {
  const byNo = new Map(students.map((s) => [s.admission_no.toUpperCase(), s]));
  const seen = new Map<string, number>();
  return sheet.rows.map(({ row, cells }) => {
    const errors: string[] = [];
    const no = text(cells[found.get("admission_no") ?? -1] ?? null).toUpperCase();
    const typedName = text(cells[found.get("name") ?? -1] ?? null);
    const student = no ? byNo.get(no) : undefined;
    if (!no) errors.push("Admission no is missing.");
    else if (!student) errors.push(`Admission no ${no} is not a student of this class.`);
    else if (seen.has(student.id)) errors.push(`${no} is already on row ${seen.get(student.id)}.`);
    if (student && !seen.has(student.id)) seen.set(student.id, row);
    return { row, cells, errors, student, name: student?.full_name ?? (typedName || no || "(blank)") };
  });
}

// ---------------------------------------------------------------------------
// Marks
// ---------------------------------------------------------------------------
export type Subject = { id: string; name: string; max: number };
export type MarkEntry = { student_id: string; subject_id: string; marks_obtained: number };

export const subjectHeader = (s: Subject) => `${s.name} (max ${s.max})`;

function mark(cell: Cell): number | null | "invalid" {
  if (typeof cell === "number") return Number.isFinite(cell) ? cell : "invalid";
  const t = text(cell).replace(",", ".");
  if (t === "") return null;
  return /^\d+(\.\d+)?$/.test(t) ? Number(t) : "invalid";
}

export function parseMarks(sheet: Sheet, ctx: {
  subjects: Subject[]; students: ClassStudent[]; existing: Map<string, number>;
}) {
  const fileErrors: string[] = [];
  const subjectColumns: Column[] = ctx.subjects.map((s) => ({ key: s.id, label: s.name, aliases: [header(s.name)] }));
  const { found, unknown } = mapColumns(sheet.headers, [ADMISSION, NAME, ...subjectColumns], fileErrors, true);
  for (const u of unknown) fileErrors.push(`The column "${u.text}" is not a subject. Subjects: ${ctx.subjects.map((s) => s.name).join(", ")}.`);
  const subjects = ctx.subjects.filter((s) => found.has(s.id));
  if (!subjects.length && !fileErrors.length) fileErrors.push("No subject columns were found. Use the template.");

  const entries: MarkEntry[] = [];
  const changes = new Map<number, number>();
  const rows: ImportRow[] = matchStudents(sheet, found, ctx.students).map((r) => {
    let fresh = 0, changed = 0, same = 0;
    const mine: MarkEntry[] = [];
    for (const s of subjects) {
      const cell = r.cells[found.get(s.id)!];
      const value = mark(cell);
      if (value === null) continue;
      if (value === "invalid") { r.errors.push(`${s.name}: "${text(cell)}" is not a number.`); continue; }
      if (Math.abs(Math.round(value * 100) - value * 100) > 1e-6) { r.errors.push(`${s.name}: use at most 2 decimals.`); continue; }
      if (value < 0) { r.errors.push(`${s.name}: marks cannot be negative.`); continue; }
      if (value > s.max) { r.errors.push(`${s.name}: ${value} is more than the maximum ${s.max}.`); continue; }
      const marks = Math.round(value * 100) / 100;
      if (!r.student) continue;
      const before = ctx.existing.get(`${r.student.id}:${s.id}`);
      if (before === undefined) fresh++;
      else if (before !== marks) changed++;
      else { same++; continue; }
      mine.push({ student_id: r.student.id, subject_id: s.id, marks_obtained: marks });
    }
    if (!r.errors.length) entries.push(...mine);
    const parts = [fresh && `${fresh} new`, changed && `${changed} changed`, same && `${same} unchanged`].filter(Boolean);
    changes.set(r.row, mine.length);
    return { row: r.row, name: r.name, errors: r.errors, detail: parts.length ? parts.join(", ") : "no marks" };
  });
  if (entries.length > MAX_ENTRIES) fileErrors.push(`Too many marks in one file (${entries.length}). Upload at most ${MAX_ENTRIES}.`);
  if (!sheet.rows.length && !fileErrors.length) fileErrors.push("The file has no rows.");
  return { report: report(fileErrors, rows, (r) => (changes.get(r.row) ?? 0) > 0), entries };
}

// ---------------------------------------------------------------------------
// Attendance
// ---------------------------------------------------------------------------
export type AttendanceStatus = "present" | "absent" | "late";
export type AttendanceEntry = { student_id: string; date: string; status: AttendanceStatus };
const MAX_DATES = 60;

function status(value: string): AttendanceStatus | null | "invalid" {
  const v = value.toLowerCase();
  if (v === "") return null;
  if (v === "p" || v === "present") return "present";
  if (v === "a" || v === "absent") return "absent";
  if (v === "l" || v === "late") return "late";
  return "invalid";
}

export function parseAttendance(sheet: Sheet, ctx: { students: ClassStudent[]; today: string }) {
  const fileErrors: string[] = [];
  const { found, unknown } = mapColumns(sheet.headers, [ADMISSION, NAME], fileErrors, true);
  const dates: { index: number; date: string }[] = [];
  for (const u of unknown) {
    const date = parseDate(sheet.headers[u.index]);
    if (!date) fileErrors.push(`The column "${u.text}" is not a date. Date columns need a heading like DD/MM/YYYY.`);
    else if (date > ctx.today) fileErrors.push(`${formatDate(date)} is in the future.`);
    else if (dates.some((d) => d.date === date)) fileErrors.push(`The date ${formatDate(date)} appears twice.`);
    else dates.push({ index: u.index, date });
  }
  if (!dates.length && !fileErrors.length) fileErrors.push("No date columns were found. Add a column for each day, headed DD/MM/YYYY.");
  if (dates.length > MAX_DATES) fileErrors.push(`Too many dates in one file (at most ${MAX_DATES}).`);

  const entries: AttendanceEntry[] = [];
  const rows: ImportRow[] = matchStudents(sheet, found, ctx.students).map((r) => {
    const counts = { present: 0, absent: 0, late: 0 };
    const mine: AttendanceEntry[] = [];
    for (const d of dates) {
      const cell = r.cells[d.index];
      const value = status(text(cell));
      if (value === null) continue;
      if (value === "invalid") { r.errors.push(`${formatDate(d.date)}: "${text(cell)}" is not P, A or L.`); continue; }
      counts[value]++;
      if (r.student) mine.push({ student_id: r.student.id, date: d.date, status: value });
    }
    if (!r.errors.length) entries.push(...mine);
    const parts = [counts.present && `${counts.present} present`, counts.late && `${counts.late} late`, counts.absent && `${counts.absent} absent`].filter(Boolean);
    return { row: r.row, name: r.name, errors: r.errors, detail: parts.length ? parts.join(", ") : "nothing marked" };
  });
  if (entries.length > MAX_ENTRIES) fileErrors.push(`Too many entries in one file (${entries.length}). Upload at most ${MAX_ENTRIES}.`);
  if (!sheet.rows.length && !fileErrors.length) fileErrors.push("The file has no rows.");
  return { report: report(fileErrors, rows, (r) => r.detail !== "nothing marked"), entries };
}
