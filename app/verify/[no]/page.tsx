import type { Metadata } from "next";
import { normaliseCertNo } from "@/lib/repo/verify";
import { VerifyLayout } from "../verify-layout";

export const metadata: Metadata = { title: "Verify a certificate" };

/** Target of the QR code printed on certificates. */
export default async function VerifyNumberPage({ params }: PageProps<"/verify/[no]">) {
  const { no } = await params;
  const raw = decodeURIComponent(no).slice(0, 40);
  return <VerifyLayout no={normaliseCertNo(raw)} raw={raw} />;
}
