import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { checkResetLink } from "@/lib/authn/session";
import { AuthCard, authButton } from "@/components/auth/auth-card";
import { ResetForm } from "./reset-form";

export const metadata: Metadata = { title: "Choose a new password" };

export default function ResetPasswordPage({ searchParams }: PageProps<"/reset-password">) {
  return (
    <AuthCard title="Choose a new password">
      <Suspense fallback={<p className="text-sm text-slate-500">Checking the link…</p>}>
        <Body searchParams={searchParams} />
      </Suspense>
    </AuthCard>
  );
}

/** Reads the link at request time (never during the build), and says at once if it can't be used. */
async function Body({ searchParams }: Pick<PageProps<"/reset-password">, "searchParams">) {
  await connection();
  const sp = await searchParams;
  const token = typeof sp.token === "string" ? sp.token : "";
  if (!token || !(await checkResetLink(token))) {
    return (
      <div className="space-y-4 text-sm text-slate-700">
        <p role="alert">This link is invalid, already used or expired. Reset links work once, for 1 hour.</p>
        <Link href="/forgot-password" className={authButton}>Get a new link</Link>
      </div>
    );
  }
  return <ResetForm token={token} />;
}
