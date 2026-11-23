/** Risks that only exist because the rules now live in the app: injection, races, missing CHECKs. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPool } from "@/lib/db/connection";
import { COLUMNS, type TableName } from "@/lib/db/schema";
import { registrationAttempts } from "@/lib/db/system";
import { createTiDbTest, IDS, type TiDbTest } from "./harness";

let t: TiDbTest;
beforeAll(async () => {
  t = await createTiDbTest();
});
afterAll(async () => {
  await t?.destroy();
});

describe("configuration", () => {
  it("refuses system schemas", () => {
    expect(() => createPool({ host: "x", port: 4000, user: "x", password: "x", database: "sys" })).toThrow(/system schema/);
  });

  it("uses TLS 1.2 or later", async () => {
    const [row] = await t.database.query<{ Value: string }>("show session status like 'Ssl_version'");
    expect(["TLSv1.2", "TLSv1.3"]).toContain(row.Value);
  });

  it("the column whitelist matches the real schema", async () => {
    const rows = await t.database.query<{ t: string; c: string; n: string }>(
      "select table_name as t, column_name as c, is_nullable as n from information_schema.columns where table_schema = ?", [t.name]);
    for (const table of Object.keys(COLUMNS) as TableName[]) {
      const real = rows.filter((r) => r.t === table && !["current_key", "section_key", "is_super"].includes(r.c));
      const listed = Object.entries(COLUMNS[table]).map(([c, kind]) =>
        `${c}:${typeof kind === "string" && kind.endsWith("?") ? "YES" : "NO"}`);
      expect(listed.sort()).toEqual(real.map((r) => `${r.c}:${r.n}`).sort());
    }
  });
});

describe("hostile input", () => {
  const t1 = () => t.as(IDS.teacher1);

  it("an or filter cannot widen a teacher's view", async () => {
    const rows = await t1().select("students", { where: [{ or: [["full_name", "ilike", "%"], ["class_id", "eq", IDS.class3]] }] });
    expect(rows).toHaveLength(3);
  });
  it("quotes and backslashes are data", async () => {
    for (const value of ["' or '1'='1", "\\' or 1=1 -- ", "x`; drop table students; -- ", "?) or (1=1"]) {
      expect(await t1().select("students", { where: [["full_name", "eq", value]] })).toEqual([]);
    }
  });
  it("unknown tables, columns and operators never reach SQL", async () => {
    await expect(t1().select("students t -- " as TableName)).rejects.toThrow(/unknown table/);
    await expect(t1().select("__proto__" as TableName)).rejects.toThrow(/unknown table/);
    await expect(t1().select("students", { where: [["id` = id or `id", "eq", "x"]] })).rejects.toThrow(/unknown column/);
    await expect(t1().select("students", { order: [{ column: "constructor" }] })).rejects.toThrow(/unknown column/);
    await expect(t1().select("students", { where: [["full_name", "= '' or 1=1 --" as "eq", "x"]] })).rejects.toThrow(/unsupported/);
    await expect(t1().select("students", { limit: "1; drop" as unknown as number })).rejects.toThrow(/invalid page/);
  });
  it("objects cannot become SQL", async () => {
    await expect(t1().select("students", { where: [["full_name", "eq", { full_name: 1 }]] })).rejects.toThrow(/invalid value/);
    await expect(t1().select("students", { where: [["id", "eq", { toString: () => IDS.studentC3 }]] })).rejects.toThrow(/invalid id/);
  });
  it("padded ids and numeric enum indexes are rejected", async () => {
    await expect(t1().select("students", { where: [["id", "eq", `${IDS.studentC1} `]] })).rejects.toThrow(/invalid id/);
    await expect(t.as(IDS.headmaster).update("profiles", { role: "1" as "teacher" }, [["id", "eq", IDS.teacher1]]))
      .rejects.toThrow(/invalid value/);
  });
  it("impossible dates and NaN are rejected", async () => {
    await expect(t.as(IDS.headmaster).update("students", { dob: "2020-02-30" }, [["id", "eq", IDS.studentC1]])).rejects.toThrow(/invalid value/);
    await expect(t1().upsert("marks", {
      exam_id: IDS.examC1, student_id: IDS.studentC1, subject_id: IDS.subjectOT, marks_obtained: NaN,
    })).rejects.toThrow(/invalid value/);
  });
  it("an unfiltered update or delete is refused", async () => {
    await expect(t.as(IDS.headmaster).delete("students", [])).rejects.toThrow(/needs a filter/);
    await expect(t.as(IDS.headmaster).update("students", { status: "inactive" }, [])).rejects.toThrow(/needs a filter/);
  });
  it("one bad row rejects the whole batch", async () => {
    const day = "2026-10-11";
    await expect(t1().upsert("attendance", [
      { student_id: IDS.studentC1, class_id: IDS.class1, date: day, status: "present" },
      { student_id: IDS.studentC2, class_id: IDS.class1, date: day, status: "present" },
    ])).rejects.toThrow(/row-level security/);
    expect(await t.as(IDS.headmaster).count("attendance", [["date", "eq", day]])).toBe(0);
  });
});

describe("prayer group and baptism name", () => {
  it("survive registration and approval, and the student's teacher can read them", async () => {
    const group = "സെന്റ് തോമസ് Prayer Group";
    await t.as(null).insert("registrations", {
      full_name: "Group Child", dob: "2020-01-01", gender: "male", guardian_phone: "9000000000",
      school_class: "LKG", prayer_group: group, baptism_name: "മത്തായി",
    });
    const head = t.as(IDS.headmaster);
    const [reg] = await head.select("registrations", { where: [["full_name", "eq", "Group Child"]] });
    expect([reg.prayer_group, reg.baptism_name]).toEqual([group, "മത്തായി"]);
    const id = await head.approveRegistration(reg.id, IDS.class2);
    const [seen] = await t.as(IDS.teacher2).select("students", { where: [["id", "eq", id]] });
    expect([seen.prayer_group, seen.baptism_name]).toEqual([group, "മത്തായി"]);
    await expect(head.update("students", { baptism_name: "x".repeat(121) }, [["id", "eq", id]])).rejects.toThrow(/baptism_name/);
    const [edited] = await head.update("students", { prayer_group: "St. George" }, [["id", "eq", id]]);
    expect(edited.prayer_group).toBe("St. George");
    await head.delete("students", [["id", "eq", id]]);
  });
});

describe("concurrent writers (real commits)", () => {
  it("certificate numbers never collide or skip", async () => {
    const issued = await Promise.all(Array.from({ length: 6 }, (_, i) =>
      t.as(IDS.headmaster).insert("certificates",
        { student_id: IDS.studentC1, type: "custom", title: `Race ${i}`, body_text: "Body" })));
    expect(issued.map((r) => r[0].certificate_no).sort())
      .toEqual([1, 2, 3, 4, 5, 6].map((n) => `CERT-2026-000${n}`));
  });

  it("only one of two simultaneous approvals succeeds", async () => {
    const head = t.as(IDS.headmaster);
    const [reg] = await head.select("registrations", { where: [["status", "eq", "pending"]] });
    const out = await Promise.allSettled([
      head.approveRegistration(reg.id, IDS.class1),
      t.as(IDS.headmaster).approveRegistration(reg.id, IDS.class1),
    ]);
    expect(out.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await head.count("students", [["full_name", "eq", reg.full_name]])).toBe(1);
  });

  it("two saves of the same attendance leave one row", async () => {
    const save = (status: "present" | "late") => t.as(IDS.teacher1).upsert("attendance",
      { student_id: IDS.studentC1, class_id: IDS.class1, date: "2026-10-18", status });
    await Promise.all([save("present"), save("late")]);
    expect(await t.as(IDS.headmaster).count("attendance", [["date", "eq", "2026-10-18"]])).toBe(1);
  });

  /** Start `attempt` while `sql` is uncommitted; it must wait and then see the change. */
  async function raceWith(sql: string, params: unknown[], attempt: () => Promise<unknown>) {
    let commit!: () => void;
    let locked!: () => void;
    const mayCommit = new Promise<void>((r) => (commit = r));
    const isLocked = new Promise<void>((r) => (locked = r));
    const change = t.database.transaction(async (tx) => {
      await tx.query(sql, params);
      locked();
      await mayCommit;
    });
    await isLocked;
    const result = attempt().then(() => "written", (e: Error) => e.message);
    await new Promise((r) => setTimeout(r, 1000));
    commit();
    await change;
    return result;
  }
  const mark = () => t.as(IDS.teacher1).upsert("marks",
    { exam_id: IDS.examC1, student_id: IDS.studentC1, subject_id: IDS.subjectOT, marks_obtained: 12 });

  it("a write racing a student's move sees the move", async () => {
    expect(await raceWith("update students set class_id = ? where id = ?", [IDS.class2, IDS.studentC1], mark))
      .toMatch(/row-level security/);
    await t.database.query("update students set class_id = ? where id = ?", [IDS.class1, IDS.studentC1]);
  });

  it("a write racing a removed assignment sees the removal", async () => {
    expect(await raceWith("delete from class_teachers where teacher_id = ?", [IDS.teacher1], mark))
      .toMatch(/row-level security/);
    await t.database.query("insert into class_teachers (class_id, teacher_id) values (?, ?)", [IDS.class1, IDS.teacher1]);
  });

  it("a write racing a deactivation sees the deactivation", async () => {
    expect(await raceWith("update profiles set active = false where id = ?", [IDS.teacher1], mark))
      .toMatch(/row-level security/);
  });
});

describe("registration rate-limit store", () => {
  it("counts and purges", async () => {
    const store = registrationAttempts(t.database);
    await store.record("hash");
    await store.record("hash");
    expect(await store.count("hash", new Date(Date.now() - 3600_000))).toBe(2);
    await store.purgeOlderThan!(new Date(Date.now() + 60_000));
    expect(await store.count("hash", new Date(Date.now() - 3600_000))).toBe(0);
  });
});
