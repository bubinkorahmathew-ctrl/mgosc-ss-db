import "server-only";
import type { z } from "zod";
import { and, desc, eq, gte, inArray, like, lte, or, type SQL } from "drizzle-orm";
import { formatNumber, reserveNumbers } from "@/db/numbers";
import { classTeachers, classes, profiles, students } from "@/db/schema";
import { accountCategories, events, receipts } from "@/db/schema/accounts";
import { AuthError } from "@/lib/auth";
import { uuidv7 } from "@/lib/ids";
import { UserError } from "@/lib/user-error";
import type { charityGridSchema, receiptSchema } from "@/lib/validation/accounts";
import { assertTeacherOfClass, requireRole, type Viewer } from "../access";
import { db, isAdmin, logAction, numberYear, requireAdmin, type Tx } from "./shared";

export const CHARITY_CATEGORY = "Charity collection";

type NewReceipt = {
  receiptDate: string; receivedFromType: "student" | "teacher" | "other";
  studentId: string | null; teacherId: string | null; receivedFromName: string; classId: string | null;
  categoryId: string; eventId: string | null; amount: string; paymentMode: "cash" | "bank" | "online";
  referenceNo: string | null; remarks: string | null;
};

/** Numbers and saves receipts in the caller's transaction: all or none, numbers gap-free per year. */
async function insertReceipts(tx: Tx, user: Viewer, rows: NewReceipt[]) {
  const byYear = new Map<number, NewReceipt[]>();
  for (const r of rows) byYear.set(numberYear(r.receiptDate), [...(byYear.get(numberYear(r.receiptDate)) ?? []), r]);
  const saved: { id: string; receiptNo: string }[] = [];
  for (const [year, list] of byYear) {
    const first = await reserveNumbers(tx, "receipt", year, list.length);
    const values = list.map((r, i) => ({
      ...r, id: uuidv7(), receiptNo: formatNumber("receipt", year, first + i), collectedBy: user.id, createdBy: user.id, updatedBy: user.id,
    }));
    await tx.insert(receipts).values(values);
    saved.push(...values.map((v) => ({ id: v.id, receiptNo: v.receiptNo })));
  }
  return saved;
}

/** An active category of this type, or a friendly error. */
async function activeCategory(tx: Tx, id: string, type: "income" | "expense") {
  const [c] = await tx.select().from(accountCategories).where(eq(accountCategories.id, id));
  if (!c || c.type !== type || !c.active) throw new UserError("Choose a category from the list.", { category_id: ["Choose a category."] });
  return c;
}

async function charityCategoryId(tx: Tx) {
  const [c] = await tx.select({ id: accountCategories.id }).from(accountCategories)
    .where(and(eq(accountCategories.type, "income"), eq(accountCategories.name, CHARITY_CATEGORY), eq(accountCategories.active, true)));
  if (!c) throw new UserError(`The category “${CHARITY_CATEGORY}” is missing or switched off (Accounts → Settings).`);
  return c.id;
}

/** Any receipt. Admins only (teachers use the charity grid). */
export async function createReceipt(user: Viewer, input: z.output<typeof receiptSchema>) {
  requireAdmin(user);
  return db().transaction(async (tx) => {
    await activeCategory(tx, input.category_id, "income");
    if (input.event_id) {
      const [e] = await tx.select({ id: events.id }).from(events).where(eq(events.id, input.event_id));
      if (!e) throw new UserError("Choose an event from the list.");
    }
    let name = input.received_from_name ?? "";
    let classId: string | null = null;
    if (input.received_from_type === "student") {
      const [s] = await tx.select({ name: students.fullName, classId: students.classId }).from(students).where(eq(students.id, input.student_id!));
      if (!s) throw new UserError("Choose the student from the list.");
      name = s.name;
      classId = s.classId;
    } else if (input.received_from_type === "teacher") {
      const [t] = await tx.select({ name: profiles.fullName }).from(profiles)
        .where(and(eq(profiles.id, input.teacher_id!), inArray(profiles.role, ["teacher", "headmaster"])));
      if (!t) throw new UserError("Choose the teacher from the list.");
      name = t.name;
    }
    const [saved] = await insertReceipts(tx, user, [{
      receiptDate: input.receipt_date, receivedFromType: input.received_from_type,
      studentId: input.received_from_type === "student" ? input.student_id : null,
      teacherId: input.received_from_type === "teacher" ? input.teacher_id : null,
      receivedFromName: name, classId, categoryId: input.category_id, eventId: input.event_id,
      amount: input.amount, paymentMode: input.payment_mode, referenceNo: input.reference_no, remarks: input.remarks,
    }]);
    return saved;
  });
}

/** Void with a reason (the row stays, the void is logged). Admins only. */
export async function voidReceipt(user: Viewer, id: string, reason: string) {
  requireAdmin(user);
  await db().transaction(async (tx) => {
    const [r] = await tx.select({ status: receipts.status }).from(receipts).where(eq(receipts.id, id)).for("update");
    if (!r) throw new UserError("Receipt not found.");
    if (r.status === "void") throw new UserError("This receipt is already void.");
    await tx.update(receipts).set({ status: "void", voidReason: reason, updatedBy: user.id, updatedAt: new Date() }).where(eq(receipts.id, id));
    await logAction(tx, "receipt", id, "void", user.id, reason);
  });
}

// ---------------------------------------------------------------------------
// Charity collection (admins: any class; teachers: their own class and themselves)
// ---------------------------------------------------------------------------

/** Who can be entered on the grid for a class, and what was already received that day. */
export async function charityGrid(user: Viewer, classId: string, date: string) {
  requireRole(user, "headmaster", "teacher");
  await assertTeacherOfClass(user, classId);
  const d = db();
  const [cls] = await d.select({ name: classes.name, section: classes.section }).from(classes).where(eq(classes.id, classId));
  if (!cls) throw new AuthError("That class is not available to you.");
  const [list, teachers, already] = await Promise.all([
    d.select({ id: students.id, name: students.fullName, admissionNo: students.admissionNo }).from(students)
      .where(and(eq(students.classId, classId), eq(students.status, "active"))).orderBy(students.fullName),
    isAdmin(user)
      ? d.select({ id: profiles.id, name: profiles.fullName }).from(classTeachers)
        .innerJoin(profiles, eq(profiles.id, classTeachers.teacherId))
        .where(and(eq(classTeachers.classId, classId), eq(profiles.active, true))).orderBy(profiles.fullName)
      : Promise.resolve([{ id: user.id, name: user.profile.full_name }]),
    d.select({ id: receipts.id, receiptNo: receipts.receiptNo, name: receipts.receivedFromName, amount: receipts.amount })
      .from(receipts).innerJoin(accountCategories, eq(accountCategories.id, receipts.categoryId))
      .where(and(eq(receipts.classId, classId), eq(receipts.receiptDate, date), eq(receipts.status, "active"),
        eq(accountCategories.name, CHARITY_CATEGORY),
        ...(isAdmin(user) ? [] : [eq(receipts.collectedBy, user.id)])))
      .orderBy(receipts.receiptNo),
  ]);
  return { className: cls.section ? `${cls.name} - ${cls.section}` : cls.name, students: list, teachers, already };
}

/** One receipt per non-empty amount, under "Charity collection", in one transaction. */
export async function saveCharityGrid(user: Viewer, input: z.output<typeof charityGridSchema>) {
  requireRole(user, "headmaster", "teacher");
  await assertTeacherOfClass(user, input.class_id);
  if (!input.students.length && !input.teachers.length) throw new UserError("Enter at least one amount.");
  if (!isAdmin(user) && input.teachers.some((t) => t.id !== user.id)) throw new AuthError("You can enter only your own contribution.");

  return db().transaction(async (tx) => {
    const categoryId = await charityCategoryId(tx);
    const studentIds = input.students.map((s) => s.id);
    const found = studentIds.length
      ? await tx.select({ id: students.id, name: students.fullName }).from(students)
        .where(and(inArray(students.id, studentIds), eq(students.classId, input.class_id), eq(students.status, "active"))).for("update")
      : [];
    if (found.length !== new Set(studentIds).size) throw new AuthError("Some students are not in this class.");
    const teacherIds = input.teachers.map((t) => t.id);
    const allowedTeachers = !teacherIds.length ? [] : isAdmin(user)
      ? await tx.select({ id: profiles.id, name: profiles.fullName }).from(classTeachers)
        .innerJoin(profiles, eq(profiles.id, classTeachers.teacherId))
        .where(and(eq(classTeachers.classId, input.class_id), inArray(profiles.id, teacherIds)))
      : [{ id: user.id, name: user.profile.full_name }];
    if (allowedTeachers.length !== new Set(teacherIds).size) throw new AuthError("Some teachers are not teachers of this class.");

    const name = new Map([...found, ...allowedTeachers].map((p) => [p.id, p.name]));
    const base = { receiptDate: input.receipt_date, classId: input.class_id, categoryId, eventId: null, paymentMode: input.payment_mode,
      referenceNo: null, remarks: null };
    return insertReceipts(tx, user, [
      ...input.students.map((s) => ({ ...base, receivedFromType: "student" as const, studentId: s.id, teacherId: null, receivedFromName: name.get(s.id)!, amount: s.amount })),
      ...input.teachers.map((t) => ({ ...base, receivedFromType: "teacher" as const, studentId: null, teacherId: t.id, receivedFromName: name.get(t.id)!, amount: t.amount })),
    ]);
  });
}

// ---------------------------------------------------------------------------
// Lists
// ---------------------------------------------------------------------------

export type ReceiptFilters = {
  from?: string; to?: string; categoryId?: string; classId?: string; eventId?: string;
  mode?: "cash" | "bank" | "online"; status?: "active" | "void"; q?: string; studentId?: string; teacherId?: string;
};

/** Receipts with filters, newest first. Admins see all; teachers only what they collected (charity). */
export async function listReceipts(user: Viewer, f: ReceiptFilters = {}, limit = 500) {
  requireRole(user, "headmaster", "teacher");
  const where: SQL[] = [];
  if (!isAdmin(user)) where.push(eq(receipts.collectedBy, user.id));
  if (f.from) where.push(gte(receipts.receiptDate, f.from));
  if (f.to) where.push(lte(receipts.receiptDate, f.to));
  if (f.categoryId) where.push(eq(receipts.categoryId, f.categoryId));
  if (f.classId) where.push(eq(receipts.classId, f.classId));
  if (f.eventId) where.push(eq(receipts.eventId, f.eventId));
  if (f.mode) where.push(eq(receipts.paymentMode, f.mode));
  if (f.status) where.push(eq(receipts.status, f.status));
  if (f.studentId) where.push(eq(receipts.studentId, f.studentId));
  if (f.teacherId) where.push(eq(receipts.teacherId, f.teacherId));
  if (f.q) {
    const q = `%${f.q.replace(/[%_\\]/g, "\\$&")}%`;
    where.push(or(like(receipts.receivedFromName, q), like(receipts.receiptNo, q))!);
  }
  return db().select({
    id: receipts.id, receiptNo: receipts.receiptNo, receiptDate: receipts.receiptDate, name: receipts.receivedFromName,
    type: receipts.receivedFromType, amount: receipts.amount, mode: receipts.paymentMode, status: receipts.status,
    voidReason: receipts.voidReason, category: accountCategories.name, event: events.name,
    className: classes.name, classSection: classes.section, referenceNo: receipts.referenceNo, remarks: receipts.remarks,
  }).from(receipts)
    .innerJoin(accountCategories, eq(accountCategories.id, receipts.categoryId))
    .leftJoin(events, eq(events.id, receipts.eventId))
    .leftJoin(classes, eq(classes.id, receipts.classId))
    .where(and(...where))
    .orderBy(desc(receipts.receiptDate), desc(receipts.receiptNo))
    .limit(limit);
}

/** One receipt for its PDF: admins any; teachers only one they collected. */
export async function getReceipt(user: Viewer, id: string) {
  requireRole(user, "headmaster", "teacher");
  const [r] = await db().select({
    id: receipts.id, receiptNo: receipts.receiptNo, receiptDate: receipts.receiptDate, name: receipts.receivedFromName,
    type: receipts.receivedFromType, amount: receipts.amount, mode: receipts.paymentMode, referenceNo: receipts.referenceNo,
    remarks: receipts.remarks, status: receipts.status, voidReason: receipts.voidReason, category: accountCategories.name,
    event: events.name, className: classes.name, classSection: classes.section, collectedBy: receipts.collectedBy,
    collectorName: profiles.fullName,
  }).from(receipts)
    .innerJoin(accountCategories, eq(accountCategories.id, receipts.categoryId))
    .innerJoin(profiles, eq(profiles.id, receipts.collectedBy))
    .leftJoin(events, eq(events.id, receipts.eventId))
    .leftJoin(classes, eq(classes.id, receipts.classId))
    .where(eq(receipts.id, id));
  if (!r || (!isAdmin(user) && r.collectedBy !== user.id)) return null;
  return r;
}

/** For the receipt form's pickers: active students (with class) and active teachers and admins. Admins only. */
export async function payerOptions(user: Viewer) {
  requireAdmin(user);
  const d = db();
  const [studentRows, teacherRows] = await Promise.all([
    d.select({ id: students.id, name: students.fullName, admissionNo: students.admissionNo, className: classes.name, section: classes.section })
      .from(students).leftJoin(classes, eq(classes.id, students.classId))
      .where(eq(students.status, "active")).orderBy(students.fullName),
    d.select({ id: profiles.id, name: profiles.fullName }).from(profiles)
      .where(and(eq(profiles.active, true), inArray(profiles.role, ["teacher", "headmaster"]))).orderBy(profiles.fullName),
  ]);
  return {
    students: studentRows.map((s) => ({
      id: s.id, label: `${s.name} · ${s.admissionNo}${s.className ? ` · ${s.section ? `${s.className} - ${s.section}` : s.className}` : ""}`,
    })),
    teachers: teacherRows.map((t) => ({ id: t.id, label: t.name })),
  };
}