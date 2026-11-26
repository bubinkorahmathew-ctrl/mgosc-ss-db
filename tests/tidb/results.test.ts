/** Phase C on TiDB: the results views agree with lib/results.ts; grade scale and toppers rules. */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_SCALE } from "@/lib/grades";
import { computeResults } from "@/lib/results";
import { createTiDbTest, IDS, type Sandbox, type TiDbTest } from "./harness";

let t: TiDbTest;
let s: Sandbox;
beforeAll(async () => { t = await createTiDbTest(); });
afterAll(async () => { await t?.destroy(); });
beforeEach(async () => { s = await t.sandbox(); });
afterEach(async () => { await s?.end(); });

const head = () => s.as(IDS.headmaster);

describe("results views", () => {
  it("v_exam_results and v_subject_results give what the app computes", async () => {
    const subjects = await head().select("subjects");
    const students = await head().select("students", { where: [["class_id", "eq", IDS.class1]] });
    expect(students.length).toBeGreaterThanOrEqual(2);
    await s.raw("delete from marks where exam_id = ?", [IDS.examC1]);
    // first student: strong; second: AB in one subject; a third (if any) absent for the exam
    const [first, second, third] = students;
    const rows = [];
    for (const [i, sub] of subjects.entries()) {
      const max = Number(sub.max_marks);
      rows.push({ exam_id: IDS.examC1, student_id: first.id, subject_id: sub.id, marks_obtained: Math.round(max * 0.9 * 100) / 100, is_absent: false });
      rows.push({ exam_id: IDS.examC1, student_id: second.id, subject_id: sub.id,
        marks_obtained: i === 0 ? 0 : Math.round(max * 0.333 * 100) / 100, is_absent: i === 0 });
    }
    await head().upsert("marks", rows);
    if (third) await head().upsert("exam_attendance", { exam_id: IDS.examC1, student_id: third.id, status: "absent" });

    const app = computeResults(
      [first, second, ...(third ? [third] : [])].map((x) => ({ id: x.id, name: x.full_name, nameMl: null, admissionNo: x.admission_no })),
      subjects.map((x) => ({ id: x.id, name: x.name, max: Number(x.max_marks), passPercent: Number(x.pass_percent) })),
      rows, new Set(third ? [third.id] : []), DEFAULT_SCALE);
    const sql = await s.raw<{ student_id: string; percentage: string | null; overall_grade: string | null; result: string | null; class_rank: number | null }>(
      "select student_id, percentage, overall_grade, result, class_rank from v_exam_results where exam_id = ?", [IDS.examC1]);
    for (const r of app) {
      const v = sql.find((x) => x.student_id === r.id)!;
      expect([v.percentage === null ? null : Number(v.percentage), v.overall_grade, v.result, v.class_rank === null ? null : Number(v.class_rank)])
        .toEqual([r.percentage, r.grade, r.result, r.rank]);
    }
    const subjectRows = await s.raw<{ student_id: string; subject_id: string; grade: string; passed: number }>(
      "select student_id, subject_id, grade, passed from v_subject_results where exam_id = ?", [IDS.examC1]);
    for (const r of app.filter((x) => !x.examAbsent)) {
      for (const sub of subjects) {
        const v = subjectRows.find((x) => x.student_id === r.id && x.subject_id === sub.id)!;
        expect([v.grade, !!Number(v.passed)]).toEqual([r.subjectGrades[sub.id], !r.failedSubjects.includes(sub.id)]);
      }
    }
  });
});

describe("grade scale", () => {
  it("an admin replaces it as a whole; a teacher cannot; a broken scale is refused", async () => {
    const shifted = DEFAULT_SCALE.map((b) => (b.grade === "D" ? { ...b, min_percent: 35 } : b.grade === "F" ? { ...b, max_percent: 34.99 } : b));
    await head().replaceGradeScales(shifted);
    expect(Number((await head().select("grade_scales", { where: [["grade", "eq", "D"]] }))[0].min_percent)).toBe(35);
    await expect(s.as(IDS.teacher1).replaceGradeScales(DEFAULT_SCALE)).rejects.toThrow(/not allowed/);
    await expect(head().replaceGradeScales(DEFAULT_SCALE.slice(1))).rejects.toThrow(/end at 100/);
    expect(await s.as(IDS.teacher1).count("grade_scales")).toBe(7);
  });
});

describe("toppers", () => {
  const scope = (classId: string, examId: string) => ({ class_id: classId, type: "marks" as const, exam_id: examId, period_start: "2026-10-01", period_end: "2026-10-01" });

  it("only admins confirm; teachers read their own class's toppers only", async () => {
    const [c1] = await head().select("students", { where: [["class_id", "eq", IDS.class1]] });
    await expect(s.as(IDS.teacher1).confirmToppers(scope(IDS.class1, IDS.examC1), [{ student_id: c1.id, value: 90 }])).rejects.toThrow(/not allowed/);
    await expect(s.as(IDS.teacher1).insert("toppers", { ...scope(IDS.class1, IDS.examC1), academic_year_id: IDS.year, student_id: c1.id, value: 90 }))
      .rejects.toThrow(/row-level security/);
    expect(await head().confirmToppers(scope(IDS.class1, IDS.examC1), [{ student_id: c1.id, value: 90 }])).toBe(1);
    expect(await s.as(IDS.teacher1).select("toppers")).toHaveLength(1);
    expect(await s.as(IDS.teacher2).select("toppers")).toEqual([]);
    expect(await s.as(IDS.teacher1).update("toppers", { value: 99 }, [["class_id", "eq", IDS.class1]])).toEqual([]);
    expect(await s.as(IDS.teacher1).delete("toppers", [["class_id", "eq", IDS.class1]])).toEqual([]);
  });

  it("confirming again replaces the same comparison; another class's student is refused", async () => {
    const [a, b] = await head().select("students", { where: [["class_id", "eq", IDS.class1]] });
    await head().confirmToppers(scope(IDS.class1, IDS.examC1), [{ student_id: a.id, value: 90 }]);
    await head().confirmToppers(scope(IDS.class1, IDS.examC1), [{ student_id: a.id, value: 95 }, { student_id: b.id, value: 95 }]);
    expect((await head().select("toppers", { where: [["class_id", "eq", IDS.class1]] })).map((x) => Number(x.value))).toEqual([95, 95]);
    await expect(head().confirmToppers(scope(IDS.class1, IDS.examC1), [{ student_id: IDS.studentC2, value: 90 }])).rejects.toThrow(/not a student of this class/);
    await expect(head().confirmToppers(scope(IDS.class1, IDS.examC2), [{ student_id: a.id, value: 90 }])).rejects.toThrow(/exam is not for this class/);
  });
});
