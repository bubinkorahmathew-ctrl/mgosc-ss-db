/**
 * Phase F accounting on a throwaway TiDB database built from db/migrations: numbering under
 * concurrent saves, exact amounts, voids that keep the row, the cash book, and what teachers
 * can and cannot reach.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDrizzle } from "@/db/client";
import { accountCategories, accountingLog, receipts } from "@/db/schema/accounts";
import { eq } from "drizzle-orm";
import { fromCents, sumCents } from "@/lib/money";
import { accountsDashboard, cashBook, eventStatement } from "@/lib/repo/accounting/books";
import { listPayments, savePayment, setPaymentStatus } from "@/lib/repo/accounting/payments";
import { charityGrid, createReceipt, getReceipt, listReceipts, saveCharityGrid, voidReceipt } from "@/lib/repo/accounting/receipts";
import { saveEvent, saveOpeningBalance } from "@/lib/repo/accounting/setup";
import { createTiDbTest, IDS, type TiDbTest } from "./harness";
import { viewer } from "./viewers";

let t: TiDbTest;
let cat: { charity: string; donation: string; stationery: string; printing: string };
const head = viewer(IDS.headmaster);
const teacher1 = viewer(IDS.teacher1, "teacher");

beforeAll(async () => {
  t = await createTiDbTest();
  const rows = await createDrizzle(t.url).select().from(accountCategories);
  const id = (name: string) => rows.find((r) => r.name === name)!.id;
  cat = { charity: id("Charity collection"), donation: id("Donation"), stationery: id("Stationery"), printing: id("Printing") };
});
afterAll(async () => {
  await t?.destroy();
});

const receipt = (date: string, amount: string, extra: Partial<Parameters<typeof createReceipt>[1]> = {}) => createReceipt(head, {
  receipt_date: date, received_from_type: "other", student_id: null, teacher_id: null, received_from_name: "Parish member",
  category_id: cat.donation, event_id: null, amount, payment_mode: "cash", reference_no: null, remarks: null, ...extra,
});
const voucher = (date: string, amount: string, extra: Partial<Parameters<typeof savePayment>[1]> = {}) => savePayment(head, {
  payment_date: date, paid_to: "Book shop", category_id: cat.stationery, event_id: null, amount, payment_mode: "cash",
  reference_no: null, remarks: null, ...extra,
});

describe("numbering", () => {
  it("the starting categories are there", () => {
    expect(Object.values(cat).every(Boolean)).toBe(true);
  });

  it("20 receipts saved at the same moment get RCT-2019-0001 to 0020: no gaps, no duplicates", async () => {
    const saved = await Promise.all(Array.from({ length: 20 }, () => receipt("2019-03-01", "1.00")));
    expect(saved.map((s) => s.receiptNo).sort()).toEqual(Array.from({ length: 20 }, (_, i) => `RCT-2019-${String(i + 1).padStart(4, "0")}`));
  });

  it("10 vouchers saved at the same moment get PAY-2019-0001 to 0010", async () => {
    const saved = await Promise.all(Array.from({ length: 10 }, () => voucher("2019-03-02", "2.00")));
    expect(saved.map((s) => s.voucherNo).sort()).toEqual(Array.from({ length: 10 }, (_, i) => `PAY-2019-${String(i + 1).padStart(4, "0")}`));
  });

  it("each year starts again at 0001", async () => {
    expect((await receipt("2018-12-31", "1.00")).receiptNo).toBe("RCT-2018-0001");
  });
});

describe("amounts and voids", () => {
  it("amounts keep exact precision through the totals", async () => {
    const amounts = ["0.10", "0.20", "0.30", "1234567.89", "0.01"];
    for (const a of amounts) await receipt("2017-05-10", a);
    const book = await cashBook(head, "2017-05-10", "2017-05-10");
    expect(fromCents(book.totalInCents)).toBe(fromCents(sumCents(amounts)));
    expect(fromCents(book.totalInCents)).toBe("1234568.50");
  });

  it("a void keeps the row, records the reason and leaves every total", async () => {
    const r = await receipt("2016-02-02", "50.00");
    await receipt("2016-02-02", "25.00");
    await expect(voidReceipt(head, r.id, "")).rejects.toThrow(); // the database refuses a void without a reason
    await voidReceipt(head, r.id, "entered twice");
    await expect(voidReceipt(head, r.id, "again")).rejects.toThrow(/already void/);
    const db = createDrizzle(t.url);
    const [row] = await db.select().from(receipts).where(eq(receipts.id, r.id));
    expect(row).toMatchObject({ status: "void", voidReason: "entered twice", amount: "50.00" });
    expect(await db.select().from(accountingLog).where(eq(accountingLog.entityId, r.id))).toHaveLength(1);
    expect((await cashBook(head, "2016-02-02", "2016-02-02")).totalInCents).toBe(2500);
  });

  it("rows can't be deleted by the app at all (no delete function exists) and amounts must be positive", async () => {
    const db = createDrizzle(t.url);
    await expect(db.insert(receipts).values({
      receiptNo: "RCT-TEST-0001", receiptDate: "2016-01-01", receivedFromType: "other", receivedFromName: "x", categoryId: cat.donation,
      amount: "-1.00", paymentMode: "cash", collectedBy: IDS.headmaster,
    })).rejects.toThrow();
  });
});

describe("vouchers", () => {
  it("draft -> approved -> paid; only paid vouchers reach the cash book", async () => {
    const v = await voucher("2015-04-04", "40.00");
    await savePayment(head, { id: v.id, payment_date: "2015-04-04", paid_to: "Printer", category_id: cat.printing, event_id: null,
      amount: "45.50", payment_mode: "cash", reference_no: null, remarks: null });
    await expect(setPaymentStatus(head, v.id, "pay")).rejects.toThrow(/Approve the voucher/);
    await setPaymentStatus(head, v.id, "approve");
    await expect(savePayment(head, { id: v.id, payment_date: "2015-04-04", paid_to: "Changed", category_id: cat.printing, event_id: null,
      amount: "1.00", payment_mode: "cash", reference_no: null, remarks: null })).rejects.toThrow(/Only a draft/);
    expect((await cashBook(head, "2015-04-04", "2015-04-04")).totalOutCents).toBe(0);
    await setPaymentStatus(head, v.id, "pay");
    expect((await cashBook(head, "2015-04-04", "2015-04-04")).totalOutCents).toBe(4550);
    await expect(setPaymentStatus(head, v.id, "void")).rejects.toThrow(/reason/);
  });
});

describe("cash book", () => {
  it("opening balance, running balance and closing balance add up; online counts as bank", async () => {
    await saveOpeningBalance(head, { as_on_date: "2014-01-01", cash: "100.00", bank: "1000.00" });
    await receipt("2014-01-05", "20.00");                                 // cash in, before the period
    await receipt("2014-02-01", "30.00");                                 // cash in
    await receipt("2014-02-02", "200.00", { payment_mode: "online" });    // bank in
    const v = await voucher("2014-02-03", "15.25");                       // cash out
    await setPaymentStatus(head, v.id, "approve");
    await setPaymentStatus(head, v.id, "pay");
    await voucher("2014-02-04", "999.00");                                // a draft: not in the books

    const all = await cashBook(head, "2014-02-01", "2014-02-28");
    expect(all.openingCents).toBe(112000);                                // 100 + 1000 + 20
    expect(all.lines.map((l) => l.balanceCents)).toEqual([115000, 135000, 133475]);
    expect(all.closingCents).toBe(all.openingCents + all.totalInCents - all.totalOutCents);
    expect(all.closingCents).toBe(133475);

    const cash = await cashBook(head, "2014-02-01", "2014-02-28", "cash");
    expect([cash.openingCents, cash.closingCents]).toEqual([12000, 13475]);
    const bank = await cashBook(head, "2014-02-01", "2014-02-28", "bank");
    expect([bank.openingCents, bank.closingCents]).toEqual([100000, 120000]);
  });

  it("an event shows budget against actual", async () => {
    const id = await saveEvent(head, { name: "Annual day 2013", event_date: "2013-11-01", budget: "500.00", status: "ongoing", notes: null });
    await receipt("2013-11-01", "120.00", { event_id: id });
    const v = await voucher("2013-11-01", "80.00", { event_id: id });
    await setPaymentStatus(head, v.id, "approve");
    await setPaymentStatus(head, v.id, "pay");
    const st = await eventStatement(head, id);
    expect(st).toMatchObject({ incomeCents: 12000, expenseCents: 8000, balanceCents: 4000, budgetCents: 50000 });
  });
});

describe("charity collection", () => {
  it("one receipt per filled box, with the student's class kept on the receipt", async () => {
    const saved = await saveCharityGrid(head, {
      receipt_date: "2012-06-01", class_id: IDS.class1, payment_mode: "cash",
      students: [{ id: IDS.studentC1, amount: "5.00" }], teachers: [{ id: IDS.teacher1, amount: "10.00" }],
    });
    expect(saved).toHaveLength(2);
    const rows = await listReceipts(head, { from: "2012-06-01", to: "2012-06-01" });
    expect(rows.find((r) => r.name)!.category).toBe("Charity collection");
    expect(rows.filter((r) => r.type === "student").every((r) => r.className)).toBe(true);
  });

  it("is all or nothing: a student from another class cancels the whole save", async () => {
    await expect(saveCharityGrid(head, {
      receipt_date: "2012-06-02", class_id: IDS.class1, payment_mode: "cash",
      students: [{ id: IDS.studentC1, amount: "5.00" }, { id: IDS.studentC2, amount: "5.00" }], teachers: [],
    })).rejects.toThrow(/not in this class/);
    expect(await listReceipts(head, { from: "2012-06-02", to: "2012-06-02" })).toEqual([]);
  });
});

describe("teachers", () => {
  it("enter charity for their own class and themselves, and see only their own entries", async () => {
    await saveCharityGrid(teacher1, {
      receipt_date: "2011-09-01", class_id: IDS.class1, payment_mode: "cash",
      students: [{ id: IDS.studentC1, amount: "3.00" }], teachers: [{ id: IDS.teacher1, amount: "7.00" }],
    });
    const mine = await listReceipts(teacher1);
    expect(mine.length).toBeGreaterThanOrEqual(2);
    expect(mine.every((r) => r.category === "Charity collection")).toBe(true);
    // the admin's receipts (donations, earlier charity) are not among them
    expect(mine.some((r) => r.name === "Parish member")).toBe(false);
    const adminOnes = await listReceipts(head, { from: "2012-06-01", to: "2012-06-01" });
    expect(await getReceipt(teacher1, adminOnes[0].id)).toBeNull();
    expect(await getReceipt(teacher1, mine[0].id)).not.toBeNull();
  });

  it("can't enter for another class, another teacher, or a student of another class", async () => {
    await expect(charityGrid(teacher1, IDS.class2, "2011-09-01")).rejects.toThrow(/not assigned/);
    await expect(saveCharityGrid(teacher1, {
      receipt_date: "2011-09-02", class_id: IDS.class2, payment_mode: "cash", students: [{ id: IDS.studentC2, amount: "1.00" }], teachers: [],
    })).rejects.toThrow(/not assigned/);
    await expect(saveCharityGrid(teacher1, {
      receipt_date: "2011-09-02", class_id: IDS.class1, payment_mode: "cash", students: [], teachers: [{ id: IDS.teacher2, amount: "1.00" }],
    })).rejects.toThrow(/only your own/);
    await expect(saveCharityGrid(teacher1, {
      receipt_date: "2011-09-02", class_id: IDS.class1, payment_mode: "cash", students: [{ id: IDS.studentC2, amount: "1.00" }], teachers: [],
    })).rejects.toThrow(/not in this class/);
  });

  it("can't read the cash book, vouchers, events, the dashboard or make other receipts", async () => {
    await expect(cashBook(teacher1, "2011-01-01", "2030-01-01")).rejects.toThrow(/not allowed/);
    await expect(listPayments(teacher1)).rejects.toThrow(/not allowed/);
    await expect(accountsDashboard(teacher1, "2011-01-01", "2030-01-01", "2026-01-01", "2026-01-31")).rejects.toThrow(/not allowed/);
    await expect(createReceipt(teacher1, {
      receipt_date: "2011-01-01", received_from_type: "other", student_id: null, teacher_id: null, received_from_name: "x",
      category_id: cat.donation, event_id: null, amount: "1.00", payment_mode: "cash", reference_no: null, remarks: null,
    })).rejects.toThrow(/not allowed/);
    await expect(savePayment(teacher1, {
      payment_date: "2011-01-01", paid_to: "x", category_id: cat.stationery, event_id: null, amount: "1.00",
      payment_mode: "cash", reference_no: null, remarks: null,
    })).rejects.toThrow(/not allowed/);
  });

  it("OVBS staff and visitors get nothing", async () => {
    const ovbs = viewer("33333333-3333-4333-8333-333333333333", "ovbs_teacher", false);
    await expect(listReceipts(ovbs)).rejects.toThrow(/not allowed/);
    await expect(charityGrid(ovbs, IDS.class1, "2011-09-01")).rejects.toThrow(/not allowed/);
    await expect(listReceipts(null as never)).rejects.toThrow(/sign in/);
  });
});
