import { describe, expect, it } from "vitest";
import { FATHER_NAME_PLACEHOLDER, NOT_ASSIGNED_PRAYER_UNIT } from "@/lib/config";
import { ageOn, ageParts, formatAge } from "@/lib/dates";
import { studentConditions, studentOrder } from "@/lib/repo/students";
import type { Condition } from "@/lib/db/sql";
import { dobBoundsForAge, parseStudentReport } from "@/lib/validation/reports";
import { studentFiltersSchema } from "@/lib/validation/student";

describe("age from date of birth", () => {
  it("counts completed years and months", () => {
    expect(ageParts("2017-07-15", "2026-11-24")).toEqual({ years: 9, months: 4 });
    expect(formatAge("2017-07-15", "2026-11-24")).toBe("9 y 4 m");
    expect(formatAge("2017-07-15", "2026-11-24", true)).toBe("9");
  });

  it("birthday today and the day before", () => {
    expect(ageParts("2015-11-24", "2026-11-24")).toEqual({ years: 11, months: 0 });
    expect(ageParts("2015-11-24", "2026-11-23")).toEqual({ years: 10, months: 11 });
    expect(ageOn("2015-11-24", "2026-11-24")).toBe(11);
  });

  it("29 February birthdays are reached on 1 March in other years, on the day in leap years", () => {
    expect(ageParts("2016-02-29", "2017-02-28")).toEqual({ years: 0, months: 11 });
    expect(ageParts("2016-02-29", "2017-03-01")).toEqual({ years: 1, months: 0 });
    expect(ageParts("2016-02-29", "2020-02-28")).toEqual({ years: 3, months: 11 });
    expect(ageParts("2016-02-29", "2020-02-29")).toEqual({ years: 4, months: 0 });
  });

  it("is worked out as on any date, never stored", () => {
    expect(formatAge("2018-06-10", "2024-06-09")).toBe("5 y 11 m");
    expect(formatAge("2018-06-10", "2024-06-10")).toBe("6 y 0 m");
    expect(formatAge("2018-06-10", "2018-06-10")).toBe("0 y 0 m");
  });

  it("an age range becomes the matching date-of-birth range, for any as-on date", () => {
    const dates = ["2016-02-29", "2015-03-01", "2014-12-31", "2015-01-01", "2016-02-28", "2012-06-15", "2018-11-24"];
    const asOfs = ["2026-11-24", "2025-02-28", "2024-02-29", "2026-03-01"];
    for (const asOf of asOfs) {
      for (const [min, max] of [[8, 10], [10, 10], [0, 12], [11, 14]]) {
        const { latest, earliestExclusive } = dobBoundsForAge(asOf, min, max);
        for (const dob of dates) {
          const age = ageOn(dob, asOf);
          const inRange = age >= min && age <= max;
          expect(dob <= latest! && dob > earliestExclusive!, `${dob} as on ${asOf}, ${min}-${max}`).toBe(inRange);
        }
      }
    }
  });
});

describe("student filters", () => {
  const parse = (sp: Record<string, string>) => studentFiltersSchema.parse(sp);

  it("ignores bad values instead of failing", () => {
    expect(parse({ age_min: "x", dob_month: "13", status: "nope", prayer_unit_id: "1", as_of: "2026-02-30" }))
      .toMatchObject({ age_min: undefined, dob_month: undefined, status: undefined, prayer_unit_id: undefined, as_of: undefined });
    expect(parse({ age_min: "", age_max: "" })).toMatchObject({ age_min: undefined, age_max: undefined });
    expect(parse({ age_min: "0", age_max: "12" })).toMatchObject({ age_min: 0, age_max: 12 });
  });

  it("combines every filter", () => {
    const f = parse({
      class_id: "11111111-1111-1111-1111-111111111111", school_class: "Grade 3", gender: "female", status: "all",
      prayer_unit_id: "70000000-0000-4000-8000-000000000001", age_min: "8", age_max: "10", as_of: "2026-06-01",
      dob_from: "2015-01-01", dob_to: "2018-12-31", dob_year: "2016", dob_month: "2", incomplete: "1", q: "98470 12345",
    });
    const c = studentConditions(f);
    expect(c).toEqual(expect.arrayContaining([
      ["class_id", "eq", "11111111-1111-1111-1111-111111111111"],
      ["school_class", "eq", "Grade 3"],
      ["gender", "eq", "female"],
      ["prayer_unit_id", "eq", "70000000-0000-4000-8000-000000000001"],
      ["dob", "lte", "2018-06-01"], ["dob", "gt", "2015-06-01"],
      ["dob", "gte", "2015-01-01"], ["dob", "lte", "2018-12-31"],
      ["dob", "gte", "2016-02-01"], ["dob", "lt", "2016-03-01"],
      { or: [["prayer_unit_id", "eq", NOT_ASSIGNED_PRAYER_UNIT], ["father_name", "eq", FATHER_NAME_PLACEHOLDER]] },
    ]));
    expect(c.some((x) => Array.isArray(x) && x[0] === "status")).toBe(false); // "all"
    const search = c.find((x): x is { or: Condition[] } => "or" in x && x.or.some((y) => Array.isArray(y) && y[0] === "father_phone"));
    expect(search?.or).toEqual(expect.arrayContaining([["father_phone", "ilike", "%9847012345%"], ["full_name", "ilike", "%98470 12345%"]]));
  });

  it("defaults to active students; a birth year alone covers that year; December rolls over", () => {
    expect(studentConditions({})).toEqual([["status", "eq", "active"]]);
    expect(studentConditions({ dob_year: 2016 })).toEqual(expect.arrayContaining([["dob", "gte", "2016-01-01"], ["dob", "lt", "2017-01-01"]]));
    expect(studentConditions({ dob_year: 2016, dob_month: 12 })).toEqual(expect.arrayContaining([["dob", "gte", "2016-12-01"], ["dob", "lt", "2017-01-01"]]));
  });

  it("a birth month alone matches that month in every year", () => {
    const [, month] = studentConditions({ dob_month: 3 });
    expect("or" in month && month.or[0]).toEqual({ and: [["dob", "gte", "1990-03-01"], ["dob", "lt", "1990-04-01"]] });
    expect("or" in month && month.or).toContainEqual({ and: [["dob", "gte", "2016-03-01"], ["dob", "lt", "2016-04-01"]] });
  });

  it("sorts by age as the reverse of date of birth", () => {
    expect(studentOrder({})).toEqual({ column: "full_name", ascending: true });
    expect(studentOrder({ sort: "age" })).toEqual({ column: "dob", ascending: false }); // youngest first
    expect(studentOrder({ sort: "age", dir: "desc" })).toEqual({ column: "dob", ascending: true });
    expect(studentOrder({ sort: "dob", dir: "desc" })).toEqual({ column: "dob", ascending: false });
  });

  it("the report reads the same filters, with its class key and an as-on default", () => {
    const f = parseStudentReport({ class: "11111111-1111-1111-1111-111111111111", prayer_unit_id: "70000000-0000-4000-8000-000000000001", incomplete: "1" });
    expect(f).toMatchObject({ class_id: "11111111-1111-1111-1111-111111111111", status: "active", incomplete: "1" });
    expect(f.as_of).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(parseStudentReport({ class_id: "none" }).class_id).toBeUndefined();
  });
});
