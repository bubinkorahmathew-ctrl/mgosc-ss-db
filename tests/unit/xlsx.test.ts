import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { buildXlsx } from "@/lib/xlsx";

describe("buildXlsx", () => {
  it("writes title, headers and rows, Malayalam intact, formulas neutralised", async () => {
    const buf = await buildXlsx([{
      name: "Students", title: "Students report",
      columns: [{ header: "Name", key: "name" }, { header: "Age", key: "age" }],
      rows: [{ name: "അന്ന ജോസഫ്", age: 6 }, { name: "=HYPERLINK(\"http://x\")", age: null }],
    }]);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    const ws = wb.getWorksheet("Students")!;
    expect(ws.getCell("A1").value).toBe("Students report");
    expect(ws.getRow(3).values).toEqual([undefined, "Name", "Age"]);
    expect(ws.getCell("A4").value).toBe("അന്ന ജോസഫ്");
    expect(ws.getCell("B4").value).toBe(6);
    expect(ws.getCell("A5").value).toBe("'=HYPERLINK(\"http://x\")");
  });
});
