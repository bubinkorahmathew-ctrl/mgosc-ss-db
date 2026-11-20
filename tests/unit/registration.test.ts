import { describe, expect, it } from "vitest";
import { registrationSchema } from "@/lib/validation/registration";
import { checkAndRecord, clientIp, hashIp, type AttemptStore } from "@/lib/rate-limit";
import { sanitizeSearch } from "@/lib/data/students";
import { generateTempPassword } from "@/lib/password";

const valid = {
  full_name: "  Christy   Paul ",
  full_name_ml: "ക്രിസ്റ്റി പോൾ",
  dob: "2020-04-04",
  gender: "female",
  guardian_phone: "94470 00011",
  school_class: "Grade 1",
  school_name: "St. Mary's School",
  baptised: true,
  website: "",
};

describe("registration validation", () => {
  it("accepts a valid registration and normalises text", () => {
    const r = registrationSchema.parse(valid);
    expect(r.full_name).toBe("Christy Paul");
    expect(r.guardian_phone).toBe("9447000011");
    expect(r.father_name).toBeNull();
    expect(r.baptised).toBe(true);
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
    const r = registrationSchema.parse({ ...valid, full_name_ml: decomposed });
    expect(r.full_name_ml).toBe(decomposed.normalize("NFC"));
  });

  it("rejects Latin text in the Malayalam name field", () => {
    expect(registrationSchema.safeParse({ ...valid, full_name_ml: "Christy" }).success).toBe(false);
  });

  it.each([
    ["missing name", { full_name: "" }],
    ["future dob", { dob: "2999-01-01" }],
    ["bad phone", { guardian_phone: "12345" }],
    ["unknown school class", { school_class: "Grade 13" }],
    ["html in name", { full_name: "<script>x</script>" }],
  ])("rejects %s", (_label, patch) => {
    expect(registrationSchema.safeParse({ ...valid, ...patch }).success).toBe(false);
  });

  it("keeps the honeypot value so the action can silently drop bots", () => {
    expect(registrationSchema.parse({ ...valid, website: "http://spam" }).website).toBe("http://spam");
  });
});

function memoryStore(): AttemptStore & { rows: { key: string; at: Date }[] } {
  const rows: { key: string; at: Date }[] = [];
  return {
    rows,
    async count(key, since) { return rows.filter((r) => r.key === key && r.at >= since).length; },
    async record(key) { rows.push({ key, at: new Date() }); },
  };
}

describe("registration rate limit", () => {
  it("allows 5 attempts per hour per IP, then blocks", async () => {
    const store = memoryStore();
    const key = hashIp("203.0.113.9", "salt");
    const results = [];
    for (let i = 0; i < 7; i++) results.push(await checkAndRecord(store, key));
    expect(results).toEqual([true, true, true, true, true, false, false]);
    expect(store.rows.length).toBe(5); // blocked attempts are not recorded
  });

  it("does not affect other IPs", async () => {
    const store = memoryStore();
    for (let i = 0; i < 5; i++) await checkAndRecord(store, hashIp("1.1.1.1", "s"));
    expect(await checkAndRecord(store, hashIp("2.2.2.2", "s"))).toBe(true);
  });

  it("allows again after the window passes", async () => {
    const store = memoryStore();
    const key = "k";
    for (let i = 0; i < 5; i++) await checkAndRecord(store, key);
    const later = new Date(Date.now() + 61 * 60_000);
    expect(await checkAndRecord(store, key, undefined, later)).toBe(true);
  });

  it("never stores the raw IP", () => {
    const h = hashIp("203.0.113.9", "salt");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).not.toContain("203");
    expect(hashIp("203.0.113.9", "other")).not.toBe(h);
  });

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
