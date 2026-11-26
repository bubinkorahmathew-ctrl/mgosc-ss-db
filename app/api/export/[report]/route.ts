import type { NextRequest } from "next/server";
import { apiUser, pdfResponse, textResponse } from "@/lib/api";
import { AuthError } from "@/lib/auth";
import { assertTeacherOfClass, teacherClassIds } from "@/lib/repo/access";
import { classLabelFor } from "@/lib/repo/classes";
import { formatDate } from "@/lib/dates";
import { uuid } from "@/lib/validation/common";
import { parseRange, parseStudentReport } from "@/lib/validation/reports";
import {
  activityReport, attendanceReport, defaultRange, examAttendanceReport, gradeDistribution, studentReport,
} from "@/lib/repo/reports";
import { getAnnualResults, getExamResults } from "@/lib/repo/results";
import { listConfirmedToppers } from "@/lib/repo/toppers";
import { loadBanner } from "@/lib/pdf/images";
import { renderTableReport } from "@/lib/pdf/table-report";
import { buildXlsx, xlsxResponse, type XlsxSheet } from "@/lib/xlsx";
import { ACTIVITY_LABELS } from "@/lib/validation/teacher";

/**
 * GET /api/export/{students|attendance|exam-attendance|activities|results|annual|grades|toppers}?...[&format=pdf]
 * -> the same table as Excel (default) or PDF. The policies limit what a teacher sees; class
 * filters are re-checked here.
 */
export async function GET(req: NextRequest, ctx: RouteContext<"/api/export/[report]">) {
  const user = await apiUser();
  if (user instanceof Response) return user;
  const { report } = await ctx.params;
  const sp = Object.fromEntries(req.nextUrl.searchParams.entries());
  const pdf = sp.format === "pdf";

  try {
    let sheet: XlsxSheet;
    let filename: string;

    if (report === "students") {
      const f = parseStudentReport(sp);
      if (f.class_id) await assertTeacherOfClass(user, f.class_id);
      const rows = await studentReport(user, f, await teacherClassIds(user));
      sheet = {
        name: "Students", title: `Students · age as of ${formatDate(f.as_of)} · ${rows.length} students`,
        columns: pdf ? [
          { header: "Admission no", key: "admission_no", width: 14 }, { header: "Name", key: "full_name", width: 24 },
          { header: "Class", key: "class", width: 12 }, { header: "Date of birth", key: "dob_f", width: 12 },
          { header: "Age", key: "age_ym", width: 10 }, { header: "Gender", key: "gender", width: 8 },
          { header: "School class", key: "school_class", width: 11 }, { header: "Prayer unit", key: "prayer_unit", width: 18 },
          { header: "Father", key: "father_name", width: 18 }, { header: "Father's mobile", key: "father_phone", width: 14 },
          { header: "Status", key: "status", width: 9 },
        ] : [
          { header: "Admission no", key: "admission_no", width: 15 }, { header: "Name", key: "full_name", width: 26 },
          { header: "Class", key: "class", width: 14 },
          { header: "Date of birth", key: "dob_f", width: 13 }, { header: "Age (years)", key: "age", width: 8 },
          { header: "Age", key: "age_ym", width: 10 },
          { header: "Gender", key: "gender", width: 9 }, { header: "School class", key: "school_class", width: 12 },
          { header: "School", key: "school_name", width: 24 }, { header: "Prayer unit", key: "prayer_unit", width: 22 },
          { header: "Father", key: "father_name", width: 20 },
          { header: "Mother", key: "mother_name", width: 20 }, { header: "Phone", key: "guardian_phone", width: 14 },
          { header: "Father's mobile", key: "father_phone", width: 15 }, { header: "Email", key: "email", width: 26 },
          { header: "Address", key: "address", width: 30 }, { header: "Baptism name", key: "baptism_name", width: 22 },
          { header: "Status", key: "status", width: 10 }, { header: "Inactive reason", key: "inactive_reason", width: 20 },
        ],
        rows: rows.map((r) => ({ ...r, dob_f: formatDate(r.dob) })),
      };
      filename = `Students ${f.as_of}`;
    } else if (report === "attendance") {
      const f = parseRange(sp, await defaultRange(user));
      if (!f.class_id) return textResponse(400, "Choose a class.");
      await assertTeacherOfClass(user, f.class_id);
      const label = await classLabelFor(user, f.class_id);
      const { rows, sessions } = await attendanceReport(user, f.class_id, f.from, f.to, f.onlyBelow ? f.below : undefined);
      sheet = {
        name: "Attendance",
        title: `Attendance · ${label} · ${formatDate(f.from)} to ${formatDate(f.to)} · ${sessions} days marked${f.onlyBelow ? ` · below ${f.below}% only` : ""}`,
        columns: [
          { header: "Admission no", key: "admission_no", width: 15 }, { header: "Name", key: "full_name", width: 26 },
          { header: "Present", key: "present" }, { header: "Late", key: "late" }, { header: "Absent", key: "absent" },
          { header: "Days marked", key: "days" }, { header: "Attendance %", key: "percentage" },
          { header: `Below ${f.below}%`, key: "below", width: 10 },
        ],
        rows: rows.map((r) => ({ ...r, below: r.percentage !== null && r.percentage < f.below ? "Yes" : "" })),
      };
      filename = `Attendance ${label} ${f.from} ${f.to}`;
    } else if (report === "exam-attendance") {
      const exam = uuid.safeParse(sp.exam);
      if (!exam.success) return textResponse(400, "Choose an exam.");
      const data = await examAttendanceReport(user, exam.data);
      if (!data) return textResponse(404, "Exam not found.");
      await assertTeacherOfClass(user, data.exam.class_id);
      sheet = {
        name: "Exam attendance",
        title: `${data.exam.name} · ${data.className} · ${data.present} present, ${data.absent} absent${data.notMarked.length ? `, ${data.notMarked.length} not marked` : ""}`,
        columns: [
          { header: "Admission no", key: "admission_no", width: 15 }, { header: "Absentee", key: "full_name", width: 28 },
          { header: "Remark", key: "remark", width: 40 },
        ],
        rows: data.absentees,
      };
      filename = `Exam attendance ${data.exam.name} ${data.className}`;
    } else if (report === "activities") {
      const f = parseRange(sp, await defaultRange(user));
      if (f.class_id) await assertTeacherOfClass(user, f.class_id);
      const rows = await activityReport(user, f, await teacherClassIds(user));
      sheet = {
        name: "Activities", title: `Activities · ${formatDate(f.from)} to ${formatDate(f.to)}`,
        columns: [
          { header: "Date", key: "date_f", width: 12 }, { header: "Class", key: "class", width: 14 },
          { header: "Type", key: "type_f", width: 14 }, { header: "Title", key: "title", width: 30 },
          { header: "Student", key: "student", width: 24 }, { header: "Score", key: "score" }, { header: "Notes", key: "notes", width: 40 },
        ],
        rows: rows.map((r) => ({ ...r, date_f: formatDate(r.activity_date), type_f: ACTIVITY_LABELS[r.type] })),
      };
      filename = `Activities ${f.from} ${f.to}`;
    } else if (report === "results") {
      const exam = uuid.safeParse(sp.exam);
      if (!exam.success) return textResponse(400, "Choose an exam.");
      const data = await getExamResults(user, exam.data);
      if (!data) return textResponse(404, "Exam not found.");
      sheet = {
        name: "Results", title: `${data.exam.name} · ${data.className} · ${data.yearName}`,
        columns: [
          { header: "Rank", key: "rank", width: 6 }, { header: "Admission no", key: "admissionNo", width: 15 },
          { header: "Name", key: "name", width: 26 },
          ...data.subjects.map((s) => ({ header: `${s.name} (${s.max})`, key: `s_${s.id}`, width: Math.max(10, s.name.length + 6) })),
          { header: "Total", key: "total" }, { header: "Out of", key: "max" }, { header: "Percentage", key: "percentage" },
          { header: "Grade", key: "grade", width: 7 }, { header: "Result", key: "result_f", width: 9 },
          { header: "Attendance", key: "att", width: 12 },
        ],
        rows: data.results.map((r) => {
          const a = data.attendance[r.id];
          return {
            ...r,
            ...Object.fromEntries(data.subjects.map((s) => {
              const m = r.examAbsent ? "AB" : r.marks[s.id];
              const g = r.subjectGrades[s.id];
              return [`s_${s.id}`, m === null ? "" : g && m !== "AB" ? `${m} (${g})` : m];
            })),
            total: r.subjectsEntered ? r.total : null, att: a ? `${a.present + a.late}/${a.days}` : "",
            percentage: r.examAbsent ? "Absent" : r.percentage, result_f: r.result ?? "Pending",
          };
        }),
      };
      filename = `Results ${data.exam.name} ${data.className}`;
    } else if (report === "annual") {
      const classId = uuid.safeParse(sp.class);
      const examIds = (sp.exams ?? "").split(",").filter(Boolean);
      if (!classId.success || !examIds.length || examIds.some((e) => !uuid.safeParse(e).success)) return textResponse(400, "Choose a class and exams.");
      await assertTeacherOfClass(user, classId.data);
      const data = await getAnnualResults(user, classId.data, examIds);
      if (!data) return textResponse(404, "No results.");
      sheet = {
        name: "Annual result", title: `Annual result · ${data.className} · ${data.yearName}`,
        columns: [
          { header: "Rank", key: "rank", width: 6 }, { header: "Admission no", key: "admissionNo", width: 15 },
          { header: "Name", key: "name", width: 26 },
          ...data.exams.map((e) => ({ header: `${e.name}${e.weight !== 1 ? ` (x${e.weight})` : ""} %`, key: `e_${e.id}`, width: Math.max(10, e.name.length + 4) })),
          { header: "Annual %", key: "percentage", width: 10 }, { header: "Grade", key: "grade", width: 7 },
          { header: "Result", key: "result_f", width: 9 },
        ],
        rows: data.rows.map((r) => ({
          ...r, ...Object.fromEntries(data.exams.map((e) => [`e_${e.id}`, r.exams[e.id] ?? "-"])), result_f: r.result ?? "Pending",
        })),
      };
      filename = `Annual result ${data.className}`;
    } else if (report === "grades") {
      const year = uuid.safeParse(sp.year);
      if (!year.success || !sp.exam_name) return textResponse(400, "Choose a year and an exam.");
      const allowed = await teacherClassIds(user);
      const data = await gradeDistribution(user, year.data, sp.exam_name.slice(0, 80), allowed);
      sheet = {
        name: "Grade distribution", title: `Grade distribution · ${sp.exam_name}`,
        columns: [
          { header: "Class", key: "class", width: 14 },
          ...data.grades.map((g) => ({ header: g, key: `g_${g}`, width: 6 })),
          { header: "Absent", key: "absent", width: 8 }, { header: "Not graded", key: "pending", width: 10 },
          { header: "Pass", key: "pass", width: 6 }, { header: "Fail", key: "fail", width: 6 }, { header: "Students", key: "students", width: 9 },
        ],
        rows: data.rows.map((r) => ({ ...r, ...Object.fromEntries(data.grades.map((g) => [`g_${g}`, r.counts[g] ?? 0])) })),
      };
      filename = `Grade distribution ${sp.exam_name}`;
    } else if (report === "toppers") {
      const classId = uuid.safeParse(sp.class);
      const year = uuid.safeParse(sp.year);
      if (classId.success) await assertTeacherOfClass(user, classId.data);
      const rows = await listConfirmedToppers(user, {
        classId: classId.success ? classId.data : undefined, yearId: year.success ? year.data : undefined, limit: 2000,
      });
      sheet = {
        name: "Toppers", title: "Confirmed toppers",
        columns: [
          { header: "Class", key: "className", width: 14 }, { header: "Topper", key: "student", width: 26 },
          { header: "Admission no", key: "admissionNo", width: 15 }, { header: "For", key: "what", width: 22 },
          { header: "Type", key: "type_f", width: 11 }, { header: "%", key: "value", width: 8 },
          { header: "Period", key: "period", width: 24 },
        ],
        rows: rows.map((r) => ({
          ...r, type_f: r.type === "marks" ? "Marks" : "Attendance",
          period: `${formatDate(r.periodStart)} to ${formatDate(r.periodEnd)}`,
        })),
      };
      filename = "Toppers";
    } else {
      return textResponse(404, "Unknown report.");
    }
    if (pdf) return pdfResponse(await renderTableReport([sheet], await loadBanner()), `${filename}.pdf`, sp.download === "1");
    return xlsxResponse(await buildXlsx([sheet]), `${filename}.xlsx`);
  } catch (e) {
    if (e instanceof AuthError) return textResponse(403, e.message);
    console.error(e);
    return textResponse(500, "Could not build the report.");
  }
}
