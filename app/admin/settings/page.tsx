import type { Metadata } from "next";
import { getSettings } from "@/lib/data/settings";
import { PageHeader } from "@/components/page-header";
import { SettingsForm, SignatureUpload } from "./settings-form";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const s = await getSettings();
  return (
    <>
      <PageHeader title="Settings" description="School details and certificate wording. The church banner is printed at the top of every report card and certificate." />
      <div className="space-y-6">
        <SignatureUpload url={s.signature_url} />
        <SettingsForm initial={{
          school_name: s.school_name, address: s.address ?? "", headmaster_name: s.headmaster_name ?? "",
          certificate_wording: s.certificate_wording,
        }} />
      </div>
    </>
  );
}
