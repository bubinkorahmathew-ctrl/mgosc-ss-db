import type { Metadata } from "next";
import localFont from "next/font/local";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { APP_NAME } from "@/lib/config";
import { Banner, LoginArt, Logo } from "@/components/brand";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

// the certificate's display face, already bundled with the app
const cinzel = localFont({
  src: [
    { path: "../../public/fonts/certificate/cinzel-latin-600-normal.woff", weight: "600" },
    { path: "../../public/fonts/certificate/cinzel-latin-700-normal.woff", weight: "700" },
  ],
  display: "swap",
});

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" ? sp.next : undefined;
  const inactive = sp.reason === "inactive";

  return (
    <main className="flex flex-1 bg-[#FFF9ED]">
      {/* tablets and computers: the church artwork, framed in navy and gold */}
      <aside className="relative hidden w-[45%] shrink-0 overflow-hidden bg-[#183B70] p-6 md:block lg:p-8">
        <div className="relative h-full overflow-hidden rounded-2xl ring-1 ring-[#C6A04A]/70 shadow-2xl">
          <LoginArt className="absolute inset-0" />
        </div>
        <div aria-hidden className="pointer-events-none absolute inset-3 rounded-[1.4rem] border border-[#C6A04A]/40 lg:inset-4" />
      </aside>

      <section className="flex min-w-0 flex-1 flex-col bg-gradient-to-b from-white to-[#FFF9ED]">
        <div className="flex flex-1 items-center justify-center px-4 py-8 sm:px-8">
          <div className="w-full max-w-md">
            {/* phones: the wide banner on top */}
            <Link href="/" aria-label="Home" className="mb-6 block md:hidden"><Banner /></Link>

            <div className="flex flex-col items-center text-center">
              <Link href="/" aria-label="Home" className="rounded-full bg-white p-2 shadow-md ring-1 ring-[#C6A04A]/40">
                <Logo size={84} />
              </Link>
              <h1 className={`${cinzel.className} mt-5 text-2xl font-bold tracking-wide break-words text-[#183B70] sm:text-3xl lg:text-[2.1rem]`}>
                {APP_NAME}
              </h1>
              <div aria-hidden className="mt-3 flex items-center gap-2">
                <span className="h-px w-10 bg-[#C6A04A]" />
                <span className="size-1.5 rotate-45 bg-[#C6A04A]" />
                <span className="h-px w-10 bg-[#C6A04A]" />
              </div>
              <p className="mt-3 text-sm font-medium tracking-wide text-slate-600">
                Welcome Back <span className="mx-1.5 text-[#C6A04A]">|</span> Staff Portal
              </p>
            </div>

            {inactive && (
              <p role="alert" className="mt-6 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                Your account is not active. Please contact the headmaster.
              </p>
            )}

            <div className="mt-8 rounded-2xl border border-[#183B70]/10 bg-white p-6 shadow-xl shadow-[#183B70]/5 sm:p-8">
              <LoginForm next={next} />
            </div>
          </div>
        </div>
        <footer className="flex items-center justify-center gap-2 border-t border-[#C6A04A]/20 px-4 py-4 text-xs text-slate-500">
          <ShieldCheck className="size-4 text-[#C6A04A]" aria-hidden />
          Secure Staff Access <span className="text-[#C6A04A]">|</span> Student Management System
        </footer>
      </section>
    </main>
  );
}
