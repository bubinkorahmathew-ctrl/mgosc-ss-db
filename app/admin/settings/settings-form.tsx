"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Save, Trash2, Upload } from "lucide-react";
import { saveBrandingImage, saveSettings } from "@/actions/settings";
import { createClient } from "@/lib/supabase/client";
import { CERT_LABELS, CERTIFICATE_TYPES, PLACEHOLDER_HELP, PLACEHOLDERS } from "@/lib/certificates";
import type { CertificateType } from "@/lib/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/form/field";

type Initial = {
  school_name: string; address: string; headmaster_name: string;
  certificate_wording: Partial<Record<CertificateType, string>>;
};

export function SettingsForm({ initial }: { initial: Initial }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [v, setV] = useState(initial);
  const [wording, setWording] = useState<Record<CertificateType, string>>(
    Object.fromEntries(CERTIFICATE_TYPES.map((t) => [t, initial.certificate_wording[t] ?? ""])) as Record<CertificateType, string>);
  const [errors, setErrors] = useState<Record<string, string[]>>();

  const save = () => start(async () => {
    const res = await saveSettings({ ...v, certificate_wording: wording });
    if (!res.ok) { setErrors(res.fieldErrors); toast.error(res.error); return; }
    setErrors(undefined);
    toast.success(res.message ?? "Saved.");
    router.refresh();
  });

  return (
    <>
      <Card>
        <CardHeader><CardTitle>School</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field id="st-name" label="School name" required error={errors?.school_name?.[0]} hint="Used in page titles and PDF file details.">
            <Input id="st-name" value={v.school_name} onChange={(e) => setV({ ...v, school_name: e.target.value })} />
          </Field>
          <Field id="st-hm" label="Headmaster name" error={errors?.headmaster_name?.[0]} hint="Printed under the headmaster's signature.">
            <Input id="st-hm" value={v.headmaster_name} onChange={(e) => setV({ ...v, headmaster_name: e.target.value })} />
          </Field>
          <Field id="st-addr" label="Address" error={errors?.address?.[0]} className="sm:col-span-2">
            <Input id="st-addr" value={v.address} onChange={(e) => setV({ ...v, address: e.target.value })} />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Certificate wording</CardTitle>
          <p className="text-sm text-muted-foreground">
            The default text for each type; it can still be changed when issuing. Placeholders:{" "}
            {PLACEHOLDERS.map((p) => <span key={p} className="mr-2 whitespace-nowrap"><code className="font-mono">{`{${p}}`}</code> = {PLACEHOLDER_HELP[p]}</span>)}
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {CERTIFICATE_TYPES.map((t) => (
            <Field key={t} id={`st-w-${t}`} label={CERT_LABELS[t]} error={errors?.[`certificate_wording.${t}`]?.[0]}>
              <Textarea id={`st-w-${t}`} rows={3} value={wording[t]} onChange={(e) => setWording({ ...wording, [t]: e.target.value })} />
            </Field>
          ))}
        </CardContent>
      </Card>

      <div className="sticky bottom-16 z-20 lg:bottom-4">
        <Button size="lg" className="w-full shadow-lg sm:w-auto" onClick={save} disabled={pending || !v.school_name.trim()}>
          {pending ? <Loader2 className="animate-spin" /> : <Save />} Save settings
        </Button>
      </div>
    </>
  );
}

const MAX_BYTES = 1_000_000;

/** Uploads straight to the public "branding" bucket (storage RLS: headmaster only), then saves the URL. */
export function SignatureUpload({ url }: { url: string | null }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();

  const upload = (file: File) => start(async () => {
    if (!["image/png", "image/jpeg"].includes(file.type)) { toast.error("Please choose a PNG or JPG image."); return; }
    if (file.size > MAX_BYTES) { toast.error("The image must be smaller than 1 MB."); return; }
    const supabase = createClient();
    const path = `signature.${file.type === "image/png" ? "png" : "jpg"}`;
    const { error } = await supabase.storage.from("branding").upload(path, file, { upsert: true, contentType: file.type, cacheControl: "60" });
    if (error) { toast.error("Upload failed. Please try again."); return; }
    const publicUrl = `${supabase.storage.from("branding").getPublicUrl(path).data.publicUrl}?v=${Date.now()}`;
    const res = await saveBrandingImage({ kind: "signature", url: publicUrl });
    if (!res.ok) { toast.error(res.error); return; }
    toast.success("Signature saved.");
    router.refresh();
  });

  const remove = () => start(async () => {
    const res = await saveBrandingImage({ kind: "signature", url: null });
    if (!res.ok) { toast.error(res.error); return; }
    toast.success("Signature removed.");
    router.refresh();
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Headmaster&apos;s signature</CardTitle>
        <p className="text-sm text-muted-foreground">Printed on certificates and report cards. Best: a PNG with a transparent background, about 600 × 200 pixels.</p>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-4">
        <div className="flex h-24 w-64 items-center justify-center rounded-lg border bg-white">
          {/* eslint-disable-next-line @next/next/no-img-element -- user-uploaded image from storage */}
          {url ? <img src={url} alt="Current signature" className="max-h-20 max-w-60 object-contain" /> : <span className="text-sm text-muted-foreground">No signature yet</span>}
        </div>
        <input ref={input} type="file" accept="image/png,image/jpeg" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) upload(f); }} />
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => input.current?.click()} disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : <Upload />} {url ? "Replace" : "Upload"}
          </Button>
          {url && <Button variant="ghost" onClick={remove} disabled={pending}><Trash2 /> Remove</Button>}
        </div>
      </CardContent>
    </Card>
  );
}
