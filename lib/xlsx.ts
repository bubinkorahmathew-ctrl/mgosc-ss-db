import "server-only";
import ExcelJS from "exceljs";

export type XlsxColumn = { header: string; key: string; width?: number };
export type XlsxSheet = { name: string; title?: string; columns: XlsxColumn[]; rows: Record<string, unknown>[] };

/** Neutralise spreadsheet formula injection (=, +, -, @ at the start of text). */
function safeCell(v: unknown) {
  if (typeof v === "string" && /^[=+\-@\t\r]/.test(v)) return `'${v}`;
  return v ?? "";
}

export async function buildXlsx(sheets: XlsxSheet[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.created = new Date();
  for (const sh of sheets) {
    const ws = wb.addWorksheet(sh.name.slice(0, 31).replace(/[\\/?*[\]:]/g, " "));
    let headerRow = 1;
    if (sh.title) {
      ws.addRow([sh.title]).font = { bold: true, size: 13 };
      ws.addRow([]);
      headerRow = 3;
    }
    ws.addRow(sh.columns.map((c) => c.header)).font = { bold: true };
    ws.getRow(headerRow).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFF6FF" } };
    sh.columns.forEach((c, i) => { ws.getColumn(i + 1).width = c.width ?? Math.max(12, c.header.length + 2); });
    for (const r of sh.rows) ws.addRow(sh.columns.map((c) => safeCell(r[c.key])));
    ws.views = [{ state: "frozen", ySplit: headerRow }];
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export function xlsxResponse(buf: Buffer, filename: string) {
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename.replace(/[^\w.-]+/g, "_")}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
