import "server-only";
/**
 * Accounting access rules (Phase F):
 * - admins (role headmaster, super admin or not): everything;
 * - teachers: charity collection only, for their own class's students and themselves, and they
 *   see only the receipts they collected themselves; no cash book, vouchers or other income;
 * - everyone else (OVBS staff, visitors): nothing.
 * Rows are never deleted; mistakes are voided with a reason and logged.
 */
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { accountingLog } from "@/db/schema/accounts";
import { schoolSettings } from "@/db/schema";
import type { Currency } from "@/lib/money";
import { requireRole, type Viewer } from "../access";

export const db = () => getDb();
/** A Drizzle transaction. */
export type Tx = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];

export const requireAdmin = (user: Viewer) => requireRole(user, "headmaster");
export const isAdmin = (user: Viewer) => user.profile.role === "headmaster";

/** The year a receipt or voucher number belongs to: the calendar year of its date. */
export const numberYear = (date: string) => Number(date.slice(0, 4));

export async function logAction(
  tx: Tx, entity: "receipt" | "payment", entityId: string, action: "void" | "approve" | "pay", by: string, reason: string | null = null,
) {
  await tx.insert(accountingLog).values({ entity, entityId, action, by, reason });
}

/** The school's currency, for formatting (any signed-in staff member). */
export async function getCurrency(user: Viewer): Promise<Currency> {
  requireRole(user, "headmaster", "teacher");
  const [row] = await db().select({ code: schoolSettings.currencyCode, symbol: schoolSettings.currencySymbol })
    .from(schoolSettings).where(eq(schoolSettings.id, 1));
  return row ? { code: row.code, symbol: row.symbol } : { code: "SAR", symbol: "SAR" };
}
