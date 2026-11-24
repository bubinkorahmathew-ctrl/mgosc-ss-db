/** Phase B on TiDB: the 14-day window, no future days, exam attendance and missed subjects. */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTiDbTest, daysAgo, IDS, type Sandbox, type TiDbTest } from "./harness";

let t: TiDbTest;
let s: Sandbox;
beforeAll(async () => { t = await createTiDbTest(); });
afterAll(async () => { await t?.destroy(); });
beforeEach(async () => { s = await t.sandbox(); });
afterEach(async () => { await s?.end(); });

const t1 = () => s.as(IDS.teacher1);
const head = () => s.as(IDS.headmaster);
const mark = (date: string, status: "present" | "absent" | "late" = "present") =>
  ({ student_id: IDS.studentC1, class_id: IDS.class1, date, status });
const tomorrow = () => new Date(Date.parse(daysAgo(0)) + 864e5).toISOString().slice(0, 10);

describe("attendance edit window", () => {
  it("a teacher writes today and up to 14 days back, with a remark, as themselves", async () => {
    const [today] = await t1().upsert("attendance", { ...mark(daysAgo(0)), remark: "fever", marked_by: IDS.headmaster });
    expect(today).toMatchObject({ remark: "fever", marked_by: IDS.teacher1 });
    expect(await t1().upsert("attendance", mark(daysAgo(14)))).toHaveLength(1);
  });

  it("a teacher cannot write or change anything older", async () => {
    await expect(t1().upsert("attendance", mark(daysAgo(15)))).rejects.toThrow(/row-level security/);
    await head().upsert("attendance", mark(daysAgo(20)));
    // an old saved row: not updatable, and an upsert over it is refused
    expect(await t1().update("attendance", { status: "absent" }, [["date", "eq", daysAgo(20)]])).toEqual([]);
    await expect(t1().upsert("attendance", mark(daysAgo(20), "late"))).rejects.toThrow(/row-level security/);
    // nor can a recent row be moved to an old date
    await t1().upsert("attendance", mark(daysAgo(1)));
    await expect(t1().update("attendance", { date: daysAgo(30) }, [["date", "eq", daysAgo(1)]])).rejects.toThrow(/row-level security/);
  });

  it("an admin changes any past date", async () => {
    expect(await head().upsert("attendance", mark(daysAgo(200), "late"))).toHaveLength(1);
    expect(await head().update("attendance", { status: "absent" }, [["date", "eq", daysAgo(200)]])).toHaveLength(1);
  });

  it("nobody marks a future date", async () => {
    await expect(head().upsert("attendance", mark(tomorrow()))).rejects.toThrow(/future/);
    await expect(t1().upsert("attendance", mark(tomorrow()))).rejects.toThrow(/future/);
  });

  it("one transaction: a bad row saves nothing", async () => {
    await expect(t1().upsert("attendance", [mark(daysAgo(3)), { ...mark(daysAgo(3)), student_id: IDS.studentC2 }])).rejects.toThrow();
    expect(await head().count("attendance", [["date", "eq", daysAgo(3)]])).toBe(0);
  });
});

describe("exam attendance", () => {
  const sat = (who: string, student_id: string, exam_id: string, status: "present" | "absent" = "present") =>
    s.as(who).upsert("exam_attendance", { exam_id, student_id, status });

  it("a teacher marks their class's exam, once per student", async () => {
    await sat(IDS.teacher1, IDS.studentC1, IDS.examC1);
    const [again] = await sat(IDS.teacher1, IDS.studentC1, IDS.examC1, "absent");
    expect(again).toMatchObject({ status: "absent", marked_by: IDS.teacher1 });
    expect(await t1().count("exam_attendance", [["exam_id", "eq", IDS.examC1]])).toBe(1);
  });

  it("not another class's exam, and cannot read it", async () => {
    await expect(sat(IDS.teacher1, IDS.studentC2, IDS.examC2)).rejects.toThrow(/row-level security/);
    await sat(IDS.teacher2, IDS.studentC2, IDS.examC2);
    expect(await t1().select("exam_attendance", { where: [["exam_id", "eq", IDS.examC2]] })).toEqual([]);
    expect(await t1().update("exam_attendance", { status: "absent" }, [["exam_id", "eq", IDS.examC2]])).toEqual([]);
  });

  it("a student from another class cannot be smuggled into an exam", async () => {
    await expect(sat(IDS.headmaster, IDS.studentC2, IDS.examC1)).rejects.toThrow(/not in this exam's class/);
  });

  it("no marks for a student absent for the exam", async () => {
    await sat(IDS.teacher1, IDS.studentC1, IDS.examC1, "absent");
    await expect(t1().upsert("marks", {
      exam_id: IDS.examC1, student_id: IDS.studentC1, subject_id: IDS.subjectMV, marks_obtained: 10, is_absent: false,
    })).rejects.toThrow(/absent for this exam/);
  });

  it("a missed subject is AB with 0 marks", async () => {
    const [ab] = await t1().upsert("marks", {
      exam_id: IDS.examC1, student_id: IDS.studentC1, subject_id: IDS.subjectMV, marks_obtained: 0, is_absent: true,
    });
    expect([ab.is_absent, Number(ab.marks_obtained)]).toEqual([true, 0]);
    await expect(t1().upsert("marks", {
      exam_id: IDS.examC1, student_id: IDS.studentC1, subject_id: IDS.subjectMV, marks_obtained: 5, is_absent: true,
    })).rejects.toThrow(/absent carries 0/);
  });
});
