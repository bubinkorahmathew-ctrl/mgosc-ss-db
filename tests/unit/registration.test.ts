import { describe, expect, it } from "vitest";
import { registrationSchema } from "@/lib/validation/registration";
import { createTeacherSchema } from "@/lib/validation/staff";
import { clientIp } from "@/lib/rate-limit";
import { sanitizeSearch } from "@/lib/repo/students";
import { generateTempPassword } from "@/lib/password";

const UNIT = "70000000-0000-4000-8000-000000000001";
const valid = {
  full_name: "  Christy   Paul ",
  prayer_unit_id: UNIT,
  father_name: "  Paul   V ",
  father_phone: "98470-12345",
  dob: "2020-04-04",
  gender: "female",
  guardian_phone: "94470 00011",
  school_class: "Grade 1",
  school_name: "St. Mary's School",
  baptism_name: "  Mariam ",
  website: "",
};

const errorsOf = (input: unknown) => {
  const r = registrationSchema.safeParse(input);
  // the first message per field, as the form shows it
  return r.success ? {} : Object.fromEntries(r.error.issues.toReversed().map((i) => [String(i.path[0]), i.message]));
};

describe("registration validation", () => {
  it("accepts a valid registration and normalises text", () => {
    const r = registrationSchema.parse(valid);
    expect(r.full_name).toBe("Christy Paul");
    expect(r.guardian_phone).toBe("9447000011");
    expect(r.father_name).toBe("Paul V");
    expect(r.father_phone).toBe("9847012345");
    expect(r.prayer_unit_id).toBe(UNIT);
    expect(r.baptism_name).toBe("Mariam");
  });

  it("prayer unit, father's name and father's mobile are required, with clear messages", () => {
    const missing: Partial<typeof valid> = { ...valid };
    delete missing.prayer_unit_id;
    delete missing.father_name;
    delete missing.father_phone;
    expect(errorsOf(missing)).toMatchObject({
      prayer_unit_id: "Select the prayer unit.",
      father_name: "Father's name is required.",
      father_phone: "Father's mobile number is required.",
    });
    expect(errorsOf({ ...valid, prayer_unit_id: "", father_name: "  ", father_phone: "" })).toMatchObject({
      prayer_unit_id: "Select the prayer unit.",
      father_name: "Father's name is required.",
      father_phone: "Father's mobile number is required.",
    });
    expect(errorsOf({ ...valid, prayer_unit_id: "not-an-id" }).prayer_unit_id).toBe("Select the prayer unit.");
  });

  it("father's mobile: 8 to 15 digits, optional + country code, spaces and dashes removed", () => {
    expect(registrationSchema.parse({ ...valid, father_phone: "+966 50-123-4567" }).father_phone).toBe("+966501234567");
    expect(registrationSchema.parse({ ...valid, father_phone: "12345678" }).father_phone).toBe("12345678");
    expect(registrationSchema.parse({ ...valid, father_phone: "123456789012345" }).father_phone).toBe("123456789012345");
    for (const bad of ["1234567", "1234567890123456", "98470x2345", "++919847012345", "91+9847012345"]) {
      expect(errorsOf({ ...valid, father_phone: bad }).father_phone).toMatch(/8 to 15 digits/);
    }
  });

  it("email is optional and checked", () => {
    expect(registrationSchema.parse({ ...valid, email: "  Parent@Example.COM " }).email).toBe("parent@example.com");
    expect(registrationSchema.parse({ ...valid, email: "" }).email).toBeNull();
    expect(registrationSchema.safeParse({ ...valid, email: "not-an-email" }).success).toBe(false);
  });

  it("no longer takes the free-text prayer group", () => {
    expect(registrationSchema.parse({ ...valid, prayer_group: "St. Thomas" })).not.toHaveProperty("prayer_group");
  });

  it("teacher 12th passed year is optional, a real past year", () => {
    const base = { full_name: "T", email: "t@example.com", class_ids: [] };
    expect(createTeacherSchema.parse({ ...base, twelfth_passed_year: "2010" }).twelfth_passed_year).toBe(2010);
    expect(createTeacherSchema.parse({ ...base, twelfth_passed_year: "" }).twelfth_passed_year).toBeNull();
    expect(createTeacherSchema.parse(base).twelfth_passed_year).toBeNull();
    for (const bad of ["1949", "2999", "20x0", "2010.5"]) {
      expect(createTeacherSchema.safeParse({ ...base, twelfth_passed_year: bad }).success).toBe(false);
    }
  });

  it("asks for a baptism name instead of yes/no baptised", () => {
    expect(registrationSchema.parse({ ...valid, baptised: true })).not.toHaveProperty("baptised");
    expect(registrationSchema.parse({ ...valid, baptism_name: "" }).baptism_name).toBeNull();
    expect(registrationSchema.safeParse({ ...valid, baptism_name: "x".repeat(121) }).success).toBe(false);
    expect(registrationSchema.safeParse({ ...valid, baptism_name: "<i>x</i>" }).success).toBe(false);
  });

  it("accepts Malayalam in every text field", () => {
    const r = registrationSchema.parse({
      ...valid, full_name: "ക്രിസ്റ്റി", father_name: "പോൾ വി", address: "കോട്ടയം", school_name: "സെന്റ് മേരീസ്",
    });
    expect(r.father_name).toBe("പോൾ വി");
  });

  it("normalises Malayalam to NFC", () => {
    // ൊ (U+0D4A) written decomposed as െ + ാ (U+0D46 U+0D3E)
    const decomposed = "ജൊസ";
    const r = registrationSchema.parse({ ...valid, father_name: decomposed });
    expect(r.father_name).toBe(decomposed.normalize("NFC"));
  });

  it("no longer accepts a Malayalam name", () => {
    expect(registrationSchema.parse({ ...valid, full_name_ml: "ക്രിസ്റ്റി" })).not.toHaveProperty("full_name_ml");
  });

  it.each([
    ["missing name", { full_name: "" }],
    ["future dob", { dob: "2999-01-01" }],
    ["bad phone", { guardian_phone: "12345" }],
    ["unknown school class", { school_class: "Grade 13" }],
    ["html in name", { full_name: "<script>x</script>" }],
    ["html in father's name", { father_name: "<b>x</b>" }],
    ["over-long father's name", { father_name: "x".repeat(121) }],
  ])("rejects %s", (_label, patch) => {
    expect(registrationSchema.safeParse({ ...valid, ...patch }).success).toBe(false);
  });

  it("keeps the honeypot value so the action can silently drop bots", () => {
    expect(registrationSchema.parse({ ...valid, website: "http://spam" }).website).toBe("http://spam");
  });
});

// The rate limit itself (rate_limits table) is tested on TiDB: tests/tidb/hardening.test.ts
describe("client address", () => {
  it("uses the first X-Forwarded-For address", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "198.51.100.1, 10.0.0.1" }))).toBe("198.51.100.1");
    expect(clientIp(new Headers({ "x-real-ip": "198.51.100.2" }))).toBe("198.51.100.2");
    expect(clientIp(new Headers())).toBe("unknown");
  });
});

describe("misc", () => {
  it("strips PostgREST filter syntax from search text", () => {
    expect(sanitizeSearch("anna,status.eq.active)")).toBe("anna status.eq.active");
    expect(sanitizeSearch("ജോസഫ്")).toBe("ജോസഫ്");
  });

  it("generates readable 12-char temp passwords", () => {
    const p = generateTempPassword();
    expect(p).toMatch(/^[a-zA-Z2-9]{4}-[a-zA-Z2-9]{4}-[a-zA-Z2-9]{4}$/);
    expect(p).not.toMatch(/[01lIO]/);
    expect(new Set(Array.from({ length: 50 }, generateTempPassword)).size).toBe(50);
  });
});
