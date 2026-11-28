/**
 * "Forgot password" links and notification recipients, on a throwaway TiDB database.
 * No email is sent here: the links are created and redeemed directly.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDrizzle, type Db } from "@/db/client";
import { createTeacherAccount } from "@/lib/authn/accounts";
import { changeOwnPassword, checkLogin, loadSessionUser, type Client } from "@/lib/authn/login";
import { createResetLink, RESET_LINK_MINUTES, RESET_REQUESTS_PER_HOUR, resetLinkIsValid, resetLinksOf, resetPasswordWithLink } from "@/lib/authn/reset";
import { adminRecipients, classTeacherRecipients } from "@/lib/repo/notify";
import { createTiDbTest, IDS, type TiDbTest } from "./harness";

let t: TiDbTest;
let db: Db;
beforeAll(async () => {
  t = await createTiDbTest();
  db = createDrizzle(t.url);
});
afterAll(async () => {
  await t?.destroy();
});

const device = (): Client => ({ device: randomUUID(), secret: "test-secret-that-is-long-enough-1234567890" });

async function teacher() {
  const email = `${randomUUID()}@test.invalid`;
  const { id, password } = await createTeacherAccount(t.database, IDS.headmaster, { email, full_name: "Reset Teacher", phone: null, class_ids: [IDS.class1] });
  const own = `own-${randomUUID()}`;
  await changeOwnPassword(db, id, password, own, device());
  return { id, email, password: own };
}

describe("reset links", () => {
  it("only a hash is stored; the link sets a new password once and ends every sign-in", async () => {
    const u = await teacher();
    const before = await checkLogin(db, u.email, u.password, device());
    if (!before.ok) throw new Error("setup");
    const link = await createResetLink(db, ` ${u.email.toUpperCase()} `);
    expect(link).toMatchObject({ email: u.email, name: "Reset Teacher" });
    const stored = JSON.stringify(await t.database.query("select * from password_reset_tokens"));
    expect(stored).not.toContain(link!.token);

    expect(await resetLinkIsValid(db, link!.token)).toBe(true);
    expect(await resetPasswordWithLink(db, link!.token, "a-brand-new-password")).toBe(true);
    expect(await resetPasswordWithLink(db, link!.token, "another-new-password")).toBe(false); // used
    expect(await resetLinkIsValid(db, link!.token)).toBe(false);

    expect((await checkLogin(db, u.email, u.password, device())).ok).toBe(false);
    expect((await checkLogin(db, u.email, "a-brand-new-password", device())).ok).toBe(true);
    expect(await loadSessionUser(db, { id: u.id, authAt: before.user.authAt })).toBeNull();
  });

  it("expire after an hour", async () => {
    const u = await teacher();
    const start = new Date();
    const link = await createResetLink(db, u.email, start);
    const later = new Date(start.getTime() + (RESET_LINK_MINUTES + 1) * 60_000);
    expect(await resetLinkIsValid(db, link!.token, later)).toBe(false);
    expect(await resetPasswordWithLink(db, link!.token, "too-late-password", later)).toBe(false);
  });

  it("a new link replaces the older one; at most 3 an hour", async () => {
    const u = await teacher();
    const first = await createResetLink(db, u.email);
    const second = await createResetLink(db, u.email);
    expect(await resetLinkIsValid(db, first!.token)).toBe(false);
    expect(await resetLinkIsValid(db, second!.token)).toBe(true);
    await createResetLink(db, u.email);
    expect(RESET_REQUESTS_PER_HOUR).toBe(3);
    expect(await createResetLink(db, u.email)).toBeNull();
    expect(await resetLinksOf(db, u.id)).toHaveLength(3);
  });

  it("nothing for an unknown or deactivated account, and garbage tokens are refused", async () => {
    expect(await createResetLink(db, "nobody@test.invalid")).toBeNull();
    const u = await teacher();
    await t.database.query("update profiles set active = false where id = ?", [u.id]);
    expect(await createResetLink(db, u.email)).toBeNull();
    for (const bad of ["", "x", "A".repeat(43), "' or 1=1 --"]) expect(await resetPasswordWithLink(db, bad, "whatever-password")).toBe(false);
  });
});

describe("notification recipients", () => {
  it("admins for registrations and a class's teachers for new students, only with notifications on, never the actor", async () => {
    const u = await teacher();
    expect((await classTeacherRecipients(IDS.class1)).map((r) => r.email)).toContain(u.email);
    expect((await classTeacherRecipients(IDS.class1, u.id)).map((r) => r.email)).not.toContain(u.email);
    await t.database.query("update profiles set email_notifications = false where id = ?", [u.id]);
    expect((await classTeacherRecipients(IDS.class1)).map((r) => r.email)).not.toContain(u.email);
    expect((await classTeacherRecipients(IDS.class2)).map((r) => r.email)).not.toContain(u.email);
    const admins = await adminRecipients();
    expect(admins.every((a) => a.email.includes("@"))).toBe(true);
  });
});
