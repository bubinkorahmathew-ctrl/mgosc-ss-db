/** The select-string types must be exact: `any` or `never` would hide every mistake in the pages. */
import { describe, expect, it } from "vitest";
import { parseSelect } from "@/lib/db/query";
import type { Shape } from "@/lib/db/query-types";

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
type Flat<T> = { [K in keyof T]: T[K] };
const exact = <T extends true>() => true as T;

type Student = Shape<"students", "id, full_name, classes(name, section)">;
type Klass = Shape<"classes", "id, academic_years!inner(is_current)">;
type Assign = Shape<"classes", "id, class_teachers(teacher_id, profiles(full_name))">;
type Exam = Shape<"exams", "id, marks(count)">;
type Review = Shape<"registrations", "*, reviewer:profiles!registrations_reviewed_by_fkey(full_name)">;

describe("select types", () => {
  it("plain columns", () => {
    expect(exact<Equal<Flat<Pick<Student, "id" | "full_name">>, { id: string; full_name: string }>>()).toBe(true);
    expect(exact<Equal<keyof Student, "id" | "full_name" | "classes">>()).toBe(true);
  });
  it("a nullable link can be null, an inner one can't", () => {
    expect(exact<Equal<null extends Student["classes"] ? true : false, true>>()).toBe(true);
    expect(exact<Equal<null extends Klass["academic_years"] ? true : false, false>>()).toBe(true);
    expect(exact<Equal<Klass["academic_years"]["is_current"], boolean>>()).toBe(true);
  });
  it("child lists, nested joins, counts and aliases", () => {
    expect(exact<Equal<Assign["class_teachers"][number]["profiles"]["full_name"], string>>()).toBe(true);
    expect(exact<Equal<Exam["marks"][number], { count: number }>>()).toBe(true);
    expect(exact<Equal<NonNullable<Review["reviewer"]>["full_name"], string>>()).toBe(true);
    expect(exact<Equal<Review["prayer_group"], string | null>>()).toBe(true);
  });
  it("columns that weren't selected are errors", () => {
    const student = {} as Student;
    // @ts-expect-error not selected
    expect(student.guardian_phone).toBeUndefined();
  });
  it("runtime parsing matches", () => {
    expect(parseSelect("*, reviewer:profiles!fk(full_name), b(c, d(e))")).toEqual([
      { column: "*" },
      { name: "reviewer", target: "profiles", inner: false, body: "full_name" },
      { name: "b", target: "b", inner: false, body: "c, d(e)" },
    ]);
  });
});
