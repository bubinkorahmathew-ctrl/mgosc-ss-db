import ExcelJS from "exceljs";

/** One cell, reduced to a plain value (formulas give their last calculated result). */
export type Cell = string | number | boolean | Date | null;
export type Sheet = { headers: Cell[]; rows: { row: number; cells: Cell[] }[] };

export const MAX_FILE_BYTES = 900 * 1024; // under the 1 MB server action limit
export const MAX_ROWS = 500;
const MAX_COLUMNS = 80;

/** A problem with the file itself; its message is shown to the user. */
export class SheetError extends Error {}

export function plain(value: unknown): Cell {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value instanceof Date) {
    return value;
  }
  if (typeof value === "object") {
    const o = value as Record<string, unknown>;
    if (Array.isArray(o.richText)) return o.richText.map((r: { text?: unknown }) => String(r.text ?? "")).join("");
    if ("result" in o) return plain(o.result);
    if ("formula" in o || "sharedFormula" in o) return null;
    if (typeof o.text === "string") return o.text; // hyperlink
    if ("error" in o) return String(o.error);
  }
  return null;
}

/** Text of a cell: NFC, single spaces, trimmed. Dates become YYYY-MM-DD. */
export function text(cell: Cell): string {
  if (cell === null) return "";
  if (cell instanceof Date) return isoFromDate(cell) ?? "";
  return String(cell).normalize("NFC").replace(/\s+/g, " ").trim();
}

/** Header text for matching: lower case, without "*", ":" and anything in brackets. */
export function header(cell: Cell): string {
  return text(cell).toLowerCase().replace(/\([^)]*\)/g, "").replace(/[*:]/g, "").replace(/[’‘`]/g, "'")
    .replace(/\s+/g, " ").trim();
}

function iso(y: number, m: number, d: number): string | null {
  if (y < 1900 || y > 2200 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const t = new Date(Date.UTC(y, m - 1, d));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d) return null; // 31/02
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function isoFromDate(date: Date): string | null {
  if (Number.isNaN(date.getTime())) return null;
  // Excel dates are read as UTC midnight
  return iso(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

/**
 * A date written as DD/MM/YYYY (also with - or .), YYYY-MM-DD, an Excel date or a date serial.
 * Returns YYYY-MM-DD, or null when it is not a real date.
 */
export function parseDate(cell: Cell): string | null {
  if (cell instanceof Date) return isoFromDate(cell);
  if (typeof cell === "number") {
    if (!Number.isFinite(cell) || cell < 1 || cell > 120000) return null;
    return isoFromDate(new Date(Date.UTC(1899, 11, 30) + Math.floor(cell) * 86400000));
  }
  const t = text(cell);
  let m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(t);
  if (m) return iso(Number(m[3]), Number(m[2]), Number(m[1]));
  m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  if (m) return iso(Number(m[1]), Number(m[2]), Number(m[3]));
  return null;
}

/** Reads the first worksheet: row 1 is the header, empty rows are skipped. */
export async function readSheet(data: Uint8Array): Promise<Sheet> {
  if (data.byteLength > MAX_FILE_BYTES) throw new SheetError("The file is too large. Upload at most 500 rows at a time.");
  // .xlsx files are zip archives
  if (data.byteLength < 4 || data[0] !== 0x50 || data[1] !== 0x4b || data[2] !== 0x03 || data[3] !== 0x04) {
    throw new SheetError("This is not an Excel file. Use the template and save it as .xlsx.");
  }
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(Buffer.from(data.buffer, data.byteOffset, data.byteLength) as unknown as ExcelJS.Buffer);
  } catch {
    throw new SheetError("This file could not be read. Save it as an Excel workbook (.xlsx) and try again.");
  }
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new SheetError("The file has no sheets.");
  if (sheet.columnCount > MAX_COLUMNS) throw new SheetError(`The sheet has too many columns (at most ${MAX_COLUMNS}).`);

  const width = sheet.columnCount;
  const cellsOf = (r: ExcelJS.Row) => Array.from({ length: width }, (_, i) => plain(r.getCell(i + 1).value));
  const headers = cellsOf(sheet.getRow(1));
  const rows: Sheet["rows"] = [];
  sheet.eachRow({ includeEmpty: false }, (r, rowNumber) => {
    if (rowNumber === 1) return;
    const cells = cellsOf(r);
    if (cells.every((c) => text(c) === "")) return;
    rows.push({ row: rowNumber, cells });
  });
  if (rows.length > MAX_ROWS) throw new SheetError(`The file has ${rows.length} rows. Upload at most ${MAX_ROWS} at a time.`);
  return { headers, rows };
}
