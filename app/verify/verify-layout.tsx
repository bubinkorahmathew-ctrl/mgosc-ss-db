import { Suspense } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { Banner } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { VerifyResult } from "./verify-result";

export function VerifyLayout({ no, raw }: { no: string | null; raw?: string }) {
  return (
    <main className="mx-auto w-full max-w-xl flex-1 space-y-6 px-4 py-6">
      <Link href="/" aria-label="Home"><Banner /></Link>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Verify a certificate</h1>
        <p className="mt-1 text-sm text-muted-foreground">Enter the number printed under the QR code, e.g. CERT-2026-0001.</p>
      </div>
      <form action="/verify" method="get" className="flex gap-2">
        <label htmlFor="no" className="sr-only">Certificate number</label>
        <Input id="no" name="no" defaultValue={no ?? raw ?? ""} placeholder="CERT-2026-0001" autoComplete="off"
          className="h-11 font-mono uppercase" required maxLength={20} />
        <Button type="submit" size="lg">Check</Button>
      </form>
      {raw && !no && <p role="alert" className="text-sm text-destructive">That does not look like a certificate number.</p>}
      {no && (
        <Suspense fallback={<p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Checking…</p>}>
          <VerifyResult no={no} />
        </Suspense>
      )}
    </main>
  );
}
