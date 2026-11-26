import type { Metadata } from "next";
import { LogOut } from "lucide-react";
import { signOut } from "@/actions/auth";
import { requireRole } from "@/lib/auth";
import { APP_NAME } from "@/lib/config";
import { Logo } from "@/components/brand";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "OVBS" };

/** OVBS staff home. The OVBS pages themselves come with the OVBS phase. */
export default async function OvbsHome() {
  const user = await requireRole("ovbs_teacher");
  return (
    <main className="flex flex-1 items-center justify-center bg-muted/40 px-4 py-8">
      <div className="w-full max-w-md space-y-4 text-center">
        <Logo size={64} className="mx-auto" />
        <p className="text-sm text-muted-foreground">{APP_NAME}</p>
        <h1 className="text-2xl font-semibold">Welcome, {user.profile.full_name}</h1>
        <p className="text-sm text-muted-foreground">The OVBS pages are not ready yet.</p>
        <form action={signOut}>
          <Button type="submit" variant="outline"><LogOut /> Sign out</Button>
        </form>
      </div>
    </main>
  );
}
