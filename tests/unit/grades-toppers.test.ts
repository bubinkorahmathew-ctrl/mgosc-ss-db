import { describe, expect, it } from "vitest";
import { DEFAULT_SCALE, gradeFor, passedSubject, scaleProblems, type GradeBand } from "@/lib/grades";
import { computeAnnual, computeResults } from "@/lib/results";
import { attendancePercent, enoughSessions, pickToppers, sundaysBetween, type Candidate } from "@/lib/toppers";

const grade = (p: number) => gradeFor(p, DEFAULT_SCALE)?.grade;

describe("grade boundaries", () => {
  it.each([
    [0, "F"], [39.99, "F"], [40, "D"], [49.99, "D"], [50, "C"], [69.99, "B"], [70, "B+"],
    [79.99, "B+"], [80, "A"], [89.99, "A"], [90, "A+"], [100, "A+"],
  ])("%s%% is %s", (p, g) => expect(grade(p)).toBe(g));

  it("rounds to 2 decimals first, like the database", () => {
    expect(grade(39.994)).toBe("F");
    expect(grade(39.996)).toBe("D");
    expect(gradeFor(null, DEFAULT_SCALE)).toBeNull();
  });

  it("only F is a fail in the default scale", () => {
    expect(DEFAULT_SCALE.filter((b) => !b.is_pass).map((b) => b.grade)).toEqual(["F"]);
  });
});

describe("grade scale checks", () => {
  const edit = (i: number, patch: Partial<GradeBand>) => DEFAULT_SCALE.map((b, j) => (j === i ? { ...b, ...patch } : b));

  it("accepts the default scale", () => expect(scaleProblems(DEFAULT_SCALE)).toEqual([]));
  it("finds an overlap", () => {
    expect(scaleProblems(edit(1, { max_percent: 90 })).join(" ")).toMatch(/A and A\+ overlap/);
  });
  it("finds a gap", () => {
    expect(scaleProblems(edit(1, { max_percent: 89.5 })).join(" ")).toMatch(/Gap between A .* and A\+/);
  });
  it("needs 0 to 100, unique grades, from below to", () => {
    expect(scaleProblems(edit(6, { min_percent: 1 })).join(" ")).toMatch(/must start at 0/);
    expect(scaleProblems(edit(0, { max_percent: 99 })).join(" ")).toMatch(/must end at 100/);
    expect(scaleProblems(edit(1, { grade: "A+" })).join(" ")).toMatch(/A\+ appears twice/);
    expect(scaleProblems(edit(6, { min_percent: 50, max_percent: 39.99 })).join(" ")).toMatch(/"from" is above "to"/);
    expect(scaleProblems([])).toEqual(["Add at least one grade."]);
  });
});

describe("pass marks", () => {
  it("passes at or above the pass percentage of the maximum", () => {
    expect(passedSubject(20, 50, 40)).toBe(true);
    expect(passedSubject(19.99, 50, 40)).toBe(false);
    expect(passedSubject(10, 30, 33.33)).toBe(true);
    expect(passedSubject(9.99, 30, 33.33)).toBe(false);
  });
});

const subjects = [
  { id: "s1", name: "Bible", max: 50, passPercent: 40 },
  { id: "s2", name: "Prayers", max: 50, passPercent: 40 },
];
const st = (id: string) => ({ id, name: id.toUpperCase(), nameMl: null, admissionNo: id });
const mark = (student_id: string, subject_id: string, marks_obtained: number, is_absent = false) =>
  ({ student_id, subject_id, marks_obtained, is_absent });

describe("exam results", () => {
  const results = computeResults(
    [st("a"), st("b"), st("c"), st("d"), st("e"), st("f")], subjects, [
      mark("a", "s1", 45), mark("a", "s2", 45), // 90% A+ Pass
      mark("b", "s1", 45), mark("b", "s2", 45), // 90% tie
      mark("c", "s1", 50), mark("c", "s2", 10), // 60% but fails Prayers
      mark("d", "s1", 30), mark("d", "s2", 0, true), // AB -> Fail
      mark("e", "s1", 40), // one subject only -> pending
    ], new Set(["f"]), DEFAULT_SCALE);
  const by = Object.fromEntries(results.map((r) => [r.id, r]));

  it("ties share a rank and the next place is skipped (RANK)", () => {
    // a and b 90%, e 80% (one subject so far), c 60%, d 30%
    expect([by.a.rank, by.b.rank, by.e.rank, by.c.rank, by.d.rank]).toEqual([1, 1, 3, 4, 5]);
  });
  it("gives grades per subject and overall", () => {
    expect(by.a).toMatchObject({ percentage: 90, grade: "A+", subjectGrades: { s1: "A+", s2: "A+" } });
    expect(by.c).toMatchObject({ percentage: 60, grade: "B", subjectGrades: { s1: "A+", s2: "F" } });
    expect(by.d.subjectGrades.s2).toBe("AB");
  });
  it("Pass only when every subject is passed; AB or a low subject is a Fail", () => {
    expect([by.a.result, by.c.result, by.d.result]).toEqual(["Pass", "Fail", "Fail"]);
    expect(by.c.failedSubjects).toEqual(["s2"]);
  });
  it("still entering marks: no result yet; absent for the exam: Absent and unranked", () => {
    expect(by.e.result).toBeNull();
    expect(by.f).toMatchObject({ result: "Absent", rank: null, percentage: null });
  });
});

describe("annual result", () => {
  const exam1 = computeResults([st("a"), st("b")], subjects, [
    mark("a", "s1", 40), mark("a", "s2", 40), mark("b", "s1", 30), mark("b", "s2", 30)], new Set(), DEFAULT_SCALE);
  const exam2 = computeResults([st("a"), st("b")], subjects, [
    mark("a", "s1", 30), mark("a", "s2", 30), mark("b", "s1", 50), mark("b", "s2", 50)], new Set(), DEFAULT_SCALE);

  it("averages the percentages, weighted by each exam's weight", () => {
    const plain = Object.fromEntries(computeAnnual([{ examId: "1", weight: 1, results: exam1 }, { examId: "2", weight: 1, results: exam2 }], DEFAULT_SCALE).map((r) => [r.id, r]));
    expect([plain.a.percentage, plain.b.percentage]).toEqual([70, 80]);
    const weighted = Object.fromEntries(computeAnnual([{ examId: "1", weight: 1, results: exam1 }, { examId: "2", weight: 3, results: exam2 }], DEFAULT_SCALE).map((r) => [r.id, r]));
    expect(weighted.a.percentage).toBe(65); // (80 + 60x3) / 4
    expect(weighted.b).toMatchObject({ percentage: 90, grade: "A+", rank: 1, result: "Pass", passedAll: true });
  });
});

describe("toppers", () => {
  const c = (id: string, value: number | null, eligible = true): Candidate => ({ id, name: id, admissionNo: id, value, eligible });

  it("equal best values are joint toppers; the top 5 keeps RANK places", () => {
    const r = pickToppers([c("a", 95), c("b", 95), c("c", 90), c("d", 88), c("e", 88), c("f", 80), c("g", 70)]);
    expect(r.toppers.map((t) => t.id)).toEqual(["a", "b"]);
    expect(r.top.map((t) => [t.id, t.place])).toEqual([["a", 1], ["b", 1], ["c", 3], ["d", 4], ["e", 4]]);
  });
  it("leaves out students who are not eligible (absent, or failed a subject)", () => {
    expect(pickToppers([c("a", 99, false), c("b", 80), c("c", null)]).toppers.map((t) => t.id)).toEqual(["b"]);
    expect(pickToppers([c("a", 99, false)]).toppers).toEqual([]);
  });

  it("attendance % = (present + late) / sessions held", () => {
    expect(attendancePercent(8, 1, 10)).toBe(90);
    expect(attendancePercent(2, 0, 3)).toBe(66.67);
    expect(attendancePercent(0, 0, 0)).toBeNull();
  });

  it("counts the Sundays of a period", () => {
    expect(sundaysBetween("2026-11-01", "2026-11-30")).toBe(5); // 1, 8, 15, 22, 29
    expect(sundaysBetween("2026-11-02", "2026-11-07")).toBe(0);
    expect(sundaysBetween("2026-11-08", "2026-11-08")).toBe(1);
    expect(sundaysBetween("2026-12-01", "2026-11-01")).toBe(0);
  });

  it("needs at least the minimum share of Sundays held", () => {
    expect(enoughSessions(3, 5, 50)).toBe(true); // 60%
    expect(enoughSessions(2, 4, 50)).toBe(true); // exactly 50%
    expect(enoughSessions(2, 5, 50)).toBe(false); // 40%
    expect(enoughSessions(0, 0, 50)).toBe(false);
    expect(enoughSessions(1, 0, 50)).toBe(true); // a period with no Sunday but classes held
  });
});
