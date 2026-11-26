import type { Metadata } from "next";
import { normaliseCertNo } from "@/lib/repo/verify";
import { VerifyLayout } from "./verify-layout";

export const metadata: Metadata = { title: "Verify a certificate" };

export default async function VerifyPage({ searchParams }: PageProps<"/verify">) {
  const sp = await searchParams;
  const raw = typeof sp.no === "string" ? sp.no.slice(0, 40) : undefined;
  return <VerifyLayout no={normaliseCertNo(raw)} raw={raw} />;
}
