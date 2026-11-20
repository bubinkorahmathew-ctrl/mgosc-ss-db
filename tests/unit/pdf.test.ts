/** Renders real PDFs (with Malayalam text) to make sure fonts, the fontkit patch, banner and QR codes work. */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { renderCertificates } from "@/lib/pdf/certificate";
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

  it("renders certificates (incl. revoked) with Malayalam names", async () => {
    const buf = await renderCertificates([
      { id: "1", certificate_no: "CERT-2026-0001", title: "Certificate of Merit",
        body_text: "This certificate is awarded to Sreekutty George of Class 2 for securing Rank 1st in First Term during the academic year 2026-27.",
        student_name: "Sreekutty George", student_name_ml: "ശ്രീക്കുട്ടി ജോർജ്", class_teacher_name: "Mary Thomas", issued_on: "2026-11-18", revoked: false },
      { id: "2", certificate_no: "CERT-2026-0002", title: "Certificate", body_text: "Awarded to സ്നേഹ for memory verse.", student_name: "Sneha",
        student_name_ml: null, class_teacher_name: null, issued_on: "2026-11-18", revoked: true },
    ], { ...branding, banner });
    save("certificates.pdf", buf);
    expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(buf.length).toBeGreaterThan(5000);
  });

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
