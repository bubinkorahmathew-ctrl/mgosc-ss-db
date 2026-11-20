import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { APP_NAME } from "@/lib/config";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Registration received" };

export default function RegisterSuccessPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-16 text-center">
      <CheckCircle2 className="size-14 text-emerald-600" aria-hidden />
      <h1 className="text-2xl font-semibold">Thank you! Registration received.</h1>
      <p className="max-w-md text-muted-foreground">
        The headmaster will review it and contact you on the phone number you gave.
      </p>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button render={<Link href="/register" />} nativeButton={false} variant="outline">Register another child</Button>
        <Button render={<Link href="/" />} nativeButton={false}>Back to {APP_NAME}</Button>
      </div>
    </main>
  );
}
