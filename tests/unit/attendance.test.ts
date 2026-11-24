import { describe, expect, it } from "vitest";
import { dayPercent, isSunday, monthGrid, shiftMonth } from "@/lib/calendar";
import { teacherAttendanceFrom } from "@/lib/db/policies";
import { computeResults } from "@/lib/results";
import { saveAttendanceSchema, saveExamAttendanceSchema, saveMarksSchema } from "@/lib/validation/teacher";

const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

describe("attendance calendar", () => {
  it("lays a month out Sunday first", () => {
    const nov = monthGrid("2026-11"); // 1 November 2026 is a Sunday
    expect(nov[0]).toBe("2026-11-01");
    expect(nov).toHaveLength(30);
    const feb = monthGrid("2028-02"); // leap year, starts on a Tuesday
    expect(feb.slice(0, 3)).toEqual([null, null, "2028-02-01"]);
    expect(feb.filter(Boolean)).toHaveLength(29);
  });

  it("moves between months across years", () => {
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-11", 0)).toBe("2026-11");
  });

  it("knows Sundays and the day's attendance percentage", () => {
    expect(isSunday("2026-11-22")).toBe(true);
    expect(isSunday("2026-11-24")).toBe(false);
    expect(dayPercent(20, 15)).toBe(75);
    expect(dayPercent(3, 2)).toBe(67);
    expect(dayPercent(0, 0)).toBeNull();
  });

  it("teachers may write 14 days back, in India time", () => {
    // 23:00 UTC on 23 Nov is already 24 Nov in India
    expect(teacherAttendanceFrom(new Date("2026-11-23T23:00:00Z"))).toBe("2026-11-10");
    expect(teacherAttendanceFrom(new Date("2026-03-01T06:00:00Z"))).toBe("2026-02-15");
  });
});

describe("saving attendance", () => {
  const day = { class_id: ID(1), date: "2026-11-22" };

  it("takes a remark per student, trimmed, optional", () => {
    const v = saveAttendanceSchema.parse({ ...day, entries: [
      { student_id: ID(2), status: "present", remark: "  came with fever " },
      { student_id: ID(3), status: "late" },
    ] });
    expect(v.entries.map((e) => e.remark)).toEqual(["came with fever", null]);
    expect(saveAttendanceSchema.safeParse({ ...day, entries: [{ student_id: ID(2), status: "present", remark: "x".repeat(201) }] }).success).toBe(false);
  });

  it("refuses future dates and the same student twice", () => {
    expect(saveAttendanceSchema.safeParse({ ...day, date: "2999-01-01", entries: [{ student_id: ID(2), status: "present" }] }).success).toBe(false);
    expect(saveAttendanceSchema.safeParse({ ...day, entries: [{ student_id: ID(2), status: "present" }, { student_id: ID(2), status: "late" }] }).success).toBe(false);
  });

  it("exam attendance is present or absent only", () => {
    const ok = { exam_id: ID(9), entries: [{ student_id: ID(2), status: "absent", remark: "sick" }] };
    expect(saveExamAttendanceSchema.parse(ok).entries[0]).toMatchObject({ status: "absent", remark: "sick" });
    expect(saveExamAttendanceSchema.safeParse({ ...ok, entries: [{ student_id: ID(2), status: "late" }] }).success).toBe(false);
  });

  it("a mark can be AB for a missed subject", () => {
    const v = saveMarksSchema.parse({ exam_id: ID(9), rows: [{ student_id: ID(2), marks: { [ID(5)]: "AB", [ID(6)]: 12.5 } }] });
    expect(v.rows[0].marks).toEqual({ [ID(5)]: "AB", [ID(6)]: 12.5 });
    expect(saveMarksSchema.safeParse({ exam_id: ID(9), rows: [{ student_id: ID(2), marks: { [ID(5)]: "ab" } }] }).success).toBe(false);
  });
});

describe("results with exam attendance", () => {
  const subjects = [{ id: "s1", name: "Bible", max: 50 }, { id: "s2", name: "Prayers", max: 50 }];
  const student = (id: string, name: string) => ({ id, name, nameMl: null, admissionNo: id });
  const students = [student("a", "Anna"), student("b", "Binu"), student("c", "Cini"), student("d", "Dani")];
  const marks = [
    { student_id: "a", subject_id: "s1", marks_obtained: 40 }, { student_id: "a", subject_id: "s2", marks_obtained: 40 },
    { student_id: "b", subject_id: "s1", marks_obtained: 45 }, { student_id: "b", subject_id: "s2", marks_obtained: 0, is_absent: true },
    { student_id: "c", subject_id: "s1", marks_obtained: 50 }, { student_id: "c", subject_id: "s2", marks_obtained: 50 },
    { student_id: "d", subject_id: "s1", marks_obtained: 40 }, { student_id: "d", subject_id: "s2", marks_obtained: 40 },
  ];

  it("a student absent for the exam has no total, percentage or rank, and does not push others down", () => {
    const r = Object.fromEntries(computeResults(students, subjects, marks, new Set(["c"])).map((x) => [x.id, x]));
    expect(r.c).toMatchObject({ examAbsent: true, percentage: null, rank: null, marks: { s1: null, s2: null } });
    expect([r.a.rank, r.d.rank, r.b.rank]).toEqual([1, 1, 3]); // ties share a rank; AB counts as 0
  });

  it("a missed subject shows AB and counts as 0 of its maximum", () => {
    const b = computeResults(students, subjects, marks).find((x) => x.id === "b")!;
    expect(b).toMatchObject({ marks: { s1: 45, s2: "AB" }, total: 45, max: 100, percentage: 45, examAbsent: false });
  });
});
