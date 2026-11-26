/**
 * Money, exactly. Amounts are DECIMAL(12,2) in the database and arrive as strings ("1234.50");
 * all arithmetic is done in whole minor units (halalas, paise) as integers, never floats.
 */

export type Currency = { code: string; symbol: string };

/** Largest amount a DECIMAL(12,2) column holds, in minor units. */
export const MAX_CENTS = 9_999_999_999_99;

// up to 13 whole digits: one amount is at most 10 (DECIMAL(12,2)), but sums of many can be longer
const AMOUNT = /^(\d{1,13})(?:\.(\d{1,2}))?$/;

/** "1234.5" / "1234.50" / 1234.5 -> 123450. Throws on anything else (negative, 3 decimals, text). */
export function toCents(value: string | number): number {
  const text = typeof value === "number" ? value.toFixed(2) : value.trim();
  const m = AMOUNT.exec(text);
  if (!m) throw new Error(`invalid amount: ${value}`);
  return Number(m[1]) * 100 + Number((m[2] ?? "0").padEnd(2, "0"));
}

/** 123450 -> "1234.50" (what the database stores). Negative allowed (balances). */
export function fromCents(cents: number): string {
  if (!Number.isSafeInteger(cents)) throw new Error("amount out of range");
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/** Sum of DECIMAL strings, exact. */
export const sumCents = (values: (string | number)[]) => values.reduce<number>((s, v) => s + toCents(v), 0);

/** "SAR 1,234.50" (negative: "-SAR 1,234.50"). */
export function formatMoney(cents: number, currency: Currency): string {
  const [whole, minor] = fromCents(Math.abs(cents)).split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${cents < 0 ? "-" : ""}${currency.symbol} ${grouped}.${minor}`;
}

/** Words for the main and minor unit of a currency. */
const UNITS: Record<string, [string, string]> = {
  SAR: ["Saudi Riyals", "Halalas"],
  INR: ["Rupees", "Paise"],
  AED: ["Dirhams", "Fils"],
  USD: ["Dollars", "Cents"],
};

const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve",
  "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function below1000(n: number): string {
  const parts: string[] = [];
  if (n >= 100) parts.push(`${ONES[Math.floor(n / 100)]} Hundred`);
  const r = n % 100;
  if (r) {
    if (parts.length) parts.push("and");
    parts.push(r < 20 ? ONES[r] : `${TENS[Math.floor(r / 10)]}${r % 10 ? `-${ONES[r % 10]}` : ""}`);
  }
  return parts.join(" ");
}

/** Whole number in words (international system: thousand, million, billion). */
export function numberInWords(n: number): string {
  if (!Number.isSafeInteger(n) || n < 0) throw new Error("invalid number");
  if (n === 0) return "Zero";
  const scales: [number, string][] = [[1e9, "Billion"], [1e6, "Million"], [1e3, "Thousand"]];
  const parts: string[] = [];
  let rest = n;
  for (const [size, name] of scales) {
    if (rest >= size) {
      parts.push(`${below1000(Math.floor(rest / size))} ${name}`);
      rest %= size;
    }
  }
  if (rest) parts.push(below1000(rest));
  return parts.join(" ");
}

/** "Saudi Riyals Five Hundred and Halalas Fifty Only" */
export function amountInWords(cents: number, code: string): string {
  const [major, minor] = UNITS[code.toUpperCase()] ?? [code.toUpperCase(), "Cents"];
  const whole = Math.floor(Math.abs(cents) / 100);
  const fraction = Math.abs(cents) % 100;
  const text = `${major} ${numberInWords(whole)}${fraction ? ` and ${minor} ${numberInWords(fraction)}` : ""}`;
  return `${text} Only`;
}
