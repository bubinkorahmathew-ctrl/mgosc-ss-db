import { describe, expect, it } from "vitest";
import { activitySchema, saveAttendanceSchema, saveMarksSchema } from "@/lib/validation/teacher";

const C = "cccccccc-0000-0000-0000-000000000001";
const S1 = "5d000000-0000-0000-0000-000000000001";
const S2 = "5d000000-0000-0000-0000-000000000002";
const SUB = "5b000000-0000-0000-0000-000000000001";

describe("attendance input", () => {
  it("accepts a normal save", () => {
    expect(saveAttendanceSchema.safeParse({ class_id: C, date: "2026-11-15",
      entries: [{ student_id: S1, status: "present" }, { student_id: S2, status: "late" }] }).success).toBe(true);
  });
  it("rejects future dates, duplicate students, unknown statuses", () => {
    expect(saveAttendanceSchema.safeParse({ class_id: C, date: "2999-01-01", entries: [{ student_id: S1, status: "present" }] }).success).toBe(false);
    expect(saveAttendanceSchema.safeParse({ class_id: C, date: "2026-11-15",
      entries: [{ student_id: S1, status: "present" }, { student_id: S1, status: "absent" }] }).success).toBe(false);
    expect(saveAttendanceSchema.safeParse({ class_id: C, date: "2026-11-15", entries: [{ student_id: S1, status: "sick" }] }).success).toBe(false);
  });
});

describe("marks input", () => {
  const base = (v: unknown) => ({ exam_id: C, rows: [{ student_id: S1, marks: { [SUB]: v } }] });
  it.each([0, 45, 12.5, 49.75, null])("accepts %s", (v) => expect(saveMarksSchema.safeParse(base(v)).success).toBe(true));
  it.each([-1, 1.234, Infinity, "12", NaN])("rejects %s", (v) => expect(saveMarksSchema.safeParse(base(v)).success).toBe(false));
});

describe("activity input", () => {
  it("treats empty student and score as class-wide / no score", () => {
    const r = activitySchema.parse({ class_id: C, student_id: "", type: "event", title: " Christmas carol ",
      activity_date: "2026-12-20", score: null, notes: "" });
    expect(r).toMatchObject({ student_id: null, score: null, notes: null, title: "Christmas carol" });
  });
  it("accepts Malayalam titles", () => {
    expect(activitySchema.safeParse({ class_id: C, type: "memory_verse", title: "സങ്കീർത്തനം 23",
      activity_date: "2026-11-15" }).success).toBe(true);
  });
});
