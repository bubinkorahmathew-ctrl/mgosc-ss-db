import Link from "next/link";
import { APP_NAME } from "@/lib/config";
import { Logo } from "@/components/brand";

/** The frame of the small sign-in pages (forgot / reset password), in the login page's style. */
export function AuthCard({ title, intro, children }: { title: string; intro?: React.ReactNode; children: React.ReactNode }) {
  return (
    <main className="flex flex-1 items-center justify-center bg-gradient-to-b from-white to-[#FFF9ED] px-4 py-10">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center text-center">
          <Link href="/login" aria-label="Sign in" className="rounded-full bg-white p-2 shadow-md ring-1 ring-[#C6A04A]/40">
            <Logo size={64} />
          </Link>
          <p className="mt-3 text-xs font-semibold tracking-[0.2em] text-[#C6A04A] uppercase">{APP_NAME}</p>
          <h1 className="mt-1 text-2xl font-semibold text-[#183B70]">{title}</h1>
          {intro && <p className="mt-2 text-sm text-slate-600">{intro}</p>}
        </div>
        <div className="mt-6 rounded-2xl border border-[#183B70]/10 bg-white p-6 shadow-xl shadow-[#183B70]/5 sm:p-8">
          {children}
        </div>
        <p className="mt-6 text-center text-sm">
          <Link href="/login" className="font-medium text-[#183B70] underline-offset-4 hover:underline">Back to sign in</Link>
        </p>
      </div>
    </main>
  );
}

export const authField =
  "h-12 w-full rounded-xl border border-[#183B70]/15 bg-white px-4 text-[15px] text-[#14233f] shadow-sm outline-none transition placeholder:text-slate-400 focus:border-[#183B70] focus:ring-4 focus:ring-[#183B70]/10 aria-invalid:border-red-500";
export const authButton =
  "relative flex h-12 w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-[#183B70] text-[15px] font-semibold text-white shadow-lg shadow-[#183B70]/25 transition hover:bg-[#14325f] disabled:opacity-70 after:absolute after:inset-x-0 after:bottom-0 after:h-[3px] after:bg-[#C6A04A]";
