import { BadgeCheck, CircleX, SearchX } from "lucide-react";
import { CERT_LABELS } from "@/lib/certificates";
import { formatDate } from "@/lib/dates";
import { verifyCertificate } from "@/lib/data/verify";

export async function VerifyResult({ no }: { no: string }) {
  const r = await verifyCertificate(no);
  if (!r) {
    return (
      <div role="status" className="flex gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-left text-amber-950">
        <SearchX className="mt-0.5 size-6 shrink-0" />
        <div><p className="font-semibold">No certificate found</p>
          <p className="text-sm">There is no certificate with number <span className="font-mono">{no}</span>. Please check the number.</p></div>
      </div>
    );
  }
  return r.valid ? (
    <div role="status" className="flex gap-3 rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-left text-emerald-950">
      <BadgeCheck className="mt-0.5 size-6 shrink-0" />
      <div className="space-y-1">
        <p className="font-semibold">Valid certificate</p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 text-sm">
          <dt className="text-emerald-800">Number</dt><dd className="font-mono">{no}</dd>
          <dt className="text-emerald-800">Student</dt><dd>{r.student_name}</dd>
          <dt className="text-emerald-800">Type</dt><dd>{CERT_LABELS[r.type]}</dd>
          <dt className="text-emerald-800">Issued on</dt><dd>{formatDate(r.issued_on)}</dd>
        </dl>
      </div>
    </div>
  ) : (
    <div role="status" className="flex gap-3 rounded-xl border border-red-300 bg-red-50 p-4 text-left text-red-950">
      <CircleX className="mt-0.5 size-6 shrink-0" />
      <div><p className="font-semibold">This certificate has been revoked</p>
        <p className="text-sm">Certificate <span className="font-mono">{no}</span> is no longer valid.</p></div>
    </div>
  );
}
