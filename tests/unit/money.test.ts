import { describe, expect, it } from "vitest";
import { amountInWords, formatMoney, fromCents, numberInWords, sumCents, toCents } from "@/lib/money";
import { amount, charityGridSchema, eventSchema, receiptSchema } from "@/lib/validation/accounts";

const SAR = { code: "SAR", symbol: "SAR" };

describe("money is exact", () => {
  it("parses and prints DECIMAL(12,2) values without floating point", () => {
    expect(toCents("1234.5")).toBe(123450);
    expect(toCents("0.10")).toBe(10);
    expect(toCents(0.3)).toBe(30);
    expect(fromCents(123450)).toBe("1234.50");
    expect(fromCents(-5)).toBe("-0.05");
    // the classic float trap: 0.1 + 0.2
    expect(fromCents(sumCents(["0.10", "0.20"]))).toBe("0.30");
    expect(fromCents(sumCents(Array(1000).fill("0.01")))).toBe("10.00");
  });

  it("refuses anything that isn't an amount with at most 2 decimals", () => {
    for (const bad of ["", "abc", "1.234", "-5", "1e3", "12,50", " . "]) expect(() => toCents(bad)).toThrow();
  });

  it("formats with the school's currency", () => {
    expect(formatMoney(123456789, SAR)).toBe("SAR 1,234,567.89");
    expect(formatMoney(-250, { code: "INR", symbol: "₹" })).toBe("-₹ 2.50");
  });

  it("writes amounts in words", () => {
    expect(numberInWords(0)).toBe("Zero");
    expect(numberInWords(115)).toBe("One Hundred and Fifteen");
    expect(numberInWords(2_000_021)).toBe("Two Million Twenty-One");
    expect(amountInWords(50050, "SAR")).toBe("Saudi Riyals Five Hundred and Halalas Fifty Only");
    expect(amountInWords(100000, "INR")).toBe("Rupees One Thousand Only"); // 100000 paise
    expect(amountInWords(10_000_000, "INR")).toBe("Rupees One Hundred Thousand Only");
  });
});

describe("accounting forms", () => {
  it("an amount: commas allowed, above zero, at most 2 decimals, stored as a DECIMAL string", () => {
    expect(amount().parse("1,250")).toBe("1250.00");
    expect(amount().parse(12.5)).toBe("12.50");
    for (const bad of ["0", "-1", "1.001", "x", "10000000000"]) expect(amount().safeParse(bad).success).toBe(false);
  });

  it("a receipt names the student, the teacher or the payer", () => {
    const base = { receipt_date: "2026-01-05", category_id: "70000000-0000-4000-8000-000000000001", amount: "10", payment_mode: "cash" };
    expect(receiptSchema.safeParse({ ...base, received_from_type: "student" }).success).toBe(false);
    expect(receiptSchema.safeParse({ ...base, received_from_type: "student", student_id: "70000000-0000-4000-8000-000000000002" }).success).toBe(true);
    expect(receiptSchema.safeParse({ ...base, received_from_type: "other" }).success).toBe(false);
    expect(receiptSchema.safeParse({ ...base, received_from_type: "other", received_from_name: "Parish" }).success).toBe(true);
    expect(receiptSchema.safeParse({ ...base, received_from_type: "other", received_from_name: "Parish", receipt_date: "2999-01-01" }).success).toBe(false);
  });

  it("the charity grid skips blanks and rejects bad amounts", () => {
    const g = charityGridSchema.parse({
      receipt_date: "2026-01-05", class_id: "70000000-0000-4000-8000-000000000001",
      students: [{ id: "70000000-0000-4000-8000-000000000002", amount: "" }, { id: "70000000-0000-4000-8000-000000000003", amount: "5" }],
    });
    expect(g.students).toEqual([{ id: "70000000-0000-4000-8000-000000000003", amount: "5.00" }]);
    expect(charityGridSchema.safeParse({
      receipt_date: "2026-01-05", class_id: "70000000-0000-4000-8000-000000000001",
      students: [{ id: "70000000-0000-4000-8000-000000000002", amount: "5.555" }],
    }).success).toBe(false);
  });

  it("an event budget is optional", () => {
    expect(eventSchema.parse({ name: "Annual day", budget: "" }).budget).toBeNull();
    expect(eventSchema.parse({ name: "Annual day", budget: "2,500" }).budget).toBe("2500.00");
  });
});
