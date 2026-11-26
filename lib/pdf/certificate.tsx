import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import QRCode from "qrcode";
import { renderToBuffer } from "@react-pdf/renderer";
import {
  CertificateBundle, CertificateDocument, registerCertificateFonts, type CertificateProps, type Signatory,
} from "@/components/certificate/Certificate";
import { certificateAccent, certificateSubtitle, issueDateText, type DesignType } from "@/lib/certificate-design";
import { certificateDetails, type PdfCertificate } from "@/lib/repo/certificates";
import { getSettings } from "@/lib/repo/settings";
import { publicEnv } from "@/lib/env";
import type { CurrentUser } from "@/lib/auth";
import { loadBrandingImage, type PdfImage } from "./images";

/** Fonts and banner ship with the app (next.config outputFileTracingIncludes). */
const FONT_DIR = path.join(process.cwd(), "public", "fonts", "certificate");

/**
 * The header banner as a data URL, read once. A plain file path would do on Linux, but react-pdf
 * reads "D:\..." on Windows as a URL and silently drops the image.
 */
let headerImage: Promise<string> | undefined;
export const loadHeaderImage = () => (headerImage ??= fs.readFile(path.join(process.cwd(), "public", "images", "church-header.jpg"))
  .then((b) => `data:image/jpeg;base64,${b.toString("base64")}`)
  .catch((e) => { headerImage = undefined; throw e; }));

/** Same colour as the README example, so the QR scans on every theme. */
const QR_COLOR = "#14285a";

export function verifyUrl(certificateNo: string) {
  return `${publicEnv.siteUrl().replace(/\/$/, "")}/verify/${encodeURIComponent(certificateNo)}`;
}

const dataUrl = (img: PdfImage | null) =>
  img ? `data:image/${img.format === "png" ? "png" : "jpeg"};base64,${img.data.toString("base64")}` : undefined;

/** Names and signature images from Settings. No image: the line stays blank for signing by hand. */
export async function loadSignatories(user: CurrentUser): Promise<{ vicar: Signatory; headmaster: Signatory }> {
  const s = await getSettings(user);
  const [vicar, headmaster] = await Promise.all([
    loadBrandingImage(user, s.vicar_signature_url, "vicar"), loadBrandingImage(user, s.signature_url, "headmaster"),
  ]);
  return {
    vicar: { name: s.vicar_name ?? "", signatureUrl: dataUrl(vicar) },
    headmaster: { name: s.headmaster_name ?? "", signatureUrl: dataUrl(headmaster) },
  };
}

/**
 * One PDF, one certificate per page, in the order given. The wording is used exactly as stored;
 * nothing on an issued certificate is recomputed except the facts row (rank, percentage,
 * attendance). `preview`: not issued yet, so there is no number to verify and no QR code.
 */
export async function renderCertificates(user: CurrentUser, certs: PdfCertificate[], opts: {
  preview?: boolean;
  /** given by tests; otherwise read from Settings */
  signatories?: { vicar: Signatory; headmaster: Signatory };
  /** given by tests; otherwise worked out from the database */
  details?: Map<string, { label: string; value: string }[]>;
} = {}): Promise<Buffer> {
  registerCertificateFonts(FONT_DIR);
  const [signatories, details, header] = await Promise.all([
    opts.signatories ?? loadSignatories(user), opts.details ?? certificateDetails(user, certs), loadHeaderImage(),
  ]);

  const items: CertificateProps[] = await Promise.all(certs.map(async (c) => {
    const url = verifyUrl(c.certificate_no);
    return {
      subtitle: certificateSubtitle(c.type as DesignType, c.title),
      studentName: c.student_name,
      studentNameMl: c.student_name_ml ?? undefined,
      body: c.body_text,
      details: details.get(c.key),
      issueDate: issueDateText(c.issued_on),
      certificateNo: c.certificate_no,
      verifyUrl: opts.preview ? "Preview - not issued yet" : url.replace(/^https?:\/\//, ""),
      qrDataUrl: opts.preview ? undefined
        : await QRCode.toDataURL(url, { margin: 0, width: 240, color: { dark: QR_COLOR, light: "#00000000" } }),
      vicar: signatories.vicar,
      headmaster: signatories.headmaster,
      accent: certificateAccent(c.type as DesignType),
      headerImage: header,
      revoked: c.revoked,
    };
  }));
  return renderToBuffer(items.length === 1 ? <CertificateDocument {...items[0]} /> : <CertificateBundle items={items} />);
}
