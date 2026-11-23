import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/authn/password";

describe("password hashing", () => {
  it("accepts the right password and rejects others", async () => {
    const hash = await hashPassword("correct horse battery");
    expect(await verifyPassword("correct horse battery", hash)).toBe(true);
    expect(await verifyPassword("Correct horse battery", hash)).toBe(false);
    expect(await verifyPassword("", hash)).toBe(false);
  });

  it("salts every hash and never contains the password", async () => {
    const [a, b] = await Promise.all([hashPassword("same-password"), hashPassword("same-password")]);
    expect(a).not.toBe(b);
    expect(a).toMatch(/^scrypt\$15\$8\$3\$/);
    expect(a).not.toContain("same-password");
  });

  it("treats equivalent Unicode spellings as the same password", async () => {
    const composed = "café ൊ സണ്‍ഡേ";
    expect(composed.normalize("NFD")).not.toBe(composed);
    expect(await verifyPassword(composed.normalize("NFD"), await hashPassword(composed))).toBe(true);
  });

  it("rejects a missing or damaged hash without throwing", async () => {
    for (const stored of [null, undefined, "", "plain", "scrypt$99$8$3$x$y"]) {
      expect(await verifyPassword("anything", stored)).toBe(false);
    }
  });
});
