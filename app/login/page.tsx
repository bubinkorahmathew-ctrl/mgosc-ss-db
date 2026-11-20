import type { Metadata } from "next";
import Link from "next/link";
import { APP_NAME } from "@/lib/config";
import { Banner, LoginArt, Logo } from "@/components/brand";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" ? sp.next : undefined;
  const inactive = sp.reason === "inactive";

  return (
    <main className="flex flex-1 bg-muted/40">
      {/* tablets and computers: artwork on the left */}
      <div className="relative hidden w-[45%] max-w-2xl overflow-hidden md:block">
        <LoginArt className="absolute inset-0" />
      </div>

      <div className="flex flex-1 items-center justify-center px-4 py-8">
        <div className="w-full max-w-sm space-y-6">
          {/* phones: wide banner on top */}
          <Link href="/" aria-label="Home" className="block md:hidden"><Banner /></Link>
          <div className="flex flex-col items-center text-center">
            <Link href="/" className="mb-3 hidden rounded-full md:block" aria-label="Home"><Logo size={72} /></Link>
            <Link href="/" className="text-2xl font-semibold text-primary">{APP_NAME}</Link>
            <p className="mt-1 text-sm text-muted-foreground">Staff sign in</p>
          </div>
          {inactive && (
            <p role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              Your account is not active. Please contact the headmaster.
            </p>
          )}
          <LoginForm next={next} />
          <p className="text-center text-xs text-muted-foreground">
            Forgot your password? Ask the headmaster to reset it.
          </p>
        </div>
      </div>
    </main>
  );
}
