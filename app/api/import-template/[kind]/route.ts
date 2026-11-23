import type { NextRequest } from "next/server";
import { apiUser, textResponse } from "@/lib/api";
import { AuthError } from "@/lib/auth";
import { todayISO } from "@/lib/dates";
import { loadClass, loadExam } from "@/lib/import/context";
import { attendanceTemplate, marksTemplate, studentTemplate } from "@/lib/import/templates";
import { isoDate, uuid } from "@/lib/validation/common";
import { xlsxResponse } from "@/lib/xlsx";

/** GET /api/import-template/{students|marks?exam=|attendance?class=&date=} -> .xlsx to fill in */
export async function GET(req: NextRequest, ctx: RouteContext<"/api/import-template/[kind]">) {
  const user = await apiUser();
  if (user instanceof Response) return user;
  const { kind } = await ctx.params;
  const sp = req.nextUrl.searchParams;

  try {
    if (kind === "students") return xlsxResponse(await studentTemplate(), "Students upload.xlsx");

    if (kind === "marks") {
      const examId = uuid.safeParse(sp.get("exam"));
      if (!examId.success) return textResponse(400, "Choose an exam.");
      const exam = await loadExam(user, examId.data);
      if (!exam.subjects.length) return textResponse(400, "No subjects have been set up yet.");
      const active = exam.students.filter((s) => s.status === "active");
      return xlsxResponse(await marksTemplate({ title: exam.title, subjects: exam.subjects, students: active, saved: exam.saved }),
        `Marks upload ${exam.title}.xlsx`);
    }

    if (kind === "attendance") {
      const classId = uuid.safeParse(sp.get("class"));
      if (!classId.success) return textResponse(400, "Choose a class.");
      const date = isoDate.safeParse(sp.get("date"));
      const day = date.success && date.data <= todayISO() ? date.data : todayISO();
      const cls = await loadClass(user, classId.data);
      const active = cls.students.filter((s) => s.status === "active");
      return xlsxResponse(await attendanceTemplate({ title: cls.title, students: active, date: day }),
        `Attendance upload ${cls.title}.xlsx`);
    }
    return textResponse(404, "Unknown template.");
  } catch (e) {
    if (e instanceof AuthError) return textResponse(403, e.message);
    console.error(e);
    return textResponse(500, "Could not build the template.");
  }
}
