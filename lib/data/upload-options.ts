import "server-only";
import { getUserDb } from "@/lib/auth";
import { getClassOptions } from "@/lib/data/classes";
import { formatDate } from "@/lib/dates";

/** Classes and exams for the bulk upload page, as far as the policies let the user see them. */
export async function getUploadOptions() {
  const db = await getUserDb();
  const [classes, exams] = await Promise.all([
    getClassOptions(),
    db.select("exams", { order: [{ column: "exam_date", ascending: false }, { column: "name" }] }),
  ]);
  const label = (c: (typeof classes)[number]) => (c.isCurrent ? c.label : `${c.label} (${c.yearName})`);
  const byId = new Map(classes.map((c) => [c.id, c]));
  const order = new Map(classes.map((c, i) => [c.id, i]));
  return {
    classes: classes.map((c) => ({ id: c.id, label: label(c) })),
    currentClasses: classes.filter((c) => c.isCurrent).map((c) => ({ id: c.id, label: label(c) })),
    exams: exams
      .filter((e) => byId.has(e.class_id))
      .sort((a, b) => order.get(a.class_id)! - order.get(b.class_id)!) // stable: keeps newest first per class
      .map((e) => ({
        id: e.id,
        label: `${label(byId.get(e.class_id)!)} · ${e.name}${e.exam_date ? ` (${formatDate(e.exam_date)})` : ""}`,
      })),
  };
}
