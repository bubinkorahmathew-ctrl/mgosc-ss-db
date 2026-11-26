/**
 * Accounting: receipts (income), payment vouchers (expense), categories, events, opening balances
 * and the log of voids and approvals. Money is DECIMAL(12,2) (read as strings, see lib/money.ts).
 * Rows are never deleted: a mistake is voided with a reason and logged.
 */
import { sql } from "drizzle-orm";
import {
  boolean, check, date, decimal, index, mysqlEnum, mysqlTable, text, uniqueIndex, varchar,
} from "drizzle-orm/mysql-core";
import { createdAt, id, ref, utc } from "./columns";
import { profiles, students } from "./people";
import { classes } from "./school";

const money = (name: string) => decimal(name, { precision: 12, scale: 2 });
const now = () => sql`(current_timestamp(3))`;
/** created/updated by and at, on every accounting table */
const audit = () => ({
  createdBy: ref("created_by").references(() => profiles.id, { onDelete: "restrict" }),
  createdAt: createdAt(),
  updatedBy: ref("updated_by").references(() => profiles.id, { onDelete: "restrict" }),
  updatedAt: utc("updated_at").notNull().default(now()),
});

export const PAYMENT_MODES = ["cash", "bank", "online"] as const;

export const accountCategories = mysqlTable("account_categories", {
  id: id(),
  name: varchar("name", { length: 80 }).notNull(),
  type: mysqlEnum("type", ["income", "expense"]).notNull(),
  active: boolean("active").notNull().default(true),
  ...audit(),
}, (t) => [
  uniqueIndex("account_categories_type_name_key").on(t.type, t.name),
  check("account_categories_name_check", sql`char_length(trim(${t.name})) > 0`),
]);

export const events = mysqlTable("events", {
  id: id(),
  name: varchar("name", { length: 120 }).notNull(),
  eventDate: date("event_date", { mode: "string" }),
  budget: money("budget"),
  status: mysqlEnum("status", ["planned", "ongoing", "closed"]).notNull().default("planned"),
  notes: text("notes"),
  ...audit(),
}, (t) => [
  index("events_date_idx").on(t.eventDate),
  check("events_name_check", sql`char_length(trim(${t.name})) > 0`),
  check("events_budget_check", sql`${t.budget} is null or ${t.budget} >= 0`),
]);

export const receipts = mysqlTable("receipts", {
  id: id(),
  receiptNo: varchar("receipt_no", { length: 20 }).notNull(),
  receiptDate: date("receipt_date", { mode: "string" }).notNull(),
  receivedFromType: mysqlEnum("received_from_type", ["student", "teacher", "other"]).notNull(),
  studentId: ref("student_id").references(() => students.id, { onDelete: "restrict" }),
  teacherId: ref("teacher_id").references(() => profiles.id, { onDelete: "restrict" }),
  /** the payer's name as it was (filled from the student or teacher) */
  receivedFromName: varchar("received_from_name", { length: 120 }).notNull(),
  /** the student's class when the money was received (charity by class after promotion) */
  classId: ref("class_id").references(() => classes.id, { onDelete: "set null" }),
  categoryId: ref("category_id").notNull().references(() => accountCategories.id, { onDelete: "restrict" }),
  eventId: ref("event_id").references(() => events.id, { onDelete: "restrict" }),
  amount: money("amount").notNull(),
  paymentMode: mysqlEnum("payment_mode", PAYMENT_MODES).notNull(),
  referenceNo: varchar("reference_no", { length: 60 }),
  remarks: varchar("remarks", { length: 300 }),
  collectedBy: ref("collected_by").notNull().references(() => profiles.id, { onDelete: "restrict" }),
  status: mysqlEnum("status", ["active", "void"]).notNull().default("active"),
  voidReason: varchar("void_reason", { length: 300 }),
  ...audit(),
}, (t) => [
  uniqueIndex("receipts_no_key").on(t.receiptNo),
  index("receipts_date_idx").on(t.receiptDate),
  index("receipts_student_idx").on(t.studentId),
  index("receipts_teacher_idx").on(t.teacherId),
  index("receipts_class_date_idx").on(t.classId, t.receiptDate),
  index("receipts_category_idx").on(t.categoryId),
  index("receipts_event_idx").on(t.eventId),
  index("receipts_collected_by_idx").on(t.collectedBy),
  check("receipts_amount_check", sql`${t.amount} > 0`),
  check("receipts_void_reason_check", sql`${t.status} <> 'void' or char_length(trim(coalesce(${t.voidReason}, ''))) > 0`),
  check("receipts_payer_check", sql`(${t.receivedFromType} = 'student' and ${t.studentId} is not null)
    or (${t.receivedFromType} = 'teacher' and ${t.teacherId} is not null)
    or (${t.receivedFromType} = 'other' and ${t.studentId} is null and ${t.teacherId} is null)`),
  check("receipts_name_check", sql`char_length(trim(${t.receivedFromName})) > 0`),
]);

export const payments = mysqlTable("payments", {
  id: id(),
  voucherNo: varchar("voucher_no", { length: 20 }).notNull(),
  paymentDate: date("payment_date", { mode: "string" }).notNull(),
  paidTo: varchar("paid_to", { length: 120 }).notNull(),
  categoryId: ref("category_id").notNull().references(() => accountCategories.id, { onDelete: "restrict" }),
  eventId: ref("event_id").references(() => events.id, { onDelete: "restrict" }),
  amount: money("amount").notNull(),
  paymentMode: mysqlEnum("payment_mode", PAYMENT_MODES).notNull(),
  referenceNo: varchar("reference_no", { length: 60 }),
  remarks: varchar("remarks", { length: 300 }),
  /** the bill (photo or PDF) in the private Blob store; served only by a role-checked route */
  billPath: varchar("bill_path", { length: 200 }),
  billType: varchar("bill_type", { length: 40 }),
  requestedBy: ref("requested_by").notNull().references(() => profiles.id, { onDelete: "restrict" }),
  approvedBy: ref("approved_by").references(() => profiles.id, { onDelete: "restrict" }),
  approvedAt: utc("approved_at"),
  paidAt: utc("paid_at"),
  status: mysqlEnum("status", ["draft", "approved", "paid", "void"]).notNull().default("draft"),
  voidReason: varchar("void_reason", { length: 300 }),
  ...audit(),
}, (t) => [
  uniqueIndex("payments_no_key").on(t.voucherNo),
  index("payments_date_idx").on(t.paymentDate),
  index("payments_category_idx").on(t.categoryId),
  index("payments_event_idx").on(t.eventId),
  index("payments_status_idx").on(t.status),
  check("payments_amount_check", sql`${t.amount} > 0`),
  check("payments_void_reason_check", sql`${t.status} <> 'void' or char_length(trim(coalesce(${t.voidReason}, ''))) > 0`),
  check("payments_paid_to_check", sql`char_length(trim(${t.paidTo})) > 0`),
]);

/** Cash and bank in hand on a date; the cash book starts from the latest one on or before a period. */
export const openingBalances = mysqlTable("opening_balances", {
  id: id(),
  asOnDate: date("as_on_date", { mode: "string" }).notNull(),
  cash: money("cash").notNull().default("0.00"),
  bank: money("bank").notNull().default("0.00"),
  ...audit(),
}, (t) => [
  uniqueIndex("opening_balances_date_key").on(t.asOnDate),
]);

/** Every void, approval and payment of a voucher, and every void of a receipt. */
export const accountingLog = mysqlTable("accounting_log", {
  id: id(),
  entity: mysqlEnum("entity", ["receipt", "payment"]).notNull(),
  entityId: ref("entity_id").notNull(),
  action: mysqlEnum("action", ["void", "approve", "pay"]).notNull(),
  reason: varchar("reason", { length: 300 }),
  by: ref("by").notNull().references(() => profiles.id, { onDelete: "restrict" }),
  at: createdAt("at"),
}, (t) => [
  index("accounting_log_entity_idx").on(t.entity, t.entityId),
]);
