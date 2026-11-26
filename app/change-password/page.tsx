import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LogOut } from "lucide-react";
import { signOut } from "@/actions/auth";
import { getSignedInUser, homeFor } from "@/lib/auth";
import { APP_NAME } from "@/lib/config";
import { Logo } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { ChangePasswordForm } from "@/components/account/change-password-form";

export const metadata: Metadata = { title: "Choose a new password" };

/** Shown after signing in with a temporary password: nothing else opens until it is replaced. */
export default async function ChangePasswordPage() {
  const user = await getSignedInUser();
  if (!user) redirect("/login");
  if (!user.mustChangePassword) redirect(homeFor(user.profile.role));

  return (
    <main className="flex flex-1 items-center justify-center bg-muted/40 px-4 py-8">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center text-center">
          <Logo size={64} />
          <p className="mt-3 text-sm text-muted-foreground">{APP_NAME}</p>
          <h1 className="mt-1 text-2xl font-semibold">Choose a new password</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Welcome, {user.profile.full_name}. You signed in with a temporary password.
            Choose your own password to continue.
          </p>
        </div>
        <ChangePasswordForm forced />
        <form action={signOut} className="text-center">
          <Button type="submit" variant="ghost" size="sm"><LogOut /> Sign out</Button>
        </form>
      </div>
    </main>
  );
}
