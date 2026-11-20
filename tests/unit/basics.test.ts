import { describe, expect, it } from "vitest";
import { safeNext } from "@/lib/validation/auth";
import { ageOn, formatDate, todayISO } from "@/lib/dates";

describe("safeNext (open-redirect guard)", () => {
  it("allows same-site paths", () => {
    expect(safeNext("/teacher/attendance")).toBe("/teacher/attendance");
  });
  it.each(["https://evil.com", "//evil.com", "/\\evil.com", "evil", "", undefined, null])(
    "rejects %s", (v) => expect(safeNext(v as string)).toBeNull());
});

describe("dates", () => {
  it("todayISO uses Asia/Kolkata (UTC 20:00 is already the next day in IST)", () => {
    expect(todayISO(new Date("2026-11-18T20:00:00Z"))).toBe("2026-11-19");
  });
  it("formats DD/MM/YYYY", () => {
    expect(formatDate("2026-03-09")).toBe("09/03/2026");
  });
  it("computes age with birthday not yet reached", () => {
    expect(ageOn("2018-12-01", "2026-11-18")).toBe(7);
    expect(ageOn("2018-11-18", "2026-11-18")).toBe(8);
  });
});
