# MGOSC SS DB Hub – certificate template

A4 landscape certificate (react-pdf) with the church / OSSAE header, ornamental
borders, gold seal, QR code, and signature blocks for the Vicar and the Headmaster.
Three colour themes: navy (merit), burgundy (class topper), teal (attendance).
English name plus optional Malayalam name.

## Files
- components/certificate/Certificate.tsx  – the design (CertificatePage, CertificateDocument, CertificateBundle)
- public/fonts/certificate/*.woff          – Cinzel, Great Vibes, Cormorant Garamond, Noto Serif Malayalam (open fonts, SIL OFL)
- public/images/church-header.jpg          – header banner
- scripts/render-sample.tsx                – renders sample PDFs (run: npx tsx scripts/render-sample.tsx, adjust paths)
- samples/                                 – sample PDFs, including a 3-page bulk test

## Install
npm i @react-pdf/renderer qrcode

## Use (Next.js route handler, Node runtime)
```ts
// app/api/certificates/[no]/pdf/route.ts
import path from "path";
import QRCode from "qrcode";
import { renderToBuffer } from "@react-pdf/renderer";
import { CertificateDocument, registerCertificateFonts } from "@/components/certificate/Certificate";

export const runtime = "nodejs";

export async function GET(_: Request, { params }: { params: { no: string } }) {
  registerCertificateFonts(path.join(process.cwd(), "public/fonts/certificate"));
  const c = await loadCertificateFromDb(params.no); // your existing data, wording already filled in
  const verifyUrl = `${process.env.NEXT_PUBLIC_SITE_URL}/verify/${c.certificate_no}`;
  const qrDataUrl = await QRCode.toDataURL(verifyUrl, { margin: 0, width: 240, color: { dark: "#14285a", light: "#00000000" } });
  const pdf = await renderToBuffer(
    <CertificateDocument
      subtitle={c.subtitle}            // OF MERIT / OF EXCELLENCE · CLASS TOPPER / OF ATTENDANCE
      studentName={c.student_name}
      studentNameMl={c.student_name_ml}
      body={c.body_text}
      details={c.details}              // [{label:"Class", value:"6"}, ...]
      issueDate={c.issue_date_text}
      certificateNo={c.certificate_no}
      verifyUrl={verifyUrl.replace(/^https?:\/\//, "")}
      qrDataUrl={qrDataUrl}
      vicar={{ name: s.vicar_name, signatureUrl: s.vicar_signature_url }}
      headmaster={{ name: s.headmaster_name, signatureUrl: s.headmaster_signature_url }}
      accent={c.type === "class_topper" ? "burgundy" : c.type === "attendance" || c.type === "attendance_topper" ? "teal" : "navy"}
      headerImage={path.join(process.cwd(), "public/images/church-header.jpg")}
    />
  );
  return new Response(pdf, { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${c.certificate_no}.pdf"` } });
}
```
For a whole class use `<CertificateBundle items={[...]} />` (one certificate per page).

## Vercel note
Fonts and the header image are read from disk, so include them in the serverless bundle in next.config.js:
```js
experimental: { outputFileTracingIncludes: { "/api/certificates/**": ["./public/fonts/certificate/**", "./public/images/church-header.jpg"] } }
```
(On newer Next.js versions the option may sit at the top level as outputFileTracingIncludes.)

## Signatures
Upload a PNG with a transparent background for each signature (Vicar, Headmaster) and pass it as signatureUrl.
Without an image the signature line stays blank for hand signing after printing.
