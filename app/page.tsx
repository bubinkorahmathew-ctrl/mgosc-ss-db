import Link from "next/link";
import { APP_NAME } from "@/lib/config";
import { Banner } from "@/components/brand";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col items-center gap-8 px-4 py-6 text-center sm:py-10">
      <Banner />
      <div className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight text-primary sm:text-4xl">{APP_NAME}</h1>
        <p className="mx-auto max-w-md text-muted-foreground">
          Welcome! Parents can register a child for Sunday School using the form below.
        </p>
      </div>
      <div className="flex w-full max-w-xs flex-col gap-3">
        <Button size="lg" render={<Link href="/register" />} nativeButton={false}>Register a student</Button>
        <Button size="lg" variant="outline" render={<Link href="/verify" />} nativeButton={false}>Verify a certificate</Button>
        <Button size="lg" variant="ghost" render={<Link href="/login" />} nativeButton={false}>Staff sign in</Button>
      </div>
    </main>
  );
}
