import type { Metadata } from "next";
import Link from "next/link";
import { Banner } from "@/components/brand";
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
      <div className="mt-6"><RegistrationForm /></div>
    </main>
  );
}
