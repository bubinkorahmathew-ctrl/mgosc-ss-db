import Link from "next/link";
import { Crown } from "lucide-react";
import type { CurrentUser } from "@/lib/auth";
import { listConfirmedToppers } from "@/lib/repo/toppers";
import { formatDate } from "@/lib/dates";

/** The latest confirmed toppers, as the viewer may see them (teachers: their classes). */
export async function RecentToppers({ user, classId, href, studentHref }: {
  user: CurrentUser; classId?: string; href: string; studentHref: string;
}) {
  const rows = await listConfirmedToppers(user, { classId, limit: 6 });
  if (!rows.length) return null;
  return (
    <section className="mt-6 rounded-xl border p-4" aria-labelledby="recent-toppers">
      <div className="mb-2 flex items-center justify-between">
        <h2 id="recent-toppers" className="flex items-center gap-2 font-semibold"><Crown className="size-5 text-amber-600" aria-hidden /> Toppers</h2>
        <Link href={href} className="text-sm text-primary underline">All toppers</Link>
      </div>
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((t) => (
          <li key={t.id} className="rounded-lg bg-amber-50 px-3 py-2 text-sm">
            <Link href={`${studentHref}/${t.studentId}`} className="font-medium hover:underline">{t.student}</Link>
            <span className="text-muted-foreground"> · {t.className}</span>
            <p className="text-xs text-muted-foreground">
              {t.type === "marks" ? "Class topper" : "Attendance topper"} · {t.what} · {t.value}% · {formatDate(t.periodEnd)}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
