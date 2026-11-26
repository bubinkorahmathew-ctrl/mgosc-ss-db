import { randomBytes, scryptSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { BCRYPT_COST, hashPassword, needsRehash, verifyPassword } from "@/lib/authn/password";
import { changePasswordSchema, newPasswordSchema } from "@/lib/validation/auth";

/** A hash in the pre-S2 format, built the way the old code built it. */
function legacyHash(password: string) {
  const salt = randomBytes(16);
  const key = scryptSync(password.normalize("NFC"), salt, 32, { N: 2 ** 15, r: 8, p: 3, maxmem: 128 * 1024 * 1024 });
  return ["scrypt", 15, 8, 3, salt.toString("base64url"), key.toString("base64url")].join("$");
}

describe("password hashing", () => {
  it("bcrypt: accepts the right password and rejects others", async () => {
    const hash = await hashPassword("correct horse battery");
    expect(hash).toMatch(new RegExp(`^\\$2[aby]\\$${BCRYPT_COST}\\$`));
    expect(await verifyPassword("correct horse battery", hash)).toBe(true);
    expect(await verifyPassword("Correct horse battery", hash)).toBe(false);
    expect(await verifyPassword("", hash)).toBe(false);
    expect(needsRehash(hash)).toBe(false);
  });

  it("salts every hash and never contains the password", async () => {
    const [a, b] = await Promise.all([hashPassword("same-password"), hashPassword("same-password")]);
    expect(a).not.toBe(b);
    expect(a).not.toContain("same-password");
  });

  it("treats equivalent Unicode spellings as the same password", async () => {
    const composed = "café ൊ സണ്‍ഡേ";
    expect(composed.normalize("NFD")).not.toBe(composed);
    expect(await verifyPassword(composed.normalize("NFD"), await hashPassword(composed))).toBe(true);
  });

  it("still verifies old scrypt hashes, and marks them for replacement", async () => {
    const old = legacyHash("an-old-password");
    expect(await verifyPassword("an-old-password", old)).toBe(true);
    expect(await verifyPassword("wrong-password", old)).toBe(false);
    expect(needsRehash(old)).toBe(true);
  });

  it("rejects a missing or damaged hash without throwing", async () => {
    for (const stored of [null, undefined, "", "plain", "scrypt$99$8$3$x$y", "$2b$12$short", "$2b$99$" + "a".repeat(53)]) {
      expect(await verifyPassword("anything", stored)).toBe(false);
    }
  });
});

describe("password rules", () => {
  it("at least 10 characters, at most 72 bytes", () => {
    expect(newPasswordSchema.safeParse("123456789").success).toBe(false);
    expect(newPasswordSchema.safeParse("1234567890").success).toBe(true);
    expect(newPasswordSchema.safeParse("a".repeat(72)).success).toBe(true);
    expect(newPasswordSchema.safeParse("a".repeat(73)).success).toBe(false);
    expect(newPasswordSchema.safeParse("സ".repeat(25)).success).toBe(false); // 75 bytes
  });

  it("the new password must match its repeat and differ from the current one", () => {
    const ok = { current: "temporary-1", password: "a-new-password", confirm: "a-new-password" };
    expect(changePasswordSchema.safeParse(ok).success).toBe(true);
    expect(changePasswordSchema.safeParse({ ...ok, confirm: "different" }).success).toBe(false);
    expect(changePasswordSchema.safeParse({ ...ok, current: ok.password }).success).toBe(false);
  });
});
