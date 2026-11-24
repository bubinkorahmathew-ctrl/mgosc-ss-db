"use client";

import { useEffect, useTransition } from "react";
import { toast } from "sonner";
import { Download, ExternalLink, Loader2, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * A PDF fetched into this page as a blob. The app forbids framing its own URLs
 * (X-Frame-Options: DENY), but a blob: URL made here can be shown and printed in-page.
 */
export async function fetchPdfBlobUrl(url: string, init?: RequestInit): Promise<string> {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error((await res.text()) || "Could not make the PDF.");
  return URL.createObjectURL(await res.blob());
}

/** Print a PDF without leaving the page: load it into a hidden frame and open the print dialog. */
function printBlobUrl(blobUrl: string) {
  const frame = document.createElement("iframe");
  frame.style.position = "fixed";
  frame.style.width = "0";
  frame.style.height = "0";
  frame.style.border = "0";
  frame.src = blobUrl;
  frame.onload = () => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    // leave it long enough for the print dialog to read it
    setTimeout(() => frame.remove(), 60_000);
  };
  document.body.appendChild(frame);
}

/** Open, Download and Print for an issued PDF. */
export function PdfActions({ href, size = "default" }: { href: string; size?: "default" | "lg" }) {
  const [pending, start] = useTransition();
  const sep = href.includes("?") ? "&" : "?";
  const print = () => start(async () => {
    try {
      printBlobUrl(await fetchPdfBlobUrl(href));
    } catch (e) {
      toast.error((e as Error).message);
    }
  });
  return (
    <>
      <Button size={size} nativeButton={false} render={<a href={href} target="_blank" rel="noopener" />}>
        <ExternalLink /> Open
      </Button>
      <Button size={size} variant="outline" nativeButton={false} render={<a href={`${href}${sep}download=1`} />}>
        <Download /> Download
      </Button>
      <Button size={size} variant="outline" onClick={print} disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : <Printer />} Print
      </Button>
    </>
  );
}

/** The PDF shown inside the page. `src` is a blob: URL, revoked when it changes. */
export function PdfFrame({ src, title }: { src: string; title: string }) {
  useEffect(() => () => URL.revokeObjectURL(src), [src]);
  return <iframe src={src} title={title} className="h-[70vh] w-full rounded-xl border bg-muted" />;
}
