/**
 * Result types for select strings such as "id, name, classes(name, section)".
 * A typo in a column or relation becomes a type error where the result is used.
 */
import type { Rows, TableName } from "./schema";

/** The joins the app uses. `one`: our column -> their id. `many`: their column -> our id. */
export const RELATIONS = {
  classes: {
    academic_years: { table: "academic_years", one: "academic_year_id" },
    class_teachers: { table: "class_teachers", many: "class_id" },
  },
  class_teachers: {
    classes: { table: "classes", one: "class_id" },
    profiles: { table: "profiles", one: "teacher_id" },
  },
  students: {
    classes: { table: "classes", one: "class_id" },
    prayer_units: { table: "prayer_units", one: "prayer_unit_id" },
  },
  registrations: {
    profiles: { table: "profiles", one: "reviewed_by" },
    prayer_units: { table: "prayer_units", one: "prayer_unit_id" },
  },
  exams: {
    classes: { table: "classes", one: "class_id" },
    academic_years: { table: "academic_years", one: "academic_year_id" },
    marks: { table: "marks", many: "exam_id" },
  },
  marks: {
    exams: { table: "exams", one: "exam_id" },
    subjects: { table: "subjects", one: "subject_id" },
  },
  exam_attendance: {
    exams: { table: "exams", one: "exam_id" },
    students: { table: "students", one: "student_id" },
  },
  attendance: {
    students: { table: "students", one: "student_id" },
  },
  activities: {
    classes: { table: "classes", one: "class_id" },
    students: { table: "students", one: "student_id" },
  },
} as const;
type Relations = typeof RELATIONS;

type Trim<S extends string> = S extends ` ${infer R}` ? Trim<R> : S extends `${infer R} ` ? Trim<R> : S;

/** Split on commas that are not inside brackets. */
type Split<S extends string, Depth extends unknown[] = [], Part extends string = "", Done extends string = never> =
  S extends `${infer C}${infer Rest}`
    ? C extends "(" ? Split<Rest, [...Depth, 1], `${Part}${C}`, Done>
      : C extends ")" ? Split<Rest, Depth extends [...infer D, unknown] ? D : [], `${Part}${C}`, Done>
      : C extends "," ? (Depth extends [] ? Split<Rest, [], "", Done | Trim<Part>> : Split<Rest, Depth, `${Part}${C}`, Done>)
      : Split<Rest, Depth, `${Part}${C}`, Done>
    : Done | Trim<Part>;

type Head<P extends string> = P extends `${infer H}(${string}` ? H : P;
type WithoutHint<H extends string> = H extends `${infer N}!${string}` ? N : H;
type Alias<H extends string> = H extends `${infer A}:${string}` ? A : WithoutHint<H>;
type Target<H extends string> = H extends `${string}:${infer T}` ? WithoutHint<T> : WithoutHint<H>;

type Relation<T extends TableName, Name extends string> =
  T extends keyof Relations ? (Name extends keyof Relations[T] ? Relations[T][Name] : never) : never;

type Embedded<T extends TableName, P extends string> =
  P extends `${infer H}(${infer Body})`
    ? Relation<T, Target<H>> extends infer R
      ? R extends { table: infer To extends TableName; many: string }
        ? (Body extends "count" ? { count: number }[] : Shape<To, Body>[])
        : R extends { table: infer To extends TableName; one: infer Col extends keyof Rows[T] }
          ? Shape<To, Body> | (H extends `${string}!inner` ? never : null extends Rows[T][Col] ? null : never)
          : never
      : never
    : never;

type Plain<T extends TableName, P extends string> =
  "*" extends P ? Rows[T] : Pick<Rows[T], P & keyof Rows[T]>;

export type Shape<T extends TableName, S extends string> =
  Split<S> extends infer Parts extends string
    ? Plain<T, Exclude<Parts, `${string}(${string})`>> & {
        [P in Extract<Parts, `${string}(${string})`> as Alias<Head<P>>]: Embedded<T, P>;
      }
    : never;
