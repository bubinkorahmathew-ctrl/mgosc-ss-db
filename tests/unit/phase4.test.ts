import { describe, expect, it } from "vitest";
import { computeResults, ordinal } from "@/lib/results";
import { fillTemplate, unfilledPlaceholders } from "@/lib/certificates";
import { dobBoundsForAge, minusYears, parseRange, parseStudentReport } from "@/lib/validation/reports";
import { issueCertificatesSchema } from "@/lib/validation/certificates";
import { promotionSchema, subjectSchema } from "@/lib/validation/academics";
import { ageOn } from "@/lib/dates";

const subjects = [{ id: "a", name: "OT", max: 50 }, { id: "b", name: "MV", max: 25 }];
const st = (id: string, name: string) => ({ id, name, nameMl: null, admissionNo: id });

describe("computeResults", () => {
  const rows = computeResults(
    [st("1", "Anu"), st("2", "Ben"), st("3", "Cia"), st("4", "Dan")],
    subjects,
    [
      { student_id: "1", subject_id: "a", marks_obtained: 40 }, { student_id: "1", subject_id: "b", marks_obtained: 20 },
      { student_id: "2", subject_id: "a", marks_obtained: 40 }, { student_id: "2", subject_id: "b", marks_obtained: 20 },
      { student_id: "3", subject_id: "a", marks_obtained: 45 }, // only one subject entered
    ],
  );
  const by = Object.fromEntries(rows.map((r) => [r.id, r]));

  it("percentage is over subjects with marks", () => {
    expect(by["1"]).toMatchObject({ total: 60, max: 75, percentage: 80 });
    expect(by["3"]).toMatchObject({ total: 45, max: 50, percentage: 90 });
  });
  it("uses competition ranking with ties", () => {
    expect([by["3"].rank, by["1"].rank, by["2"].rank]).toEqual([1, 2, 2]);
  });
  it("students without marks have no rank and sort last", () => {
    expect(by["4"]).toMatchObject({ percentage: null, rank: null, subjectsEntered: 0 });
    expect(rows.at(-1)!.id).toBe("4");
  });
  it("ordinals", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 101].map(ordinal)).toEqual(
      ["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "101st"]);
  });
});

describe("certificate wording", () => {
  const t = "Awarded to {student_name} of {class} for Rank {rank} in {exam}, {year}. {unknown}";
  it("fills known placeholders and keeps unknown ones", () => {
    expect(fillTemplate(t, { student_name: "അന്ന", class: "Class 1", rank: "1st", exam: "First Term", year: "2026-27" }))
      .toBe("Awarded to അന്ന of Class 1 for Rank 1st in First Term, 2026-27. {unknown}");
  });
  it("reports placeholders it cannot fill", () => {
    expect(unfilledPlaceholders(t, { student_name: "A", class: "C", year: "Y" })).toEqual(["rank", "exam"]);
  });
});

describe("report filters", () => {
  it("age bounds match ageOn", () => {
    const asOf = "2026-11-18";
    const { latest, earliestExclusive } = dobBoundsForAge(asOf, 6, 8);
    for (const dob of ["2017-11-18", "2017-11-19", "2018-11-18", "2020-11-18", "2020-11-19", "2018-02-28"]) {
      const inRange = dob <= latest! && dob > earliestExclusive!;
      const a = ageOn(dob, asOf);
      expect(inRange, dob).toBe(a >= 6 && a <= 8);
    }
  });
  it("handles 29 February", () => {
    expect(minusYears("2028-02-29", 1)).toBe("2027-02-28");
  });
  it("ignores bad values and swaps reversed ranges", () => {
    expect(parseStudentReport({ class: "x", gender: "other", age_min: "-3", status: "nope" }))
      .toMatchObject({ class_id: undefined, gender: undefined, age_min: undefined, status: "active" });
    expect(parseRange({ from: "2026-12-01", to: "2026-01-01" }, { from: "2026-06-01", to: "2026-11-01" }))
      .toMatchObject({ from: "2026-01-01", to: "2026-12-01" });
  });
});

describe("phase 4 inputs", () => {
  const C = "cccccccc-0000-0000-0000-000000000001";
  const S = "5d000000-0000-0000-0000-000000000001";
  const base = { type: "completion", class_id: C, student_ids: [S], title: "T", template: "x", issued_on: "2026-11-01" };
  it("merit needs an exam, participation an activity", () => {
    expect(issueCertificatesSchema.safeParse({ ...base, type: "merit" }).success).toBe(false);
    expect(issueCertificatesSchema.safeParse({ ...base, type: "participation", exam_id: "" }).success).toBe(false);
    expect(issueCertificatesSchema.safeParse(base).success).toBe(true);
  });
  it("rejects future issue dates and HTML in wording", () => {
    expect(issueCertificatesSchema.safeParse({ ...base, issued_on: "2999-01-01" }).success).toBe(false);
    expect(issueCertificatesSchema.safeParse({ ...base, template: "<script>" }).success).toBe(false);
  });
  it("subject max must be positive with 2 decimals", () => {
    expect(subjectSchema.safeParse({ name: "X", max_marks: 0 }).success).toBe(false);
    expect(subjectSchema.safeParse({ name: "X", max_marks: 12.345 }).success).toBe(false);
    expect(subjectSchema.safeParse({ name: "X", max_marks: 50 }).success).toBe(true);
  });
  it("promotion target must differ from source", () => {
    expect(promotionSchema.safeParse({ from_class_id: C, target: C, student_ids: [S] }).success).toBe(false);
    expect(promotionSchema.safeParse({ from_class_id: C, target: "passed_out", student_ids: [S] }).success).toBe(true);
  });
});
