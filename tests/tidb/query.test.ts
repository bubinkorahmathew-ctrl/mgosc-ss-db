/** The chainable client used by the pages: every shape they use, and that joins can't leak. */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createQueryClient } from "@/lib/db/query";
import { readSignature, removeSignature, saveSignature } from "@/lib/repo/branding";
import { viewer } from "./viewers";
import { todayISO } from "@/lib/dates";
import { createTiDbTest, IDS, PRAYER_UNIT, type Sandbox, type TiDbTest } from "./harness";

let t: TiDbTest;
let s: Sandbox;
beforeAll(async () => {
  t = await createTiDbTest(async (db) => {
    await db.query("insert into marks (exam_id, student_id, subject_id, marks_obtained) values ?",
      [[[IDS.examC1, IDS.studentC1, IDS.subjectOT, 20], [IDS.examC2, IDS.studentC2, IDS.subjectOT, 30]]]);
    await db.query("insert into activities (class_id, type, title, activity_date) values (?, 'event', 'Picnic', '2026-11-01')", [IDS.class1]);
    await db.query("insert into activities (class_id, student_id, type, title, activity_date) values ?",
      [[[IDS.class1, IDS.studentC1, "note", "Note", "2026-11-02"], [IDS.class2, IDS.studentC2, "note", "Other", "2026-11-03"]]]);
  });
});
afterAll(async () => {
  await t?.destroy();
});
beforeEach(async () => {
  s = await t.sandbox();
});
afterEach(async () => {
  await s?.end();
});
const as = (id: string | null) => createQueryClient(s.as(id));
const head = () => as(IDS.headmaster);
const t1 = () => as(IDS.teacher1);

describe("reads", () => {
  it("to-one, to-many, nested and star", async () => {
    const { data: c } = await head().from("classes")
      .select("id, name, class_teachers(teacher_id, profiles(full_name)), academic_years(name)").order("name");
    expect(c![0]).toEqual({
      id: IDS.class1, name: "Class 1", academic_years: { name: "2026-27" },
      class_teachers: [{ teacher_id: IDS.teacher1, profiles: { full_name: "Mary Thomas" } }],
    });
    const { data: st } = await head().from("students")
      .select("*, classes(id, name, section, academic_years(name))").eq("id", IDS.studentC1).maybeSingle();
    expect(st).toMatchObject({ full_name: "Aaron Mathew", classes: { name: "Class 1", academic_years: { name: "2026-27" } } });
  });
  it("a missing link is null", async () => {
    await s.raw("update students set class_id = null where id = ?", [IDS.studentC1]);
    const { data } = await head().from("students").select("id, classes(name)").eq("id", IDS.studentC1).maybeSingle();
    expect(data!.classes).toBeNull();
  });
  it("!inner with a filter", async () => {
    const run = () => head().from("classes").select("id, academic_years!inner(is_current)").eq("academic_years.is_current", true);
    expect((await run()).data).toHaveLength(3);
    await s.raw("update academic_years set is_current = false");
    expect((await run()).data).toEqual([]);
  });
  it("count embed, exact count, head and pages", async () => {
    const { data } = await head().from("exams").select("id, marks(count)").order("id");
    expect(data!.map((e) => e.marks[0].count)).toEqual([1, 1, 0]);
    const page = await head().from("students").select("id, full_name", { count: "exact" }).order("full_name").range(2, 4);
    expect([page.data!.length, page.count]).toEqual([3, 10]);
    const only = await head().from("students").select("id", { count: "exact", head: true }).eq("class_id", IDS.class1);
    expect([only.data, only.count]).toEqual([null, 3]);
  });
  it("or, nested and inside or", async () => {
    const { data } = await head().from("activities").select("title").or([
      ["student_id", "eq", IDS.studentC1],
      { and: [["student_id", "is", null], ["class_id", "eq", IDS.class1]] },
    ]).order("title");
    expect(data!.map((a) => a.title)).toEqual(["Note", "Picnic"]);
  });
  it("alias with a key hint", async () => {
    await s.raw("update registrations set reviewed_by = ?", [IDS.headmaster]);
    const { data } = await head().from("registrations")
      .select("*, reviewer:profiles!registrations_reviewed_by_fkey(full_name)").limit(1);
    expect(data![0].reviewer!.full_name).toBe("Headmaster (change me)");
  });
});

describe("joins obey the policies", () => {
  it("a teacher's joins show only what the teacher may see", async () => {
    const { data } = await t1().from("activities").select("title, students(full_name, guardian_phone)");
    expect(data!.map((a) => a.title).sort()).toEqual(["Note", "Picnic"]);
    const { data: exams } = await t1().from("exams").select("id, marks(count)");
    expect(exams).toEqual([{ id: IDS.examC1, marks: [{ count: 1 }] }]);
  });
  it("a moved student's details are hidden through a join", async () => {
    await s.raw("update students set class_id = ? where id = ?", [IDS.class2, IDS.studentC1]);
    const { data } = await t1().from("activities").select("title, students(full_name, guardian_phone)").eq("title", "Note");
    expect(data).toEqual([{ title: "Note", students: null }]);
  });
  it("visitors get nothing", async () => {
    expect((await as(null).from("students").select("id, classes(name)")).data).toEqual([]);
  });
});

describe("writes and errors", () => {
  it("insert with select and single", async () => {
    const { data } = await t1().from("students").insert({
      full_name: "Via Client", dob: "2020-01-01", gender: "male", guardian_phone: "9000000000", school_class: "LKG", class_id: IDS.class1,
      prayer_unit_id: PRAYER_UNIT, father_name: "Father", father_phone: "9000000000",
    }).select("id, admission_no").single();
    expect(data!.admission_no).toBe("SS-2026-0011");
  });
  it("upsert, update and delete", async () => {
    // today: within the 14 days a teacher may still write
    const up = await t1().from("attendance").upsert(
      [{ student_id: IDS.studentC1, class_id: IDS.class1, date: todayISO(), status: "late" }], { onConflict: "student_id,date" });
    expect(up.error).toBeNull();
    const upd = await head().from("students").update({ status: "inactive" }).eq("class_id", IDS.class1).in("id", [IDS.studentC1]).select("id");
    expect(upd.data).toEqual([{ id: IDS.studentC1 }]);
    expect((await head().from("attendance").delete().eq("class_id", IDS.class1)).error).toBeNull();
  });
  it("expected failures come back as error", async () => {
    const denied = await t1().from("classes").insert({ name: "Hack", academic_year_id: IDS.year });
    expect(denied.error?.message).toMatch(/row-level security/);
    const dup = await head().from("classes").insert({ name: "Class 1", academic_year_id: IDS.year });
    expect(dup.error?.message).toMatch(/duplicate key/);
    expect((await head().from("students").select("id").eq("id", "junk").maybeSingle()).error).not.toBeNull();
    expect((await head().from("students").select("id").single()).error).not.toBeNull();
  });
  it("an outage is thrown, never an empty list", async () => {
    const broken = createQueryClient({ select: async () => { throw new Error("connection lost"); } } as never);
    await expect(Promise.resolve(broken.from("students").select("id"))).rejects.toThrow("connection lost");
  });
});

describe("signature", () => {
  const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from([0, 255, 39, 92, 63])]);
  it("super admin saves, replaces and removes it", async () => {
    s.use();
    const head = viewer(IDS.headmaster);
    await saveSignature(head, PNG);
    await saveSignature(head, PNG);
    const image = await readSignature(head);
    expect(image!.mime).toBe("image/png");
    expect(Buffer.compare(image!.data, PNG)).toBe(0);
    await removeSignature(head);
    expect(await readSignature(head)).toBeNull();
  });
  it("nobody else, and images only", async () => {
    s.use();
    await expect(saveSignature(viewer(IDS.teacher1, "teacher"), PNG)).rejects.toThrow(/not allowed/);
    // a plain admin (not the super admin) can't either
    await expect(saveSignature(viewer(IDS.headmaster, "admin"), PNG)).rejects.toThrow(/super admin/);
    await expect(saveSignature(viewer(IDS.headmaster), Buffer.from("<svg onload=alert(1)>"))).rejects.toThrow(/PNG or JPG/);
  });
});
