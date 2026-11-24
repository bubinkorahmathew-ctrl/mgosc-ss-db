/** Renders real PDFs (with Malayalam text) to make sure fonts, the fontkit patch, banner and QR codes work. */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { renderCertificates } from "@/lib/pdf/certificate";
import type { PdfCertificate } from "@/lib/data/certificates";
import { renderReportCards } from "@/lib/pdf/report-card";
import { loadBanner } from "@/lib/pdf/images";
import { computeResults } from "@/lib/results";

/** set PDF_OUT=<dir> to save the sample PDFs for a visual check */
const save = (name: string, buf: Buffer) => {
  if (process.env.PDF_OUT) fs.writeFileSync(path.join(process.env.PDF_OUT, name), buf);
};

const branding = { schoolName: "MGOSC Sunday School", address: "Kottayam", headmasterName: "Fr. Thomas", logo: null, signature: null };

describe("PDF rendering", () => {
  let banner: Awaited<ReturnType<typeof loadBanner>> = null;
  it("loads the bundled banner", async () => {
    banner = await loadBanner();
    expect(banner?.format).toBe("jpg");
  });

  // certificates: the template design, without a database (signatories and details given)
  const signatories = { vicar: { name: "Rev. Fr. Mathew Joseph" }, headmaster: { name: "Thomas Varghese" } };
  const cert = (n: number, over: Partial<PdfCertificate> = {}): PdfCertificate => ({
    key: `k${n}`, certificate_no: `CERT-2026-${String(n).padStart(4, "0")}`, type: "merit", title: "Certificate of Merit",
    body_text: "of Class 6 for securing Rank 1st in the Annual Examination during the academic year 2026-27.",
    student_name: "Jerin Mathew Varghese", student_name_ml: null, class_name: "Class 6", year_name: "2026-27",
    issued_on: "2026-11-24", revoked: false, student_id: "s", class_id: "c", exam_id: null, academic_year_id: "y", ...over,
  });
  const pages = (buf: Buffer) => (buf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;
  const render = (certs: PdfCertificate[], details = new Map<string, { label: string; value: string }[]>()) =>
    renderCertificates(certs, { signatories, details });

  it("renders one certificate of each type, with its theme and subtitle", async () => {
    const types = ["merit", "completion", "participation", "memory_verse", "attendance", "custom", "class_topper", "attendance_topper"] as const;
    const certs = types.map((type, i) => cert(i + 1, { type: type as PdfCertificate["type"], title: type === "custom" ? "Certificate of Appreciation" : "x" }));
    const details = new Map(certs.map((c) => [c.key, [
      { label: "Class", value: "Class 6" }, { label: "Academic Year", value: "2026-27" },
      ...(c.type === "merit" ? [{ label: "Rank", value: "1" }, { label: "Percentage", value: "96.4%" }] : []),
      ...(c.type.startsWith("attendance") ? [{ label: "Attendance", value: "100%" }] : []),
    ]]));
    const buf = await render(certs, details);
    save("certificate-types.pdf", buf);
    expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pages(buf)).toBe(types.length);
  });

  it("prints the Malayalam name, a 35-character name and the revoked stamp", async () => {
    const long = "Christopher Abraham Mathew Kuriakos";
    expect(long).toHaveLength(35);
    const buf = await render([
      cert(1, { student_name: "Christo Thomas", student_name_ml: "ക്രിസ്റ്റോ തോമസ്", type: "attendance" }),
      cert(2, { student_name: long, student_name_ml: "ക്രിസ്റ്റഫർ എബ്രഹാം മാത്യു കുര്യാക്കോസ്" }),
      cert(3, { revoked: true }),
    ]);
    save("certificate-names.pdf", buf);
    expect(pages(buf)).toBe(3);
  });

  it("puts a class of 30 into one PDF, one certificate per page", async () => {
    const buf = await render(Array.from({ length: 30 }, (_, i) => cert(i + 1, { student_name: `Student Number ${i + 1}` })));
    save("certificates-bulk-30.pdf", buf);
    expect(pages(buf)).toBe(30);
  }, 60_000);

  it("renders report cards", async () => {
    const subjects = [{ id: "a", name: "Old Testament", max: 50 }, { id: "b", name: "Memory Verse", max: 25 }];
    const results = computeResults(
      [{ id: "s1", name: "Aaron Mathew", nameMl: "ആരോൺ മാത്യു", admissionNo: "SS-2026-0001" },
       { id: "s2", name: "Anna Joseph", nameMl: null, admissionNo: "SS-2026-0002" }],
      subjects, [{ student_id: "s1", subject_id: "a", marks_obtained: 42 }]);
    const buf = await renderReportCards({
      exam: { id: "e", name: "First Term", exam_date: "2026-10-04", class_id: "c", academic_year_id: "y" },
      className: "Class 1", yearName: "2026-27", subjects, results,
      attendance: { s1: { present: 10, late: 1, absent: 2, days: 13 } },
    }, null, { ...branding, banner, classTeacherName: "Mary Thomas" });
    save("report-cards.pdf", buf);
    expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
  });
});
