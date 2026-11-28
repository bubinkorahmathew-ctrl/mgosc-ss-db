import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Check, Minus, School } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { RIGHTS, ROLES, type RightLevel } from "@/lib/roles";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "User rights" };

function Level({ level }: { level: RightLevel }) {
  if (level === "yes") return <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400"><Check className="size-4" /> Yes</span>;
  if (level === "own") return <span className="inline-flex items-center gap-1 text-blue-700 dark:text-blue-400"><School className="size-4" /> Own classes</span>;
  return <span className="inline-flex items-center gap-1 text-muted-foreground"><Minus className="size-4" /> No</span>;
}

/** Super admin only: what each role can do. Read-only. */
export default async function RightsPage() {
  const user = await requireRole("admin");
  if (!user.superAdmin) redirect("/admin");

  return (
    <>
      <PageHeader title="User rights" description="What each role can do, and who has which role." />
      <div className="space-y-6">
        <Card>
          <CardHeader><CardTitle>Roles</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <ul className="grid gap-2 sm:grid-cols-3">
              {ROLES.map((r) => (
                <li key={r.key} className="rounded-lg border p-3">
                  <p className="font-medium">{r.label}</p>
                  <p className="text-sm text-muted-foreground">{r.about}</p>
                </li>
              ))}
            </ul>
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th scope="col" className="px-3 py-2 text-left font-medium">Right</th>
                    {ROLES.map((r) => <th key={r.key} scope="col" className="px-3 py-2 text-left font-medium whitespace-nowrap">{r.label}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {RIGHTS.map((r) => (
                    <tr key={r.label}>
                      <th scope="row" className="px-3 py-2 text-left font-normal">{r.label}</th>
                      <td className="px-3 py-2 whitespace-nowrap"><Level level={r.super} /></td>
                      <td className="px-3 py-2 whitespace-nowrap"><Level level={r.admin} /></td>
                      <td className="px-3 py-2 whitespace-nowrap"><Level level={r.teacher} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <p className="text-sm text-muted-foreground">
          Who has which role, designation and classes: see the <Link href="/admin/users" className="text-primary underline">Users</Link> page.
        </p>
      </div>
    </>
  );
}
