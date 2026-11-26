import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Loader2 } from "lucide-react";
import { Banner } from "@/components/brand";
import { getPrayerUnits } from "@/lib/repo/students";
import { RegistrationForm } from "./registration-form";

export const metadata: Metadata = { title: "Register a student" };

export default function RegisterPage() {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6">
      <Link href="/" aria-label="Home"><Banner /></Link>
      <h1 className="mt-6 text-2xl font-semibold tracking-tight">Sunday School registration</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Fill in your child&apos;s details. The headmaster will review the registration and assign a class.
        Fields marked <span className="text-destructive">*</span> are required.
      </p>
      <div className="mt-6">
        <Suspense fallback={<p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Loading the form…</p>}>
          <Form />
        </Suspense>
      </div>
    </main>
  );
}

/** The prayer units come from the database, so the form waits for them (at request time, never during the build). */
async function Form() {
  await connection();
  const units = (await getPrayerUnits(null)).filter((u) => u.active);
  return <RegistrationForm prayerUnits={units.map(({ id, name }) => ({ id, name }))} />;
}
