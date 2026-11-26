/**
 * The certificate PDF routes read through the caller's policies with these queries
 * (app/api/certificates/[no]/pdf, app/api/certificates/bulk, app/api/pdf/certificates).
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { readSignature, removeSignature, saveSignature } from "@/lib/repo/branding";
import { createTiDbTest, IDS, type Sandbox, type TiDbTest } from "./harness";
import { viewer } from "./viewers";

let t: TiDbTest;
let s: Sandbox;
beforeAll(async () => { t = await createTiDbTest(); });
afterAll(async () => { await t?.destroy(); });
beforeEach(async () => { s = await t.sandbox(); s.use(); });
afterEach(async () => { await s?.end(); });

const issue = async (student_id: string, class_id: string) => {
  const [c] = await s.as(IDS.headmaster).insert("certificates",
    { student_id, class_id, type: "merit", title: "Certificate of Merit", body_text: "of the class for merit." });
  return c;
};

describe("teachers generate certificate PDFs only for their own class", () => {
  it("by number", async () => {
    const own = await issue(IDS.studentC1, IDS.class1);
    const other = await issue(IDS.studentC2, IDS.class2);
    const byNo = (no: string) => s.as(IDS.teacher1).select("certificates", { where: [["certificate_no", "eq", no]] });
    expect(await byNo(own.certificate_no)).toHaveLength(1);
    expect(await byNo(other.certificate_no)).toEqual([]);
  });

  it("in bulk, by class and type", async () => {
    await issue(IDS.studentC1, IDS.class1);
    await issue(IDS.studentC2, IDS.class2);
    const bulk = (who: string, classId: string) => s.as(who).select("certificates",
      { where: [["class_id", "eq", classId], ["type", "eq", "merit"], ["revoked", "eq", false]] });
    expect(await bulk(IDS.teacher1, IDS.class1)).toHaveLength(1);
    expect(await bulk(IDS.teacher1, IDS.class2)).toEqual([]);
    expect(await bulk(IDS.headmaster, IDS.class2)).toHaveLength(1);
  });

  it("and can still not issue one", async () => {
    await expect(s.as(IDS.teacher1).insert("certificates",
      { student_id: IDS.studentC1, class_id: IDS.class1, type: "merit", title: "x", body_text: "y" })).rejects.toThrow(/row-level security/);
  });
});

describe("Vicar's signature", () => {
  const PNG = Buffer.from("89504e470d0a1a0a0000000d4948445200000001000000010806000000", "hex");

  it("is stored apart from the Headmaster's, by the super admin only", async () => {
    const head = viewer(IDS.headmaster);
    await saveSignature(head, PNG, "vicar");
    expect((await readSignature(head, "vicar"))?.mime).toBe("image/png");
    expect(await readSignature(head, "headmaster")).toBeNull();
    const [settings] = await s.as(IDS.headmaster).select("school_settings");
    expect(settings.vicar_signature_url).toMatch(/^\/api\/branding\/signature\?who=vicar&v=\d+$/);
    expect(settings.signature_url).toBeNull();
    await expect(saveSignature(viewer(IDS.teacher1, "teacher"), PNG, "vicar")).rejects.toThrow(/not allowed/);
    await removeSignature(head, "vicar");
    expect(await readSignature(head, "vicar")).toBeNull();
  });
});
