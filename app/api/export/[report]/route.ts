import type { NextRequest } from "next/server";
import { apiUser, textResponse } from "@/lib/api";
import { accessibleClassIds, assertClassAccess, AuthError } from "@/lib/auth";
import { formatDate } from "@/lib/dates";
import { uuid } from "@/lib/validation/common";
import { parseRange, parseStudentReport } from "@/lib/validation/reports";
import { activityReport, attendanceReport, defaultRange, examAttendanceReport, studentReport } from "@/lib/data/reports";
import { getExamResults } from "@/lib/data/results";
import { createClient } from "@/lib/db/server";
import { classLabel } from "@/lib/format";
import { buildXlsx, xlsxResponse, type XlsxSheet } from "@/lib/xlsx";
import { ACTIVITY_LABELS } from "@/lib/validation/teacher";

/** GET /api/export/{students|attendance|activities|results}?... -> .xlsx (RLS-limited) */
export async function GET(req: NextRequest, ctx: RouteContext<"/api/export/[report]">) {
  const user = await apiUser();
  if (user instanceof Response) return user;
  const { report } = await ctx.params;
  const sp = Object.fromEntries(req.nextUrl.searchParams.entries());

  try {
    let sheet: XlsxSheet;
    let filename: string;

    if (report === "students") {
      const f = parseStudentReport(sp);
      if (f.class_id) await assertClassAccess(user, f.class_id);
      const rows = await studentReport(f, await accessibleClassIds(user));
      sheet = {
        name: "Students", title: `Students · age as of ${formatDate(f.as_of)} · ${rows.length} students`,
        columns: [
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
      filename = `Students ${f.as_of}.xlsx`;
    } else if (report === "attendance") {
      const f = parseRange(sp, await defaultRange());
      if (!f.class_id) return textResponse(400, "Choose a class.");
      await assertClassAccess(user, f.class_id);
      const label = await classLabelFor(f.class_id);
      const { rows, sessions } = await attendanceReport(f.class_id, f.from, f.to);
      sheet = {
        name: "Attendance", title: `Attendance · ${label} · ${formatDate(f.from)} to ${formatDate(f.to)} · ${sessions} days marked`,
        columns: [
          { header: "Admission no", key: "admission_no", width: 15 }, { header: "Name", key: "full_name", width: 26 },
          { header: "Present", key: "present" }, { header: "Late", key: "late" }, { header: "Absent", key: "absent" },
          { header: "Days marked", key: "days" }, { header: "Attendance %", key: "percentage" },
        ],
        rows,
      };
      filename = `Attendance ${label} ${f.from} ${f.to}.xlsx`;
    } else if (report === "exam-attendance") {
      const exam = uuid.safeParse(sp.exam);
      if (!exam.success) return textResponse(400, "Choose an exam.");
      const data = await examAttendanceReport(exam.data);
      if (!data) return textResponse(404, "Exam not found.");
      await assertClassAccess(user, data.exam.class_id);
      sheet = {
        name: "Exam attendance",
        title: `${data.exam.name} · ${data.className} · ${data.present} present, ${data.absent} absent${data.notMarked.length ? `, ${data.notMarked.length} not marked` : ""}`,
        columns: [
          { header: "Admission no", key: "admission_no", width: 15 }, { header: "Absentee", key: "full_name", width: 28 },
          { header: "Remark", key: "remark", width: 40 },
        ],
        rows: data.absentees,
      };
      filename = `Exam attendance ${data.exam.name} ${data.className}.xlsx`;
    } else if (report === "activities") {
      const f = parseRange(sp, await defaultRange());
      if (f.class_id) await assertClassAccess(user, f.class_id);
      const rows = await activityReport(f, await accessibleClassIds(user));
      sheet = {
        name: "Activities", title: `Activities · ${formatDate(f.from)} to ${formatDate(f.to)}`,
        columns: [
          { header: "Date", key: "date_f", width: 12 }, { header: "Class", key: "class", width: 14 },
          { header: "Type", key: "type_f", width: 14 }, { header: "Title", key: "title", width: 30 },
          { header: "Student", key: "student", width: 24 }, { header: "Score", key: "score" }, { header: "Notes", key: "notes", width: 40 },
        ],
        rows: rows.map((r) => ({ ...r, date_f: formatDate(r.activity_date), type_f: ACTIVITY_LABELS[r.type] })),
      };
      filename = `Activities ${f.from} ${f.to}.xlsx`;
    } else if (report === "results") {
      const exam = uuid.safeParse(sp.exam);
      if (!exam.success) return textResponse(400, "Choose an exam.");
      const data = await getExamResults(exam.data);
      if (!data) return textResponse(404, "Exam not found.");
      sheet = {
        name: "Results", title: `${data.exam.name} · ${data.className} · ${data.yearName}`,
        columns: [
          { header: "Rank", key: "rank", width: 6 }, { header: "Admission no", key: "admissionNo", width: 15 },
          { header: "Name", key: "name", width: 26 },
          ...data.subjects.map((s) => ({ header: `${s.name} (${s.max})`, key: `s_${s.id}`, width: Math.max(10, s.name.length + 6) })),
          { header: "Total", key: "total" }, { header: "Out of", key: "max" }, { header: "Percentage", key: "percentage" },
          { header: "Attendance", key: "att", width: 12 },
        ],
        rows: data.results.map((r) => {
          const a = data.attendance[r.id];
          return {
            ...r, ...Object.fromEntries(data.subjects.map((s) => [`s_${s.id}`, r.examAbsent ? "AB" : r.marks[s.id]])),
            total: r.subjectsEntered ? r.total : null, att: a ? `${a.present + a.late}/${a.days}` : "",
            percentage: r.examAbsent ? "Absent" : r.percentage,
          };
        }),
      };
      filename = `Results ${data.exam.name} ${data.className}.xlsx`;
    } else {
      return textResponse(404, "Unknown report.");
    }
    return xlsxResponse(await buildXlsx([sheet]), filename);
  } catch (e) {
    if (e instanceof AuthError) return textResponse(403, e.message);
    console.error(e);
    return textResponse(500, "Could not build the report.");
  }
}

async function classLabelFor(classId: string) {
  const dbc = await createClient();
  const { data } = await dbc.from("classes").select("name, section").eq("id", classId).maybeSingle();
  return data ? classLabel(data) : "Class";
}
