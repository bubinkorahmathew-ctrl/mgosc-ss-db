import type { NextRequest } from "next/server";
import { apiUser, getBranding, pdfResponse, textResponse } from "@/lib/api";
import { uuid } from "@/lib/validation/common";
import { getExamResults } from "@/lib/data/results";
import { createClient } from "@/lib/supabase/server";
import { renderReportCards } from "@/lib/pdf/report-card";

/** GET /api/pdf/report-cards?exam=<id>[&student=<id>][&download=1] */
export async function GET(req: NextRequest) {
  const user = await apiUser();
  if (user instanceof Response) return user;

  const exam = uuid.safeParse(req.nextUrl.searchParams.get("exam"));
  const studentParam = req.nextUrl.searchParams.get("student");
  const student = studentParam ? uuid.safeParse(studentParam) : null;
  if (!exam.success || (student && !student.success)) return textResponse(400, "Invalid link.");

  // RLS: teachers only see exams of their own classes
  const data = await getExamResults(exam.data);
  if (!data) return textResponse(404, "Exam not found.");
  const ids = student?.success ? [student.data] : null;
  if (ids && !data.results.some((r) => r.id === ids[0])) return textResponse(404, "Student not found in this exam.");
  if (!data.results.length) return textResponse(404, "There are no students in this exam.");

  const supabase = await createClient();
  const { data: teachers } = await supabase.from("class_teachers")
    .select("profiles(full_name)").eq("class_id", data.exam.class_id);
  const classTeacherName = (teachers ?? []).map((t) => t.profiles?.full_name).filter(Boolean).join(", ") || null;

  const buf = await renderReportCards(data, ids, { ...(await getBranding()), classTeacherName });
  const who = ids ? data.results.find((r) => r.id === ids[0])!.name : data.className;
  return pdfResponse(buf, `Report card ${data.exam.name} ${who}.pdf`, req.nextUrl.searchParams.has("download"));
}
